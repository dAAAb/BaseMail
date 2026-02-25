import { Hono } from 'hono';
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex, type Hex, fallback } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Multiple RPCs with fallback for reliability
const baseTransport = fallback([
  http('https://mainnet.base.org'),
  http('https://1rpc.io/base'),
]);
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';

const ESCROW_ABI = parseAbi([
  'function release(bytes32 claimId, address claimer) external',
  'function getDeposit(bytes32 claimId) view returns (address sender, uint256 amount, uint256 expiry, bool settled)',
]);

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
    'SELECT claim_id, sender_handle, recipient_email, amount_usdc, network, status, expires_at, created_at FROM escrow_claims WHERE claim_id = ?'
  ).bind(claimId).first<any>();

  if (!claim) return c.json({ error: 'Claim not found' }, 404);

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

  if (!auth.handle || !auth.wallet) {
    return c.json({ error: 'You need a BaseMail account to claim USDC. Please register first.' }, 403);
  }

  // Fetch claim
  const claim = await c.env.DB.prepare(
    'SELECT * FROM escrow_claims WHERE claim_id = ?'
  ).bind(claimId).first<any>();

  if (!claim) return c.json({ error: 'Claim not found' }, 404);
  if (claim.status !== 'pending') return c.json({ error: `Claim already ${claim.status}` }, 400);

  const now = Math.floor(Date.now() / 1000);
  if (now >= claim.expires_at) {
    await c.env.DB.prepare('UPDATE escrow_claims SET status = ? WHERE claim_id = ?').bind('expired', claimId).run();
    return c.json({ error: 'Claim has expired. USDC can be refunded to sender.' }, 400);
  }

  // Check worker wallet config
  if (!c.env.WALLET_PRIVATE_KEY || !c.env.PAYMENT_ESCROW_ADDRESS) {
    return c.json({ error: 'Escrow not configured on server' }, 500);
  }

  // Call PaymentEscrow.release() on-chain
  const account = privateKeyToAccount(c.env.WALLET_PRIVATE_KEY as Hex);
  const publicClient = createPublicClient({ chain: base, transport: baseTransport });
  const walletClient = createWalletClient({ chain: base, transport: baseTransport, account });

  const claimIdHash = keccak256(toHex(claimId));
  let releaseTx: string;

  try {
    // Verify on-chain deposit exists and is not settled
    const [sender, amount, expiry, settled] = await publicClient.readContract({
      address: c.env.PAYMENT_ESCROW_ADDRESS as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: 'getDeposit',
      args: [claimIdHash],
    });

    if (sender === '0x0000000000000000000000000000000000000000') {
      return c.json({ error: 'Deposit not found on-chain' }, 400);
    }
    if (settled) {
      return c.json({ error: 'Deposit already settled on-chain' }, 400);
    }

    // Release to claimer's wallet
    const hash = await walletClient.writeContract({
      address: c.env.PAYMENT_ESCROW_ADDRESS as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: 'release',
      args: [claimIdHash, auth.wallet as `0x${string}`],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    if (receipt.status !== 'success') {
      return c.json({ error: 'Release transaction failed on-chain' }, 500);
    }

    releaseTx = hash;
  } catch (e: any) {
    return c.json({ error: `On-chain release failed: ${e.message}` }, 500);
  }

  // Generate receipt email (internal delivery to claimer's inbox)
  const receiptEmailId = `escrow-${claimId}-${Date.now().toString(36)}`;
  const amountStr = claim.amount_usdc.toFixed(2);
  const senderEmail = `${claim.sender_handle}@basemail.ai`;
  const claimerEmail = `${auth.handle}@basemail.ai`;
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
  const r2Key = `emails/${auth.handle}/inbox/${receiptEmailId}.eml`;
  await c.env.EMAIL_STORE.put(r2Key, rawMime);

  const snippet = `You claimed a payment of ${amountStr} USDC from ${claim.sender_handle}.`;

  await c.env.DB.prepare(
    `INSERT INTO emails (id, handle, folder, from_addr, to_addr, subject, snippet, r2_key, size, read, created_at, usdc_amount, usdc_tx, usdc_network)
     VALUES (?, ?, 'inbox', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).bind(
    receiptEmailId, auth.handle, senderEmail, claimerEmail,
    receiptSubject, snippet, r2Key, rawMime.length,
    now, amountStr, releaseTx, claim.network,
  ).run();

  // Update escrow_claims
  await c.env.DB.prepare(
    `UPDATE escrow_claims SET status = 'claimed', claimer_handle = ?, claimer_wallet = ?, release_tx = ?, receipt_email_id = ?, claimed_at = ? WHERE claim_id = ?`
  ).bind(auth.handle, auth.wallet, releaseTx, receiptEmailId, now, claimId).run();

  return c.json({
    success: true,
    claim_id: claimId,
    amount_usdc: amountStr,
    release_tx: releaseTx,
    receipt_email_id: receiptEmailId,
    claimer: auth.handle,
  });
});

export default claimRoutes;
