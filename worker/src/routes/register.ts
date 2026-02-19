import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware, createToken } from '../auth';
import { resolveHandle, basenameToHandle, verifyBasenameOwnership, getBasenameExpiry, getBasenameForAddress } from '../basename-lookup';
import { registerBasename, isBasenameAvailable, getBasenamePrice } from '../basename';
import type { Hex, Address } from 'viem';
import { formatEther, encodeFunctionData, namehash } from 'viem';
import { normalize } from 'viem/ens';

export const registerRoutes = new Hono<AppBindings>();

/**
 * POST /api/register
 * Register a @basemail.ai email address.
 * Handle is auto-assigned: Basename → basename handle, no Basename → 0x address.
 *
 * Body: {
 *   basename?: string,        // e.g. "alice.base.eth" — claim existing Basename (verified on-chain)
 *   auto_basename?: boolean,  // buy a Basename if you don't have one (optional)
 *   basename_name?: string,   // desired Basename name (required if auto_basename)
 * }
 * Auth: Bearer JWT (from SIWE verify)
 */
registerRoutes.post('/', authMiddleware(), async (c) => {
  const auth = c.get('auth');
  let body: {
    basename?: string; // e.g. "littl3lobst3r.base.eth"
    auto_basename?: boolean;
    basename_name?: string;
  } = {};
  try {
    body = await c.req.json<{
      basename?: string;
      auto_basename?: boolean;
      basename_name?: string;
    }>();
  } catch {
    body = {};
  }

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

  // Determine handle: explicit basename > auto_basename > resolveHandle
  let handle: string;
  let resolvedBasename: string | null = null;
  let source: 'basename' | 'address' = 'address';

  if (body.basename && body.basename.endsWith('.base.eth')) {
    // Agent 指定了已有的 Basename → 驗證 on-chain 所有權
    const ownership = await verifyBasenameOwnership(body.basename, auth.wallet);
    if (!ownership.valid) {
      return c.json({ error: ownership.error }, 403);
    }
    handle = ownership.name;
    resolvedBasename = body.basename;
    source = 'basename';
  } else if (body.auto_basename) {
    // 購買新 Basename
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
      handle = name;
      resolvedBasename = result.fullName;
      source = 'basename';
    } catch (e: any) {
      return c.json({ error: `Basename registration failed: ${e.message}` }, 500);
    }
  } else {
    // Auto-detect via reverse resolution
    const resolved = await resolveHandle(auth.wallet as Address);
    handle = resolved.handle;
    resolvedBasename = resolved.basename;
    source = resolved.source;
  }

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
    resolvedBasename,
    Math.floor(Date.now() / 1000),
  ).run();

  // Issue new JWT with handle
  const secret = c.env.JWT_SECRET!;
  const newToken = await createToken(
    { wallet: auth.wallet, handle },
    secret,
  );

  // 遷移預存信件：如果 handle 是 basename，把 0x 地址下的預存信件搬過來
  const walletLower = auth.wallet.toLowerCase();
  let migratedCount = 0;
  if (handle !== walletLower) {
    const migrated = await c.env.DB.prepare(
      'UPDATE emails SET handle = ? WHERE handle = ?'
    ).bind(handle, walletLower).run();
    migratedCount = migrated.meta?.changes || 0;
  }

  // Count pre-stored emails (now under the correct handle)
  const pendingResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM emails WHERE handle = ?'
  ).bind(handle).first<{ count: number }>();

  // 建構回應
  const response: Record<string, any> = {
    success: true,
    email: `${handle}@${c.env.DOMAIN}`,
    handle,
    wallet: auth.wallet,
    basename: resolvedBasename,
    source,
    token: newToken,
    pending_emails: pendingResult?.count || 0,
    migrated_emails: migratedCount,
  };

  // 如果用 0x handle 註冊且有 Basename NFT → 引導升級
  if (source === 'address') {
    const { has_basename_nft } = await resolveHandle(auth.wallet as Address);
    if (has_basename_nft) {
      response.upgrade_hint = {
        message: 'You have a Basename NFT! Upgrade your handle for a shorter email address.',
        method: 'PUT',
        url: '/api/register/upgrade',
        body: { basename: 'yourname.base.eth' },
        note: 'Pass your Basename to verify ownership and upgrade. Or use auto_basename:true + basename_name to buy a new one.',
      };
    } else {
      response.upgrade_hint = {
        message: 'Want a shorter email like alice@basemail.ai instead of 0x...@basemail.ai?',
        options: [
          {
            action: 'buy_basename',
            method: 'PUT',
            url: '/api/register/upgrade',
            body: { auto_basename: true, basename_name: 'desiredname' },
            note: 'We buy the Basename for you on-chain. Check price first: GET /api/register/price/:name',
          },
          {
            action: 'buy_yourself',
            url: 'https://www.base.org/names',
            note: 'Buy a Basename yourself, then upgrade: PUT /api/register/upgrade { basename: "yourname.base.eth" }',
          },
        ],
      };
    }
  }

  return c.json(response, 201);
});

/**
 * PUT /api/register/upgrade
 * Upgrade 0x handle → Basename handle（已註冊用戶偵測到 Basename 後升級）
 */
registerRoutes.put('/upgrade', authMiddleware(), async (c) => {
  try {
  const auth = c.get('auth');
  let body: {
    basename?: string; // e.g. "juchunko.base.eth" — from frontend
    auto_basename?: boolean; // true = buy a Basename on-chain (worker pays)
    basename_name?: string; // desired name (required if auto_basename)
  } = {};
  try {
    body = await c.req.json<{
      basename?: string;
      auto_basename?: boolean;
      basename_name?: string;
    }>();
  } catch {
    body = {};
  }

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
      const ownership = await verifyBasenameOwnership(body.basename, auth.wallet);
      if (!ownership.valid) {
        return c.json({ error: ownership.error }, 403);
      }
      basenames = body.basename;
      newHandle = ownership.name;
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

  // Insert into basename_aliases with is_primary=1
  if (basenames) {
    const aliasId = `alias-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    let expiry = 0;
    try { expiry = await getBasenameExpiry(basenames); } catch {}
    await c.env.DB.prepare(
      `INSERT INTO basename_aliases (id, wallet, handle, basename, is_primary, expiry)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(handle) DO UPDATE SET is_primary = 1, expiry = ?`
    ).bind(aliasId, auth.wallet, newHandle, basenames, expiry || null, expiry || null).run();
  }

  // 發新 token
  const secret = c.env.JWT_SECRET!;
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
/**
 * GET /api/register/check/:input
 * Universal lookup — accepts wallet address OR basename.
 * Returns availability status, price info, and next steps.
 */
registerRoutes.get('/check/:input', async (c) => {
  const input = c.req.param('input').trim();

  // Determine input type
  const isAddress = /^0x[a-fA-F0-9]{40}$/i.test(input);
  const nameInput = input.replace(/\.base\.eth$/i, '').toLowerCase();
  const isName = !isAddress && /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(nameInput) && nameInput.length >= 3;

  if (!isAddress && !isName) {
    return c.json({ error: 'Invalid input. Provide a wallet address (0x...) or Basename.' }, 400);
  }

  const response: Record<string, any> = {};

  if (isAddress) {
    // ── Wallet address lookup ──
    const resolved = await resolveHandle(input.toLowerCase() as Address);
    const existing = await c.env.DB.prepare(
      'SELECT handle FROM accounts WHERE wallet = ? OR handle = ?'
    ).bind(input.toLowerCase(), resolved.handle).first();

    response.wallet = input.toLowerCase();
    response.handle = resolved.handle;
    response.email = `${resolved.handle}@${c.env.DOMAIN}`;
    response.basename = resolved.basename;
    response.source = resolved.source;
    response.registered = !!existing;
    response.has_basename_nft = resolved.has_basename_nft || false;

    // Upgrade hint
    if (resolved.has_basename_nft && !resolved.basename) {
      response.next_steps = {
        issue: 'You own a Basename NFT but reverse resolution failed (primary name not set on-chain).',
        options: [
          {
            action: 'provide_basename',
            description: 'Pass your Basename directly when registering via agent-register.',
            method: 'POST',
            url: '/api/auth/agent-register',
            body: { address: '0x...', signature: '0x...', message: '...', basename: 'yourname.base.eth' },
          },
          {
            action: 'set_primary_name',
            description: 'Set your primary name on-chain so reverse resolution works automatically.',
            url: 'https://www.base.org/names',
          },
        ],
      };
    }
  } else {
    // ── Basename lookup — check both BaseMail DB and on-chain ──
    const name = nameInput;
    response.handle = name;
    response.email = `${name}@${c.env.DOMAIN}`;
    response.basename = `${name}.base.eth`;
    response.source = 'basename';

    // Check if already registered on BaseMail
    const existing = await c.env.DB.prepare(
      'SELECT handle, wallet FROM accounts WHERE handle = ?'
    ).bind(name).first<{ handle: string; wallet: string }>();
    response.registered = !!existing;
    response.available_basemail = !existing;

    // Check on-chain Basename availability + price
    try {
      const available = await isBasenameAvailable(name);
      response.available_onchain = available;

      if (available) {
        const priceWei = await getBasenamePrice(name);
        response.price_info = {
          available: true,
          price_wei: priceWei.toString(),
          price_eth: formatEther(priceWei),
          duration_years: 1,
          registrar: '0xa7d2607c6BD39Ae9521e514026CBB078405Ab322',
          chain_id: 8453,
          buy_url: `https://www.base.org/names/${name}`,
        };
      } else {
        response.price_info = { available: false };
        // Not available on-chain — owned by someone. Look up owner.
        if (!existing) {
          response.status = 'reserved';
          response.note = `${name}.base.eth is owned on-chain but not yet claimed on BaseMail. The Basename holder can claim this email.`;
          // Fetch on-chain owner address
          try {
            const ownership = await verifyBasenameOwnership(`${name}.base.eth`, '0x0000000000000000000000000000000000000000');
            if (!ownership.valid && ownership.error) {
              // Error message contains actual owner: "The owner is 0x..."
              const ownerMatch = ownership.error.match(/owner is (0x[a-fA-F0-9]{40})/i);
              if (ownerMatch) {
                response.owner = ownerMatch[1];
              }
            }
          } catch {}
        }
      }

      // Determine overall status
      if (existing) {
        response.status = 'taken';
      } else if (available) {
        response.status = 'available';
      } else {
        response.status = response.status || 'reserved';
      }
    } catch (e: any) {
      response.price_info = { error: e.message };
      response.status = existing ? 'taken' : 'unknown';
    }

    // Direct buy flow for available names
    if (response.status === 'available' && response.price_info?.available) {
      response.direct_buy = {
        description: 'Buy this Basename directly with your wallet, then register on BaseMail.',
        steps: [
          { step: 1, action: 'Connect wallet in Dashboard', url: '/dashboard' },
          { step: 2, action: `Buy ${name}.base.eth`, url: response.price_info.buy_url, method: 'on-chain', price: response.price_info.price_eth + ' ETH' },
          { step: 3, action: 'Register on BaseMail with your new Basename', url: '/dashboard', method: 'POST /api/auth/agent-register' },
        ],
        alternative: {
          description: 'Or use auto_basename in the Dashboard to buy + register in one click.',
          url: '/dashboard',
        },
      };
    }
  }

  return c.json(response);
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

/**
 * GET /api/register/buy-data/:name
 * Returns everything needed for the frontend to call register() directly via wagmi.
 * User signs + pays from their own wallet — no worker private key needed.
 */
/**
 * Public — no auth required. Owner address passed as query param.
 */
registerRoutes.get('/buy-data/:name', async (c) => {
  const name = c.req.param('name');
  const owner = c.req.query('owner');

  if (!isValidBasename(name)) {
    return c.json({ error: 'Invalid name format' }, 400);
  }
  if (!owner || !/^0x[a-fA-F0-9]{40}$/i.test(owner)) {
    return c.json({ error: 'owner query param required (0x address)' }, 400);
  }

  try {
    const available = await isBasenameAvailable(name);
    if (!available) {
      return c.json({ error: `${name}.base.eth is not available` }, 409);
    }

    const priceWei = await getBasenamePrice(name);
    const valueWithBuffer = priceWei + (priceWei / 10n); // +10% buffer

    const fullName = `${name}.base.eth`;
    const node = namehash(normalize(fullName));

    const L2_RESOLVER = '0x426fA03fB86E510d0Dd9F70335Cf102a98b10875';
    const L2ResolverABI = [
      { name: 'setAddr', type: 'function', stateMutability: 'nonpayable' as const,
        inputs: [{ name: 'node', type: 'bytes32' }, { name: 'a', type: 'address' }], outputs: [] },
      { name: 'setName', type: 'function', stateMutability: 'nonpayable' as const,
        inputs: [{ name: 'node', type: 'bytes32' }, { name: 'newName', type: 'string' }], outputs: [] },
    ] as const;

    const addressData = encodeFunctionData({
      abi: L2ResolverABI, functionName: 'setAddr', args: [node, owner as Address],
    });
    const nameData = encodeFunctionData({
      abi: L2ResolverABI, functionName: 'setName', args: [node, fullName],
    });

    const ONE_YEAR = BigInt(365 * 24 * 60 * 60);

    return c.json({
      name,
      basename: fullName,
      available: true,
      price_wei: priceWei.toString(),
      price_eth: formatEther(priceWei),
      value_with_buffer: valueWithBuffer.toString(),
      contract: {
        address: '0xa7d2607c6BD39Ae9521e514026CBB078405Ab322',
        chain_id: 8453,
        function_name: 'register',
        args: {
          name,
          owner,
          duration: ONE_YEAR.toString(),
          resolver: L2_RESOLVER,
          data: [addressData, nameData],
          reverseRecord: true,
          coinTypes: [],
          signatureExpiry: '0',
          signature: '0x',
        },
        value: valueWithBuffer.toString(),
      },
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /api/register/basenames/:address
 * Public endpoint — returns Basenames owned by a wallet (via reverse resolution).
 */
registerRoutes.get('/basenames/:address', async (c) => {
  const address = c.req.param('address');
  if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    return c.json({ error: 'Invalid address' }, 400);
  }

  const basename = await getBasenameForAddress(address.toLowerCase() as Address);
  const basenames: { name: string; handle: string; expiry: number }[] = [];

  if (basename) {
    const handle = basenameToHandle(basename);
    let expiry = 0;
    try { expiry = await getBasenameExpiry(basename); } catch {}
    basenames.push({ name: basename, handle, expiry });
  }

  // Also check aliases stored in DB
  const aliases = await c.env.DB.prepare(
    'SELECT handle, basename, expiry FROM basename_aliases WHERE wallet = ?'
  ).bind(address.toLowerCase()).all<{ handle: string; basename: string; expiry: number | null }>();

  for (const a of (aliases.results || [])) {
    if (!basenames.find(b => b.handle === a.handle)) {
      basenames.push({ name: a.basename, handle: a.handle, expiry: a.expiry || 0 });
    }
  }

  return c.json({ address: address.toLowerCase(), basenames });
});

function isValidBasename(name: string): boolean {
  if (name.length < 3 || name.length > 32) return false;
  return /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(name);
}
