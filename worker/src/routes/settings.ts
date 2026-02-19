import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware, createToken } from '../auth';
import { verifyBasenameOwnership, getBasenameExpiry } from '../basename-lookup';

export const settingsRoutes = new Hono<AppBindings>();

// ── Auto-migrate: ensure basename_aliases table + notification_email column exist ──
let migrated = false;
settingsRoutes.use('/*', async (c, next) => {
  if (!migrated) {
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS basename_aliases (
          id TEXT PRIMARY KEY, wallet TEXT NOT NULL, handle TEXT NOT NULL,
          basename TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0,
          expiry INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (wallet) REFERENCES accounts(wallet))`),
        c.env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_handle ON basename_aliases(handle)`),
        c.env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_alias_wallet ON basename_aliases(wallet)`),
      ]);
    } catch (e) {
      console.error('Settings migration (tables):', e);
    }
    // Add notification_email column if missing
    try {
      await c.env.DB.prepare(`ALTER TABLE accounts ADD COLUMN notification_email TEXT`).run();
    } catch {
      // Column likely already exists
    }
    migrated = true;
  }
  await next();
});

settingsRoutes.use('/*', authMiddleware());

/**
 * GET /api/settings
 * Return account settings including notification_email & all aliases
 */
settingsRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const account = await c.env.DB.prepare(
    'SELECT handle, wallet, basename, webhook_url, notification_email FROM accounts WHERE wallet = ?'
  ).bind(auth.wallet).first<{
    handle: string; wallet: string; basename: string | null;
    webhook_url: string | null; notification_email: string | null;
  }>();

  if (!account) return c.json({ error: 'Account not found' }, 404);

  const aliases = await c.env.DB.prepare(
    'SELECT id, handle, basename, is_primary, expiry, created_at FROM basename_aliases WHERE wallet = ? ORDER BY is_primary DESC, created_at ASC'
  ).bind(auth.wallet).all();

  return c.json({
    handle: account.handle,
    wallet: account.wallet,
    basename: account.basename,
    notification_email: account.notification_email,
    webhook_url: account.webhook_url,
    aliases: aliases.results || [],
  });
});

/**
 * PUT /api/settings
 * Update notification_email
 */
settingsRoutes.put('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const { notification_email } = await c.req.json<{ notification_email?: string }>();

  await c.env.DB.prepare(
    'UPDATE accounts SET notification_email = ? WHERE wallet = ?'
  ).bind(notification_email || null, auth.wallet).run();

  return c.json({ success: true, notification_email: notification_email || null });
});

/**
 * POST /api/settings/alias
 * Add a basename alias (verify ownership on-chain via ownerOf)
 */
settingsRoutes.post('/alias', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const { basename } = await c.req.json<{ basename: string }>();
  if (!basename || !basename.endsWith('.base.eth')) {
    return c.json({ error: 'Invalid basename (must end with .base.eth)' }, 400);
  }

  // Verify on-chain ownership
  const ownership = await verifyBasenameOwnership(basename, auth.wallet);
  if (!ownership.valid) {
    return c.json({ error: ownership.error }, 403);
  }

  const handle = ownership.name;

  // Check if handle is already taken by another wallet
  const existingAccount = await c.env.DB.prepare(
    'SELECT wallet FROM accounts WHERE handle = ?'
  ).bind(handle).first<{ wallet: string }>();
  if (existingAccount && existingAccount.wallet.toLowerCase() !== auth.wallet.toLowerCase()) {
    return c.json({ error: 'This handle is already registered by another wallet' }, 409);
  }

  const existingAlias = await c.env.DB.prepare(
    'SELECT wallet FROM basename_aliases WHERE handle = ?'
  ).bind(handle).first<{ wallet: string }>();
  if (existingAlias && existingAlias.wallet.toLowerCase() !== auth.wallet.toLowerCase()) {
    return c.json({ error: 'This handle is already claimed by another wallet' }, 409);
  }

  // Get expiry
  let expiry = 0;
  try { expiry = await getBasenameExpiry(basename); } catch {}

  const id = `alias-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  await c.env.DB.prepare(
    `INSERT INTO basename_aliases (id, wallet, handle, basename, is_primary, expiry)
     VALUES (?, ?, ?, ?, 0, ?)
     ON CONFLICT(handle) DO UPDATE SET expiry = ?, basename = ?`
  ).bind(id, auth.wallet, handle, basename, expiry || null, expiry || null, basename).run();

  return c.json({ success: true, handle, basename, expiry: expiry || null });
});

/**
 * DELETE /api/settings/alias/:handle
 * Remove a basename alias
 */
settingsRoutes.delete('/alias/:handle', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const handle = c.req.param('handle').toLowerCase();

  // Can't delete current primary
  if (handle === auth.handle) {
    return c.json({ error: 'Cannot delete your current primary handle' }, 400);
  }

  await c.env.DB.prepare(
    'DELETE FROM basename_aliases WHERE handle = ? AND wallet = ?'
  ).bind(handle, auth.wallet).run();

  return c.json({ success: true });
});

/**
 * PUT /api/settings/primary
 * Switch primary handle
 */
settingsRoutes.put('/primary', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const { handle: newHandle } = await c.req.json<{ handle: string }>();
  if (!newHandle) return c.json({ error: 'handle is required' }, 400);

  // Verify the alias belongs to this wallet
  const alias = await c.env.DB.prepare(
    'SELECT handle, basename FROM basename_aliases WHERE handle = ? AND wallet = ?'
  ).bind(newHandle, auth.wallet).first<{ handle: string; basename: string }>();

  if (!alias) {
    return c.json({ error: 'Alias not found or does not belong to this wallet' }, 404);
  }

  const oldHandle = auth.handle;

  // Check new handle not taken by another account
  const existing = await c.env.DB.prepare(
    'SELECT wallet FROM accounts WHERE handle = ? AND wallet != ?'
  ).bind(newHandle, auth.wallet).first();
  if (existing) {
    return c.json({ error: 'Handle already taken by another wallet' }, 409);
  }

  // Batch update: switch primary
  await c.env.DB.batch([
    c.env.DB.prepare("PRAGMA defer_foreign_keys = ON"),
    // Update account handle
    c.env.DB.prepare('UPDATE accounts SET handle = ?, basename = ? WHERE wallet = ?')
      .bind(newHandle, alias.basename, auth.wallet),
    // Migrate emails
    c.env.DB.prepare('UPDATE emails SET handle = ? WHERE handle = ?')
      .bind(newHandle, oldHandle),
    // Reset all is_primary flags for this wallet
    c.env.DB.prepare('UPDATE basename_aliases SET is_primary = 0 WHERE wallet = ?')
      .bind(auth.wallet),
    // Set new primary
    c.env.DB.prepare('UPDATE basename_aliases SET is_primary = 1 WHERE handle = ? AND wallet = ?')
      .bind(newHandle, auth.wallet),
  ]);

  // Issue new token
  const secret = c.env.JWT_SECRET!;
  const newToken = await createToken({ wallet: auth.wallet, handle: newHandle }, secret);

  return c.json({
    success: true,
    handle: newHandle,
    old_handle: oldHandle,
    basename: alias.basename,
    token: newToken,
  });
});
