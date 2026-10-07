/**
 * POST /api/escrow/claims — record a PaymentEscrow deposit as a claim right after it confirms.
 *
 * Send USDC used to record a claim only when its claim email went out, at the
 * very end of a batch; if the batch stalled or the tab closed after the deposit,
 * the USDC sat in escrow with no claim and no way to claim it. The deposit is
 * read back from the contract, so amount and expiry come from chain and only
 * the depositor can record it. POST /api/send with the same claim_id later is
 * a no-op for the claim (INSERT OR IGNORE).
 */
import { Hono } from 'hono';
import { createPublicClient, keccak256, parseAbi, toHex, type Address } from 'viem';
import { base } from 'viem/chains';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';
import { baseTransport } from '../rpc';
import { ensureEscrowGasColumns } from '../escrow-gas';

const ESCROW_ABI = parseAbi([
  'function getDeposit(bytes32 claimId) view returns (address sender, uint256 amount, uint256 expiry, bool settled)',
]);

export const escrowRoutes = new Hono<AppBindings>();

escrowRoutes.post('/claims', authMiddleware(), async (c) => {
  const auth = c.get('auth');
  const { claim_id, recipient_email, deposit_tx, network } = await c.req.json<{
    claim_id?: string; recipient_email?: string; deposit_tx?: string; network?: string;
  }>().catch(() => ({} as Record<string, undefined>));

  if (!auth.handle) return c.json({ error: 'A registered BaseMail account is required' }, 403);
  if ((network || 'base-mainnet') !== 'base-mainnet') return c.json({ error: 'PaymentEscrow is on Base Mainnet only' }, 400);
  if (!claim_id || !/^[A-Za-z0-9-]{8,100}$/.test(claim_id)) return c.json({ error: 'Invalid claim_id' }, 400);
  if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email) || recipient_email.length > 254) {
    return c.json({ error: 'Invalid recipient_email' }, 400);
  }
  if (deposit_tx && !/^0x[0-9a-fA-F]{64}$/.test(deposit_tx)) return c.json({ error: 'Invalid deposit_tx' }, 400);
  if (!c.env.PAYMENT_ESCROW_ADDRESS) return c.json({ error: 'Escrow not configured on server' }, 500);

  // API keys carry no wallet — resolve it from the account
  let wallet = auth.wallet;
  if (!wallet) {
    const acct = await c.env.DB.prepare('SELECT wallet FROM accounts WHERE handle = ?').bind(auth.handle).first<{ wallet: string }>();
    wallet = acct?.wallet || '';
  }
  if (!wallet) return c.json({ error: 'No wallet linked to this account' }, 401);

  let sender: Address, amount: bigint, expiry: bigint;
  try {
    const client = createPublicClient({ chain: base, transport: baseTransport() });
    [sender, amount, expiry] = await client.readContract({
      address: c.env.PAYMENT_ESCROW_ADDRESS as Address,
      abi: ESCROW_ABI,
      functionName: 'getDeposit',
      args: [keccak256(toHex(claim_id))],
    });
  } catch (e: any) {
    return c.json({ error: `Could not read the escrow deposit: ${e.shortMessage || e.message}` }, 502);
  }
  if (/^0x0{40}$/i.test(sender)) return c.json({ error: 'No escrow deposit for this claim_id yet' }, 404);
  if (sender.toLowerCase() !== wallet.toLowerCase()) return c.json({ error: 'This deposit was made by another wallet' }, 403);

  await ensureEscrowGasColumns(c.env.DB);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO escrow_claims (claim_id, sender_handle, sender_wallet, recipient_email, amount_usdc, deposit_tx, network, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'base-mainnet', ?)`
  ).bind(claim_id, auth.handle, wallet, recipient_email.toLowerCase(), Number(amount) / 1e6, deposit_tx || '', Number(expiry)).run();

  const row = await c.env.DB.prepare('SELECT sender_handle, recipient_email, status FROM escrow_claims WHERE claim_id = ?')
    .bind(claim_id).first<{ sender_handle: string; recipient_email: string; status: string }>();
  if (!row || row.sender_handle !== auth.handle) return c.json({ error: 'claim_id already belongs to another sender' }, 409);

  return c.json({
    recorded: true,
    claim_id,
    recipient_email: row.recipient_email,
    amount_usdc: (Number(amount) / 1e6).toFixed(2),
    expires_at: Number(expiry),
    status: row.status,
    claim_url: `https://basemail.ai/claim/${claim_id}`,
  });
});
