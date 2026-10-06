import { Hono } from 'hono';
import { createPublicClient, createWalletClient, parseAbi, keccak256, toHex, formatEther, type Hex, type Address } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

import { AppBindings } from '../types';
import { baseTransport } from '../rpc';
import { authMiddleware, createToken } from '../auth';
import { resolveHandle } from '../basename-lookup';
import { ensureEscrowGasColumns, forwardGasTopup } from '../escrow-gas';

const ESCROW_ABI = parseAbi([
  'function release(bytes32 claimId, address claimer) external',
  'function getDeposit(bytes32 claimId) view returns (address sender, uint256 amount, uint256 expiry, bool settled)',
]);

// A claim lock older than this belongs to a request that died before broadcasting
const CLAIM_LOCK_TTL = 120;

export const claimRoutes = new Hono<AppBindings>();

// Auto-migrate: create escrow_claims table if missing
let migrated = false;
claimRoutes.use('/*', async (c, next) => {
  if (!migrated) {
    migrated = true;
    try {
      await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS escrow_claims (
        claim_id TEXT PRIMARY KEY, sender_handle TEXT NOT NULL, sender_wallet TEXT NOT NULL,
        recipient_email TEXT NOT NULL, amount_usdc REAL NOT NULL, deposit_tx TEXT NOT NULL,
        network TEXT NOT NULL DEFAULT 'base-mainnet', status TEXT NOT NULL DEFAULT 'pending',
        claimer_handle TEXT, claimer_wallet TEXT, release_tx TEXT, receipt_email_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()), expires_at INTEGER NOT NULL, claimed_at INTEGER
      )`).run();
    } catch {}
    await ensureEscrowGasColumns(c.env.DB);
  }
  await next();
});

/**
 * GET /api/claim/:id
 * Public — returns claim info (no auth required)
 */
claimRoutes.get('/:id', async (c) => {
  const claimId = c.req.param('id');

  const claim = await c.env.DB.prepare(
    'SELECT claim_id, sender_handle, recipient_email, amount_usdc, network, status, expires_at, created_at, gas_topup_wei, gas_status, gas_release_tx FROM escrow_claims WHERE claim_id = ?'
  ).bind(claimId).first<any>();

  if (!claim) {
    // Check if request wants HTML (AI agents fetching the claim URL)
    const accept = c.req.header('accept') || '';
    if (accept.includes('text/html')) {
      return c.html(`<!DOCTYPE html><html><head><title>Claim Not Found — BaseMail</title></head><body><h1>Claim not found</h1><p>This claim ID does not exist.</p><p><a href="https://basemail.ai">Visit BaseMail.ai</a></p></body></html>`, 404);
    }
    return c.json({ error: 'Claim not found' }, 404);
  }

  const isPending = claim.status === 'pending' && Math.floor(Date.now() / 1000) < claim.expires_at;

  // If request wants HTML (e.g., AI agent fetching the URL), return rich HTML with structured data
  const accept = c.req.header('accept') || '';
  if (accept.includes('text/html')) {
    const amountStr = claim.amount_usdc.toFixed(2);
    const statusEmoji = claim.status === 'claimed' ? '✅' : isPending ? '💰' : '⏰';
    const apiUrl = `https://api.basemail.ai/api/claim/${claim.claim_id}`;
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'MoneyTransfer',
      name: `USDC Payment Claim — ${amountStr} USDC`,
      sender: { '@type': 'Person', name: claim.sender_handle },
      amount: { '@type': 'MonetaryAmount', value: amountStr, currency: 'USD' },
      status: claim.status,
      url: `https://basemail.ai/claim/${claim.claim_id}`,
      description: `Claim ${amountStr} USDC sent by ${claim.sender_handle} via BaseMail`,
    });
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${statusEmoji} Claim ${amountStr} USDC from ${claim.sender_handle} — BaseMail</title>
  <meta name="description" content="Claim ${amountStr} USDC sent by ${claim.sender_handle} via BaseMail. Status: ${claim.status}">
  <meta property="og:title" content="Claim ${amountStr} USDC — BaseMail">
  <meta property="og:description" content="${claim.sender_handle} sent you ${amountStr} USDC. Claim it now.">
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <h1>${statusEmoji} BaseMail USDC Claim</h1>
  <p><strong>${amountStr} USDC</strong> from <strong>${claim.sender_handle}</strong></p>
  <p>To: ${claim.recipient_email}</p>
  <p>Status: ${claim.status} | Network: ${claim.network}</p>
  <p>Expires: ${new Date(claim.expires_at * 1000).toISOString()}</p>
  ${isPending ? `
  <hr>
  <h2>🤖 AI Agent — How to Claim</h2>
  <p><strong>API Endpoint:</strong> <code>POST ${apiUrl}</code></p>
  <h3>Option A: API Key (if you have a BaseMail account)</h3>
  <pre>curl -X POST ${apiUrl} -H "Authorization: Bearer bm_live_YOUR_KEY"</pre>
  <h3>Option B: SIWE Auth (any wallet)</h3>
  <ol>
    <li>POST https://api.basemail.ai/api/auth/start with {"address": "0xYourWallet"}</li>
    <li>Sign the returned message (EIP-191 personal_sign)</li>
    <li>POST https://api.basemail.ai/api/auth/verify with {"address", "signature", "message"} → get token</li>
    <li>POST ${apiUrl} with "Authorization: Bearer &lt;token&gt;"</li>
  </ol>
  <p>No BaseMail account? One is auto-created when you claim.</p>
  <p>No wallet? Create one first, then use Option B.</p>
  <p><a href="https://api.basemail.ai/api/docs">API Docs</a> | <a href="https://basemail.ai">BaseMail.ai</a></p>
  ` : ''}
  <hr>
  <p><a href="https://basemail.ai/claim/${claim.claim_id}">Open in browser</a></p>
</body>
</html>`);
  }

  return c.json({
    claim_id: claim.claim_id,
    sender: claim.sender_handle,
    recipient_email: claim.recipient_email,
    amount_usdc: claim.amount_usdc,
    network: claim.network,
    status: claim.status,
    expires_at: claim.expires_at,
    created_at: claim.created_at,
    expired: claim.status === 'pending' && Math.floor(Date.now() / 1000) >= claim.expires_at,
    ...(claim.gas_topup_wei > 0 && claim.gas_status !== 'refunded' ? {
      gas_topup_eth: formatEther(BigInt(claim.gas_topup_wei)),
      gas_status: claim.gas_status,
      ...(claim.gas_release_tx ? { gas_tx: claim.gas_release_tx } : {}),
    } : {}),
    // Agent-friendly claim instructions
    ...(isPending ? {
      claim_url: `https://basemail.ai/claim/${claim.claim_id}`,
      api: {
        endpoint: `https://api.basemail.ai/api/claim/${claim.claim_id}`,
        method: 'POST',
        auth: 'Bearer <token>',
        instructions: [
          'Option A — API Key (if you have a BaseMail account):',
          '  POST /api/claim/:id with header "Authorization: Bearer bm_live_xxx"',
          '',
          'Option B — SIWE (with any wallet):',
          '  1. POST /api/auth/start { "address": "0xYourWallet" } → get { nonce, message }',
          '  2. Sign the message with your wallet private key (EIP-191 personal_sign)',
          '  3. POST /api/auth/verify { "address", "signature", "message" } → get { token }',
          '  4. POST /api/claim/:id with header "Authorization: Bearer <token>"',
          '',
          'No wallet? Create one first, then use Option B. Account is auto-created on claim.',
        ],
        register_url: 'https://basemail.ai',
        docs_url: 'https://api.basemail.ai/api/docs',
      },
    } : {}),
  });
});

/**
 * POST /api/claim/:id
 * Auth required — claims the escrowed USDC
 * The authenticated user must have a BaseMail account.
 * Worker calls PaymentEscrow.release() and sends a receipt email.
 */
claimRoutes.post('/:id', authMiddleware(), async (c) => {
  const auth = c.get('auth');
  const claimId = c.req.param('id');

  // API key auth has no wallet — look it up from DB
  if (!auth.wallet && auth.handle) {
    const acct = await c.env.DB.prepare(
      'SELECT wallet FROM accounts WHERE handle = ?'
    ).bind(auth.handle).first<{ wallet: string }>();
    if (acct) auth.wallet = acct.wallet;
  }

  if (!auth.wallet) {
    return c.json({ error: 'Wallet required. Use SIWE auth or an API key linked to a registered account.' }, 401);
  }

  // Auto-register if no BaseMail account exists
  let handle = auth.handle;
  let newAccount = false;
  if (!handle) {
    // Check if wallet already has an account
    const existing = await c.env.DB.prepare(
      'SELECT handle FROM accounts WHERE wallet = ?'
    ).bind(auth.wallet).first<{ handle: string }>();

    if (existing) {
      handle = existing.handle;
    } else {
      // Auto-create account: resolve basename or use 0x address
      const resolved = await resolveHandle(auth.wallet as Address);
      handle = resolved.handle;

      // Check handle not taken
      const taken = await c.env.DB.prepare(
        'SELECT handle FROM accounts WHERE handle = ?'
      ).bind(handle).first();

      if (taken) {
        // Fallback to wallet address as handle
        handle = auth.wallet.toLowerCase();
      }

      await c.env.DB.prepare(
        `INSERT INTO accounts (handle, wallet, basename, tx_hash, credits, created_at)
         VALUES (?, ?, ?, NULL, 10, ?)`
      ).bind(handle, auth.wallet, resolved.basename, Math.floor(Date.now() / 1000)).run();

      newAccount = true;
    }

    // Update auth context with handle and re-issue token
    auth.handle = handle;
    c.set('auth', auth);
  }

  // Fetch claim
  const claim = await c.env.DB.prepare(
    'SELECT * FROM escrow_claims WHERE claim_id = ?'
  ).bind(claimId).first<any>();

  if (!claim) return c.json({ error: 'Claim not found' }, 404);

  const sameClaimer = (claim.claimer_wallet || '').toLowerCase() === auth.wallet.toLowerCase();

  // If new account was created, issue a token so frontend can redirect to dashboard
  let token: string | undefined;
  if (newAccount) {
    try {
      token = await createToken({ wallet: auth.wallet, handle: handle! }, c.env.JWT_SECRET!);
    } catch {}
  }

  const claimedResponse = (row: any, gas?: { tx: string; amount_eth: string } | null) => c.json({
    success: true,
    claim_id: claimId,
    amount_usdc: Number(row.amount_usdc).toFixed(2),
    release_tx: row.release_tx,
    receipt_email_id: row.receipt_email_id,
    claimer: row.claimer_handle,
    new_account: newAccount,
    ...(gas ? { gas_topup: { amount_eth: gas.amount_eth, tx: gas.tx } }
      : row.gas_release_tx && row.gas_status === 'sent' ? { gas_topup: { amount_eth: formatEther(BigInt(row.gas_topup_wei)), tx: row.gas_release_tx } }
      : {}),
    ...(token ? { token } : {}),
  });

  const pendingResponse = (releaseTx: string | null) => c.json({
    pending: true,
    claim_id: claimId,
    release_tx: releaseTx,
    message: 'Release submitted on-chain and waiting for confirmation. Retry this request in a few seconds to finish the claim.',
    new_account: newAccount,
    ...(token ? { token } : {}),
  }, 202);

  // Retry after the release already went through (e.g. the first response timed out)
  if (claim.status === 'claimed' && sameClaimer) {
    const gas = claim.gas_status === 'pending' ? await forwardGasTopup(c.env, claimId, claim.claimer_wallet, 'release') : null;
    return claimedResponse(claim, gas);
  }
  if (claim.status !== 'pending') return c.json({ error: `Claim already ${claim.status}` }, 400);

  // Check worker wallet config
  if (!c.env.WALLET_PRIVATE_KEY || !c.env.PAYMENT_ESCROW_ADDRESS) {
    return c.json({ error: 'Escrow not configured on server' }, 500);
  }

  const escrow = c.env.PAYMENT_ESCROW_ADDRESS as Address;
  const publicClient = createPublicClient({ chain: base, transport: baseTransport() });
  const claimIdHash = keccak256(toHex(claimId));
  const now = Math.floor(Date.now() / 1000);

  // Mark the claim as claimed and drop the receipt email. Safe to call more
  // than once: only the request that flips status from 'pending' writes.
  const finalize = async (releaseTx: string, claimerHandle: string, claimerWallet: string) => {
    const receiptEmailId = `escrow-${claimId}-${Date.now().toString(36)}`;
    const claimedAt = Math.floor(Date.now() / 1000);

    const updated = await c.env.DB.prepare(
      `UPDATE escrow_claims SET status = 'claimed', claimer_handle = ?, claimer_wallet = ?, release_tx = ?, receipt_email_id = ?, claimed_at = ?
       WHERE claim_id = ? AND status = 'pending'`
    ).bind(claimerHandle, claimerWallet, releaseTx, receiptEmailId, claimedAt, claimId).run();

    if (!updated.meta.changes) {
      const row = await c.env.DB.prepare('SELECT * FROM escrow_claims WHERE claim_id = ?').bind(claimId).first<any>();
      return claimedResponse(row);
    }

    try {
      // Generate receipt email (internal delivery to claimer's inbox)
      const amountStr = claim.amount_usdc.toFixed(2);
      const senderEmail = `${claim.sender_handle}@basemail.ai`;
      const claimerEmail = `${claimerHandle}@basemail.ai`;
      const explorerUrl = claim.network === 'base-mainnet' ? 'https://basescan.org' : 'https://sepolia.basescan.org';

      const receiptSubject = `USDC Payment: $${amountStr} — Claimed ✅`;
      const receiptBody = [
        `You claimed a payment of ${amountStr} USDC from ${claim.sender_handle}.`,
        ``,
        `Originally sent to: ${claim.recipient_email}`,
        `Release TX: ${explorerUrl}/tx/${releaseTx}`,
        ``,
        `Sent via BaseMail.ai`,
      ].join('\n');

      // Build minimal MIME for R2 storage
      const { createMimeMessage } = await import('mimetext');
      const msg = createMimeMessage();
      msg.setSender({ name: claim.sender_handle, addr: senderEmail });
      msg.setRecipient(claimerEmail);
      msg.setSubject(receiptSubject);
      msg.addMessage({ contentType: 'text/plain', data: receiptBody });
      msg.setHeader('X-BaseMail-USDC-Payment', `${amountStr} USDC`);
      msg.setHeader('X-BaseMail-USDC-TxHash', releaseTx);
      msg.setHeader('X-BaseMail-USDC-Network', claim.network === 'base-mainnet' ? 'Base Mainnet' : 'Base Sepolia (Testnet)');
      msg.setHeader('X-BaseMail-Escrow-Claim', claimId);

      const rawMime = msg.asRaw();
      const r2Key = `emails/${claimerHandle}/inbox/${receiptEmailId}.eml`;
      await c.env.EMAIL_STORE.put(r2Key, rawMime);

      const snippet = `You claimed a payment of ${amountStr} USDC from ${claim.sender_handle}.`;

      await c.env.DB.prepare(
        `INSERT INTO emails (id, handle, folder, from_addr, to_addr, subject, snippet, r2_key, size, read, created_at, usdc_amount, usdc_tx, usdc_network)
         VALUES (?, ?, 'inbox', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      ).bind(
        receiptEmailId, claimerHandle, senderEmail, claimerEmail,
        receiptSubject, snippet, r2Key, rawMime.length,
        claimedAt, amountStr, releaseTx, claim.network,
      ).run();
    } catch (e) {
      // The USDC already moved; a missing receipt must not turn into an error
      console.error(`claim ${claimId}: released in ${releaseTx} but receipt email failed`, e);
    }

    // Gas the sender attached for this claimer; a failure is retried by the next request or the cron
    const gas = claim.gas_status === 'pending' ? await forwardGasTopup(c.env, claimId, claimerWallet, 'release') : null;

    return claimedResponse({ ...claim, release_tx: releaseTx, receipt_email_id: receiptEmailId, claimer_handle: claimerHandle }, gas);
  };

  // Wait for the release receipt. A revert frees the claim for another try;
  // anything short of a receipt (timeout, flaky RPC) keeps the tx on record
  // so the next request picks it up instead of sending a second release.
  const settle = async (releaseTx: Hex, claimerHandle: string, claimerWallet: string) => {
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash: releaseTx, timeout: 20_000 });
    } catch {
      return pendingResponse(releaseTx);
    }
    if (receipt.status !== 'success') {
      await c.env.DB.prepare(
        `UPDATE escrow_claims SET release_tx = NULL, claimer_handle = NULL, claimer_wallet = NULL
         WHERE claim_id = ? AND status = 'pending' AND release_tx = ?`
      ).bind(claimId, releaseTx).run();
      return c.json({ error: 'Release transaction failed on-chain', release_tx: releaseTx }, 500);
    }
    return finalize(releaseTx, claimerHandle, claimerWallet);
  };

  // A release is already in flight: release_tx holds its hash, or
  // `locked:<unix>` while a request is between locking and broadcasting
  if (claim.release_tx) {
    const lockedAt = claim.release_tx.startsWith('locked:') ? Number(claim.release_tx.slice(7)) : null;
    if (lockedAt === null) {
      if (!sameClaimer) return c.json({ error: 'This claim is already being released to another wallet' }, 409);
      return settle(claim.release_tx as Hex, claim.claimer_handle, claim.claimer_wallet);
    }
    if (lockedAt >= now - CLAIM_LOCK_TTL) {
      return sameClaimer ? pendingResponse(null) : c.json({ error: 'This claim is already being processed' }, 409);
    }
    // Stale lock: that request died before broadcasting, so take it over below
  }

  if (now >= claim.expires_at) {
    await c.env.DB.prepare('UPDATE escrow_claims SET status = ? WHERE claim_id = ?').bind('expired', claimId).run();
    return c.json({ error: 'Claim has expired. USDC can be refunded to sender.' }, 400);
  }

  // Lock the claim so a double submit can't broadcast two releases
  const lockValue = `locked:${now}`;
  const locked = await c.env.DB.prepare(
    `UPDATE escrow_claims SET release_tx = ?, claimer_handle = ?, claimer_wallet = ?
     WHERE claim_id = ? AND status = 'pending'
       AND (release_tx IS NULL OR (release_tx LIKE 'locked:%' AND CAST(substr(release_tx, 8) AS INTEGER) < ?))`
  ).bind(lockValue, handle, auth.wallet, claimId, now - CLAIM_LOCK_TTL).run();
  if (!locked.meta.changes) {
    // Lost the race to a concurrent request; same wallet just waits for it
    const current = await c.env.DB.prepare(
      'SELECT release_tx, claimer_wallet FROM escrow_claims WHERE claim_id = ?'
    ).bind(claimId).first<{ release_tx: string | null; claimer_wallet: string | null }>();
    if ((current?.claimer_wallet || '').toLowerCase() === auth.wallet.toLowerCase()) {
      return pendingResponse(current?.release_tx?.startsWith('0x') ? current.release_tx : null);
    }
    return c.json({ error: 'This claim is already being processed. Retry in a few seconds.' }, 409);
  }

  const unlock = () => c.env.DB.prepare(
    `UPDATE escrow_claims SET release_tx = NULL, claimer_handle = NULL, claimer_wallet = NULL
     WHERE claim_id = ? AND release_tx = ?`
  ).bind(claimId, lockValue).run();

  // Call PaymentEscrow.release() on-chain
  let releaseTx: Hex;
  try {
    // Verify on-chain deposit exists and is not settled
    const [sender, , , settled] = await publicClient.readContract({
      address: escrow,
      abi: ESCROW_ABI,
      functionName: 'getDeposit',
      args: [claimIdHash],
    });

    if (sender === '0x0000000000000000000000000000000000000000') {
      await unlock();
      return c.json({ error: 'Deposit not found on-chain' }, 400);
    }
    if (settled) {
      await unlock();
      return c.json({ error: 'Deposit already settled on-chain, but BaseMail has no release record for it. Contact support with this claim ID.' }, 409);
    }

    // Release to claimer's wallet
    const account = privateKeyToAccount(c.env.WALLET_PRIVATE_KEY as Hex);
    const walletClient = createWalletClient({ chain: base, transport: baseTransport(), account });
    releaseTx = await walletClient.writeContract({
      address: escrow,
      abi: ESCROW_ABI,
      functionName: 'release',
      args: [claimIdHash, auth.wallet as `0x${string}`],
    });
  } catch (e: any) {
    await unlock();
    return c.json({ error: `On-chain release failed: ${e.shortMessage || e.message}` }, 500);
  }

  // Record the hash before waiting, so a retry resumes this tx
  await c.env.DB.prepare('UPDATE escrow_claims SET release_tx = ? WHERE claim_id = ? AND release_tx = ?')
    .bind(releaseTx, claimId, lockValue).run()
    .catch((e) => console.error(`claim ${claimId}: could not record release tx ${releaseTx}`, e));

  return settle(releaseTx, handle!, auth.wallet);
});

export default claimRoutes;
