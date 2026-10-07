/**
 * Gas top-ups for escrowed USDC.
 *
 * An external recipient has no wallet until they claim, so the sender pays
 * the gas ETH for all of them in one plain ETH transfer to the BaseMail
 * wallet (WALLET_ADDRESS, the same key that owns PaymentEscrow), tagged by
 * its value: the last six digits in wei are GAS_TOPUP_TAG_WEI. (Not calldata:
 * MetaMask refuses data on a transfer to an address that is one of the
 * user's own accounts, and hardware wallets warn on it.) Each claim records
 * its share; the worker forwards it to the claimer on release, or back to
 * the sender once the claim expires unclaimed (cron).
 *
 * WALLET_ADDRESS also receives credit / Pro purchases, so a tagged tx can
 * never be redeemed there and vice versa (see isGasTopupTx).
 */
import { createPublicClient, createWalletClient, formatEther, toHex, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { baseTransport } from './rpc';
import type { Env } from './types';

export const GAS_TOPUP_TAG_MOD = 1_000_000n;
export const GAS_TOPUP_TAG_WEI = 424_242n; // value % GAS_TOPUP_TAG_MOD — about 4e-13 ETH
/** Older top-ups carried this as calldata; still honoured so credits / Pro keep refusing them */
const LEGACY_MARKER_HEX = toHex('basemail:gas-topup').slice(2).toLowerCase();

/** Per-recipient ceiling — a top-up is a few payments' worth of gas, not a transfer */
export const MAX_GAS_TOPUP_WEI = 10n ** 15n; // 0.001 ETH

export type GasStatus = 'pending' | 'sending' | 'sent' | 'refunded';

let columnsReady = false;
export async function ensureEscrowGasColumns(db: D1Database) {
  if (columnsReady) return;
  for (const col of ['gas_topup_wei INTEGER', 'gas_topup_tx TEXT', 'gas_status TEXT', 'gas_release_tx TEXT']) {
    try { await db.prepare(`ALTER TABLE escrow_claims ADD COLUMN ${col}`).run(); } catch { /* exists */ }
  }
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_escrow_gas_tx ON escrow_claims(gas_topup_tx)').run(); } catch {}
  columnsReady = true;
}

export function isGasTopupValue(value: bigint) {
  return value % GAS_TOPUP_TAG_MOD === GAS_TOPUP_TAG_WEI;
}

/** True if this tx was (or is tagged to be) used as a gas top-up — credits / Pro must refuse it */
export async function isGasTopupTx(db: D1Database, txHash: string, tx?: { value?: bigint; input?: string | null }) {
  if (tx?.value !== undefined && isGasTopupValue(tx.value)) return true;
  if (tx?.input && tx.input.toLowerCase().includes(LEGACY_MARKER_HEX)) return true;
  try {
    const row = await db.prepare('SELECT 1 FROM escrow_claims WHERE gas_topup_tx = ? LIMIT 1').bind(txHash.toLowerCase()).first();
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Verify the sender's top-up tx and allocate `amountWei` of it to a claim.
 * The allocation is a single conditional UPDATE, so the claims sharing one
 * tx can never add up to more than it paid.
 */
export async function attachGasTopup(
  env: Env,
  opts: { claimId: string; senderHandle: string; senderWallet: string; txHash: string; amountWei: string; network: string },
): Promise<{ recorded: true; amount_eth: string } | { recorded: false; error: string }> {
  const fail = (error: string) => ({ recorded: false as const, error });
  if (opts.network !== 'base-mainnet') return fail('Gas top-ups are only supported on Base Mainnet');
  if (!/^0x[0-9a-fA-F]{64}$/.test(opts.txHash)) return fail('Invalid gas top-up tx hash');
  if (!/^\d+$/.test(opts.amountWei)) return fail('amount_wei must be an integer string');
  const amount = BigInt(opts.amountWei);
  if (amount <= 0n || amount > MAX_GAS_TOPUP_WEI) return fail(`amount_wei must be between 1 and ${MAX_GAS_TOPUP_WEI}`);
  const txHash = opts.txHash.toLowerCase();

  const usedForCredits = await env.DB.prepare('SELECT 1 FROM credit_transactions WHERE tx_hash = ? LIMIT 1').bind(opts.txHash).first().catch(() => null);
  if (usedForCredits) return fail('This transaction was already used to buy credits');

  const client = createPublicClient({ chain: base, transport: baseTransport() });
  let tx, receipt;
  try {
    receipt = await client.waitForTransactionReceipt({ hash: txHash as Hex, timeout: 15_000 });
    tx = await client.getTransaction({ hash: txHash as Hex });
  } catch {
    return fail('Gas top-up transaction not found on Base yet');
  }
  if (receipt.status !== 'success') return fail('Gas top-up transaction failed on-chain');
  if (tx.from.toLowerCase() !== opts.senderWallet.toLowerCase()) return fail('Gas top-up must come from your own wallet');
  if (!env.WALLET_ADDRESS || tx.to?.toLowerCase() !== env.WALLET_ADDRESS.toLowerCase()) return fail('Gas top-up must be sent to the BaseMail wallet');
  if (!isGasTopupValue(tx.value)) return fail(`Gas top-up value must end in ${GAS_TOPUP_TAG_WEI} wei (value % ${GAS_TOPUP_TAG_MOD} === ${GAS_TOPUP_TAG_WEI})`);

  await ensureEscrowGasColumns(env.DB);
  const res = await env.DB.prepare(
    `UPDATE escrow_claims SET gas_topup_wei = CAST(? AS INTEGER), gas_topup_tx = ?, gas_status = 'pending'
     WHERE claim_id = ? AND sender_handle = ? AND gas_topup_tx IS NULL
       AND (SELECT COALESCE(SUM(gas_topup_wei), 0) FROM escrow_claims WHERE gas_topup_tx = ?) + CAST(? AS INTEGER) <= CAST(? AS INTEGER)`
  ).bind(amount.toString(), txHash, opts.claimId, opts.senderHandle, txHash, amount.toString(), (tx.value - GAS_TOPUP_TAG_WEI).toString()).run(); // the tag isn't allocatable
  if (!res.meta.changes) {
    const existing = await env.DB.prepare('SELECT gas_topup_tx, gas_topup_wei FROM escrow_claims WHERE claim_id = ? AND sender_handle = ?')
      .bind(opts.claimId, opts.senderHandle).first<{ gas_topup_tx: string | null; gas_topup_wei: number | null }>();
    if (existing?.gas_topup_tx === txHash) return { recorded: true, amount_eth: formatEther(BigInt(existing.gas_topup_wei || 0)) };
    return fail('Gas top-up tx is already fully allocated, or this claim already has one');
  }

  return { recorded: true, amount_eth: formatEther(amount) };
}

/**
 * Send a claim's gas top-up from the BaseMail wallet — to the claimer on
 * release, or back to the sender on expiry. 'pending' → 'sending' is the
 * lock; a broadcast failure puts it back to 'pending' for the next attempt.
 */
export async function forwardGasTopup(
  env: Env,
  claimId: string,
  to: string,
  kind: 'release' | 'refund',
): Promise<{ tx: Hex; amount_eth: string } | null> {
  if (!env.WALLET_PRIVATE_KEY) return null;
  await ensureEscrowGasColumns(env.DB);
  const row = await env.DB.prepare(
    "SELECT gas_topup_wei FROM escrow_claims WHERE claim_id = ? AND gas_status = 'pending' AND gas_topup_wei > 0"
  ).bind(claimId).first<{ gas_topup_wei: number }>();
  if (!row) return null;

  const locked = await env.DB.prepare(
    "UPDATE escrow_claims SET gas_status = 'sending' WHERE claim_id = ? AND gas_status = 'pending'"
  ).bind(claimId).run();
  if (!locked.meta.changes) return null;

  const value = BigInt(row.gas_topup_wei);
  try {
    const account = privateKeyToAccount(env.WALLET_PRIVATE_KEY as Hex);
    const wallet = createWalletClient({ chain: base, transport: baseTransport(), account });
    const tx = await wallet.sendTransaction({ to: to as Hex, value });
    await env.DB.prepare('UPDATE escrow_claims SET gas_status = ?, gas_release_tx = ? WHERE claim_id = ?')
      .bind(kind === 'release' ? 'sent' : 'refunded', tx, claimId).run();
    return { tx, amount_eth: formatEther(value) };
  } catch (e) {
    console.error(`claim ${claimId}: gas top-up ${kind} failed`, e);
    await env.DB.prepare("UPDATE escrow_claims SET gas_status = 'pending' WHERE claim_id = ? AND gas_status = 'sending'")
      .bind(claimId).run();
    return null;
  }
}

/**
 * Cron: retry forwards that failed at claim time, and return the gas of
 * claims that expired unclaimed (nothing in flight) to their senders.
 */
export async function settleGasTopups(env: Env, now: number) {
  await ensureEscrowGasColumns(env.DB);
  const claimed = await env.DB.prepare(
    "SELECT claim_id, claimer_wallet FROM escrow_claims WHERE gas_status = 'pending' AND status = 'claimed' AND claimer_wallet IS NOT NULL LIMIT 20"
  ).all<{ claim_id: string; claimer_wallet: string }>();
  for (const r of claimed.results || []) {
    await forwardGasTopup(env, r.claim_id, r.claimer_wallet, 'release');
  }

  const rows = await env.DB.prepare(
    `SELECT claim_id, sender_wallet FROM escrow_claims
     WHERE gas_status = 'pending' AND status IN ('pending', 'expired') AND release_tx IS NULL AND expires_at < ?
     LIMIT 20`
  ).bind(now).all<{ claim_id: string; sender_wallet: string }>();
  for (const r of rows.results || []) {
    if (r.sender_wallet) await forwardGasTopup(env, r.claim_id, r.sender_wallet, 'refund');
  }
}
