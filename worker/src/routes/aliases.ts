import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';
import { verifyBasenameOwnership } from '../basename-lookup';

export const aliasRoutes = new Hono<AppBindings>();

// Auto-migrate: create basename_aliases table if not exists
let migrated = false;
aliasRoutes.use('/*', authMiddleware(), async (c, next) => {
  if (!migrated) {
    migrated = true;
    try {
      await c.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS basename_aliases (
          handle TEXT PRIMARY KEY,
          wallet TEXT NOT NULL,
          primary_handle TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )`
      ).run();
    } catch {}
  }
  await next();
});

/**
 * GET /api/aliases
 * List all basename aliases for the authenticated wallet
 */
aliasRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  let wallet = auth.wallet;
  if (!wallet) {
    const acct = await c.env.DB.prepare('SELECT wallet FROM accounts WHERE handle = ?')
      .bind(auth.handle).first<{ wallet: string }>();
    wallet = acct?.wallet || '';
  }
  if (!wallet) {
    return c.json({ error: 'Wallet not found' }, 400);
  }

  const aliases = await c.env.DB.prepare(
    'SELECT handle, primary_handle, created_at FROM basename_aliases WHERE wallet = ?'
  ).bind(wallet.toLowerCase()).all<{ handle: string; primary_handle: string; created_at: number }>();

  return c.json({
    primary_handle: auth.handle,
    primary_email: `${auth.handle}@basemail.ai`,
    aliases: (aliases.results || []).map(a => ({
      handle: a.handle,
      email: `${a.handle}@basemail.ai`,
      basename: `${a.handle}.base.eth`,
      created_at: a.created_at,
    })),
  });
});

/**
 * POST /api/aliases
 * Add a basename alias (on-chain verified)
 * Body: { handle: "canflyai" } or { basename: "canflyai.base.eth" }
 */
aliasRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  const { handle: aliasHandle, basename } = await c.req.json<{
    handle?: string;
    basename?: string;
  }>();

  // Accept either handle or full basename
  const name = aliasHandle || (basename ? basename.replace(/\.base\.eth$/, '') : null);
  if (!name) {
    return c.json({ error: 'handle or basename is required' }, 400);
  }

  // Can't alias to your own primary
  if (name === auth.handle) {
    return c.json({ error: 'Cannot add your primary handle as an alias' }, 400);
  }

  // Resolve wallet
  let wallet = auth.wallet;
  if (!wallet) {
    const acct = await c.env.DB.prepare('SELECT wallet FROM accounts WHERE handle = ?')
      .bind(auth.handle).first<{ wallet: string }>();
    wallet = acct?.wallet || '';
  }
  if (!wallet) {
    return c.json({ error: 'Wallet not found' }, 400);
  }

  // On-chain verify ownership
  const verification = await verifyBasenameOwnership(`${name}.base.eth`, wallet);
  if (!verification.valid) {
    return c.json({ error: verification.error }, 403);
  }

  // Check not taken by another wallet
  const existingAlias = await c.env.DB.prepare(
    'SELECT wallet FROM basename_aliases WHERE handle = ?'
  ).bind(name).first<{ wallet: string }>();
  if (existingAlias && existingAlias.wallet.toLowerCase() !== wallet.toLowerCase()) {
    return c.json({ error: `${name} is already registered as an alias by another wallet` }, 409);
  }

  const existingPrimary = await c.env.DB.prepare(
    'SELECT wallet FROM accounts WHERE handle = ?'
  ).bind(name).first<{ wallet: string }>();
  if (existingPrimary && existingPrimary.wallet.toLowerCase() !== wallet.toLowerCase()) {
    return c.json({ error: `${name} is already registered by another wallet` }, 409);
  }

  // Insert alias
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO basename_aliases (handle, wallet, primary_handle, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(name, wallet.toLowerCase(), auth.handle, Math.floor(Date.now() / 1000)).run();

  return c.json({
    success: true,
    alias_email: `${name}@basemail.ai`,
    basename: `${name}.base.eth`,
    primary_handle: auth.handle,
    message: `Added — mail to ${name}@basemail.ai will deliver to your inbox`,
  });
});

/**
 * DELETE /api/aliases/:handle
 * Remove a basename alias
 */
aliasRoutes.delete('/:handle', async (c) => {
  const auth = c.get('auth');
  const aliasHandle = c.req.param('handle');

  let wallet = auth.wallet;
  if (!wallet) {
    const acct = await c.env.DB.prepare('SELECT wallet FROM accounts WHERE handle = ?')
      .bind(auth.handle).first<{ wallet: string }>();
    wallet = acct?.wallet || '';
  }

  // Only delete your own aliases
  const alias = await c.env.DB.prepare(
    'SELECT wallet FROM basename_aliases WHERE handle = ? AND wallet = ?'
  ).bind(aliasHandle, (wallet || '').toLowerCase()).first();

  if (!alias) {
    return c.json({ error: 'Alias not found or not owned by you' }, 404);
  }

  await c.env.DB.prepare(
    'DELETE FROM basename_aliases WHERE handle = ? AND wallet = ?'
  ).bind(aliasHandle, (wallet || '').toLowerCase()).run();

  return c.json({
    success: true,
    removed: `${aliasHandle}@basemail.ai`,
  });
});
