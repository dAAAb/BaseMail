import { Hono } from 'hono';
import { Env } from '../types';
import { authMiddleware, createToken } from '../auth';
import { resolveHandle, basenameToHandle } from '../basename-lookup';
import { registerBasename, isBasenameAvailable, getBasenamePrice } from '../basename';
import type { Hex, Address } from 'viem';
import { formatEther, createPublicClient, http, keccak256, toBytes } from 'viem';
import { base } from 'viem/chains';

const BASENAME_REGISTRAR = '0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a' as const;

export const registerRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/register
 * Register a @basemail.ai email address.
 * Handle is auto-assigned: Basename → basename handle, no Basename → 0x address.
 *
 * Body: {
 *   auto_basename?: boolean,  // buy a Basename if you don't have one (optional)
 *   basename_name?: string,   // desired Basename name (required if auto_basename)
 * }
 * Auth: Bearer JWT (from SIWE verify)
 */
registerRoutes.post('/', authMiddleware(), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    auto_basename?: boolean;
    basename_name?: string;
  }>().catch(() => ({}));

  // Check if wallet already registered
  const walletAccount = await c.env.DB.prepare(
    'SELECT handle FROM accounts WHERE wallet = ?'
  ).bind(auth.wallet).first();

  if (walletAccount) {
    return c.json({
      error: 'This wallet already has a registered email',
      existing_handle: (walletAccount as { handle: string }).handle,
    }, 409);
  }

  // Auto-detect identity
  let resolved = await resolveHandle(auth.wallet as Address);

  // Optional: buy a Basename first
  if (body.auto_basename && resolved.source === 'address') {
    if (!c.env.WALLET_PRIVATE_KEY) {
      return c.json({ error: 'Basename auto-registration is not configured' }, 503);
    }

    const name = body.basename_name;
    if (!name || !isValidBasename(name)) {
      return c.json({ error: 'basename_name is required (3-32 chars, a-z, 0-9, -)' }, 400);
    }

    try {
      const result = await registerBasename(
        name,
        auth.wallet as Address,
        c.env.WALLET_PRIVATE_KEY as Hex,
        1,
      );
      // Re-resolve with the new Basename
      resolved = {
        handle: name,
        basename: result.fullName,
        source: 'basename',
      };
    } catch (e: any) {
      return c.json({ error: `Basename registration failed: ${e.message}` }, 500);
    }
  }

  const handle = resolved.handle;

  // Check if this handle is already taken (shouldn't happen for 0x addresses)
  const existing = await c.env.DB.prepare(
    'SELECT handle FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (existing) {
    return c.json({ error: 'This identity is already registered' }, 409);
  }

  // Create account
  await c.env.DB.prepare(
    `INSERT INTO accounts (handle, wallet, basename, tx_hash, created_at)
     VALUES (?, ?, ?, NULL, ?)`
  ).bind(
    handle,
    auth.wallet,
    resolved.basename,
    Math.floor(Date.now() / 1000),
  ).run();

  // Issue new JWT with handle
  const secret = c.env.JWT_SECRET || '***REDACTED***';
  const newToken = await createToken(
    { wallet: auth.wallet, handle },
    secret,
  );

  // 遷移預存信件：如果 handle 是 basename，把 0x 地址下的預存信件搬過來
  const walletLower = auth.wallet.toLowerCase();
  let migratedCount = 0;
  if (handle !== walletLower) {
    // 使用者用 Basename 註冊，但預存信件存在 0x handle 下
    const migrated = await c.env.DB.prepare(
      'UPDATE emails SET handle = ? WHERE handle = ?'
    ).bind(handle, walletLower).run();
    migratedCount = migrated.meta?.changes || 0;

    // 搬移 R2 中的信件（更新路徑太昂貴，保留原路徑，只更 D1 索引即可）
  }

  // Count pre-stored emails (now under the correct handle)
  const pendingResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM emails WHERE handle = ?'
  ).bind(handle).first<{ count: number }>();

  return c.json({
    success: true,
    email: `${handle}@${c.env.DOMAIN}`,
    handle,
    wallet: auth.wallet,
    basename: resolved.basename,
    source: resolved.source,
    token: newToken,
    pending_emails: pendingResult?.count || 0,
    migrated_emails: migratedCount,
  }, 201);
});

/**
 * PUT /api/register/upgrade
 * Upgrade 0x handle → Basename handle（已註冊用戶偵測到 Basename 後升級）
 */
registerRoutes.put('/upgrade', authMiddleware(), async (c) => {
  try {
  const auth = c.get('auth');
  const body = await c.req.json<{
    basename?: string;        // e.g. "juchunko.base.eth" — from frontend
    auto_basename?: boolean;  // true = buy a Basename on-chain (worker pays)
    basename_name?: string;   // desired name (required if auto_basename)
  }>().catch(() => ({}));

  // 確認帳號存在且目前是 0x handle
  const account = await c.env.DB.prepare(
    'SELECT handle, basename FROM accounts WHERE wallet = ?'
  ).bind(auth.wallet).first<{ handle: string; basename: string | null }>();

  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  if (!/^0x/i.test(account.handle)) {
    return c.json({ error: 'Account already has a Basename handle', handle: account.handle }, 400);
  }

  let basenames: string | null = null;
  let newHandle: string;

  if (body.auto_basename) {
    // ── Path A: Buy a Basename on-chain (for AI agents) ──
    if (!c.env.WALLET_PRIVATE_KEY) {
      return c.json({ error: 'Basename auto-registration is not configured' }, 503);
    }

    const name = body.basename_name;
    if (!name || !isValidBasename(name)) {
      return c.json({ error: 'basename_name is required (3-32 chars, a-z, 0-9, -)' }, 400);
    }

    const available = await isBasenameAvailable(name);
    if (!available) {
      return c.json({ error: `Basename "${name}.base.eth" is not available` }, 409);
    }

    try {
      const result = await registerBasename(
        name,
        auth.wallet as Address,
        c.env.WALLET_PRIVATE_KEY as Hex,
        1,
      );
      basenames = result.fullName;
      newHandle = name;
    } catch (e: any) {
      return c.json({ error: `Basename registration failed: ${e.message}` }, 500);
    }
  } else {
    // ── Path B: User already owns a Basename (existing logic) ──
    // First try reverse resolution
    const resolved = await resolveHandle(auth.wallet as Address);
    if (resolved.basename && resolved.source === 'basename') {
      basenames = resolved.basename;
      newHandle = resolved.handle;
    } else if (body.basename && body.basename.endsWith('.base.eth')) {
      // Frontend provided the basename — verify on-chain ownership
      const name = body.basename.replace(/\.base\.eth$/, '');
      const labelhash = keccak256(toBytes(name));
      const tokenId = BigInt(labelhash);

      const client = createPublicClient({ chain: base, transport: http('https://base.publicnode.com') });
      try {
        const owner = await client.readContract({
          abi: [{
            inputs: [{ name: 'tokenId', type: 'uint256' }],
            name: 'ownerOf',
            outputs: [{ name: '', type: 'address' }],
            stateMutability: 'view',
            type: 'function',
          }],
          address: BASENAME_REGISTRAR,
          functionName: 'ownerOf',
          args: [tokenId],
        });
        if (owner.toLowerCase() !== auth.wallet.toLowerCase()) {
          return c.json({ error: 'You do not own this Basename' }, 403);
        }
        basenames = body.basename;
        newHandle = name;
      } catch {
        return c.json({ error: 'Failed to verify Basename ownership' }, 500);
      }
    } else {
      return c.json({ error: 'No Basename found for this wallet. Get one at https://www.base.org/names' }, 404);
    }
  }

  const oldHandle = account.handle;

  // 檢查新 handle 是否已被占用
  const existing = await c.env.DB.prepare(
    'SELECT handle FROM accounts WHERE handle = ?'
  ).bind(newHandle).first();

  if (existing) {
    return c.json({ error: 'This Basename handle is already registered by another wallet' }, 409);
  }

  // 更新帳號 handle + 遷移信件（batch 以延遲 FK 檢查）
  const batchResults = await c.env.DB.batch([
    c.env.DB.prepare("PRAGMA defer_foreign_keys = ON"),
    c.env.DB.prepare(
      'UPDATE accounts SET handle = ?, basename = ? WHERE wallet = ?'
    ).bind(newHandle, basenames, auth.wallet),
    c.env.DB.prepare(
      'UPDATE emails SET handle = ? WHERE handle = ?'
    ).bind(newHandle, oldHandle),
  ]);
  const migratedCount = batchResults[2]?.meta?.changes || 0;

  // 發新 token
  const secret = c.env.JWT_SECRET || '***REDACTED***';
  const newToken = await createToken({ wallet: auth.wallet, handle: newHandle }, secret);

  return c.json({
    success: true,
    email: `${newHandle}@${c.env.DOMAIN}`,
    handle: newHandle,
    old_handle: oldHandle,
    basename: basenames,
    token: newToken,
    migrated_emails: migratedCount,
  });
  } catch (e: any) {
    console.log('[upgrade] Error:', e.message, e.stack);
    return c.json({ error: `Upgrade error: ${e.message}` }, 500);
  }
});

/**
 * GET /api/register/check/:address
 * Check what email a wallet address would get
 */
registerRoutes.get('/check/:address', async (c) => {
  const address = c.req.param('address');

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return c.json({ error: 'Invalid wallet address' }, 400);
  }

  const resolved = await resolveHandle(address.toLowerCase() as Address);

  // Check if already registered
  const existing = await c.env.DB.prepare(
    'SELECT handle FROM accounts WHERE wallet = ? OR handle = ?'
  ).bind(address.toLowerCase(), resolved.handle).first();

  return c.json({
    wallet: address.toLowerCase(),
    handle: resolved.handle,
    email: `${resolved.handle}@${c.env.DOMAIN}`,
    basename: resolved.basename,
    source: resolved.source,
    registered: !!existing,
    has_basename_nft: resolved.has_basename_nft || false,
  });
});

/**
 * GET /api/register/price/:name
 * Query Basename registration price
 */
registerRoutes.get('/price/:name', async (c) => {
  const name = c.req.param('name');

  if (!isValidBasename(name)) {
    return c.json({ error: 'Invalid name format' }, 400);
  }

  try {
    const available = await isBasenameAvailable(name);
    if (!available) {
      return c.json({
        name,
        basename: `${name}.base.eth`,
        available: false,
        price: null,
      });
    }

    const priceWei = await getBasenamePrice(name);
    return c.json({
      name,
      basename: `${name}.base.eth`,
      available: true,
      price_wei: priceWei.toString(),
      price_eth: formatEther(priceWei),
    });
  } catch (e: any) {
    return c.json({ error: `Price query failed: ${e.message}` }, 500);
  }
});

function isValidBasename(name: string): boolean {
  if (name.length < 3 || name.length > 32) return false;
  return /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(name);
}
