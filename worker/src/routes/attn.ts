/**
 * BaseMail v3.0 — $ATTN Token Economy (Off-chain Points)
 *
 * "All positive feedback, no punishment." — Tom Lam
 *
 * Routes: /api/attn/*
 * Tables: attn_balances, attn_transactions, attn_escrow, attn_settings
 *
 * Rollback: Delete this file + remove route from index.ts. Tables are inert.
 */

import { Hono } from 'hono';
import { createPublicClient, http, parseAbi, type Hex } from 'viem';
import { base } from 'viem/chains';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';

// ── Constants ──
export const ATTN = {
  SIGNUP_GRANT: 50,
  DAILY_DRIP: 10,
  DAILY_EARN_CAP: 200,
  DEFAULT_STAKE: 1,
  COLD_STAKE: 3,
  REPLY_STAKE: 1,
  REPLY_BONUS: 2,
  MIN_STAKE: 1,
  MAX_STAKE: 10,
  ESCROW_WINDOW: 48 * 60 * 60, // 48h in seconds
  BUY_RATE: 100, // 1 USDC = 100 ATTN
} as const;

// ── USDC on Base Mainnet ──
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export const attnRoutes = new Hono<AppBindings>();

// ── Auto-migrate: ensure ATTN tables exist ──
let migrated = false;
attnRoutes.use('/*', async (c, next) => {
  if (!migrated) {
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS attn_balances (
          wallet TEXT PRIMARY KEY,
          handle TEXT NOT NULL,
          balance INTEGER NOT NULL DEFAULT 0,
          daily_earned INTEGER NOT NULL DEFAULT 0,
          last_drip_at INTEGER NOT NULL DEFAULT (unixepoch()),
          last_earn_reset INTEGER NOT NULL DEFAULT (unixepoch()),
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )`),
        c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS attn_transactions (
          id TEXT PRIMARY KEY,
          wallet TEXT NOT NULL,
          amount INTEGER NOT NULL,
          type TEXT NOT NULL,
          ref_email_id TEXT,
          note TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        )`),
        c.env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_attn_tx_wallet ON attn_transactions(wallet, created_at)`),
        c.env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_attn_tx_date ON attn_transactions(wallet, type, created_at)`),
        c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS attn_escrow (
          email_id TEXT PRIMARY KEY,
          sender_wallet TEXT NOT NULL,
          receiver_wallet TEXT NOT NULL,
          sender_handle TEXT NOT NULL,
          receiver_handle TEXT NOT NULL,
          amount INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          expires_at INTEGER NOT NULL,
          settled_at INTEGER
        )`),
        c.env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_attn_escrow_status ON attn_escrow(status, expires_at)`),
        c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS attn_settings (
          handle TEXT PRIMARY KEY,
          receive_price INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )`),
      ]);
    } catch (e) {
      console.error('ATTN migration:', e);
    }
    migrated = true;
  }
  await next();
});

// All endpoints require auth
attnRoutes.use('/*', authMiddleware());

// ══════════════════════════════════════════════
// GET /api/attn/balance
// ══════════════════════════════════════════════

attnRoutes.get('/balance', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const wallet = auth.wallet.toLowerCase();
  let bal = await c.env.DB.prepare(
    'SELECT balance, daily_earned, last_drip_at, last_earn_reset, created_at FROM attn_balances WHERE wallet = ?'
  ).bind(wallet).first<{
    balance: number; daily_earned: number; last_drip_at: number;
    last_earn_reset: number; created_at: number;
  }>();

  if (!bal) {
    // Auto-create balance (shouldn't happen if auth grants it, but be safe)
    await ensureBalance(c.env.DB, wallet, auth.handle);
    bal = { balance: ATTN.SIGNUP_GRANT, daily_earned: 0, last_drip_at: Math.floor(Date.now() / 1000), last_earn_reset: Math.floor(Date.now() / 1000), created_at: Math.floor(Date.now() / 1000) };
  }

  const now = Math.floor(Date.now() / 1000);
  const nextDrip = bal.last_drip_at + 86400;
  const dailyEarnRemaining = Math.max(0, ATTN.DAILY_EARN_CAP - bal.daily_earned);

  return c.json({
    handle: auth.handle,
    balance: bal.balance,
    daily_earned: bal.daily_earned,
    daily_earn_cap: ATTN.DAILY_EARN_CAP,
    daily_earn_remaining: dailyEarnRemaining,
    next_drip_at: nextDrip,
    next_drip_in_seconds: Math.max(0, nextDrip - now),
    constants: {
      daily_drip: ATTN.DAILY_DRIP,
      cold_stake: ATTN.COLD_STAKE,
      reply_stake: ATTN.REPLY_STAKE,
      reply_bonus: ATTN.REPLY_BONUS,
      buy_rate: `1 USDC = ${ATTN.BUY_RATE} ATTN`,
    },
  });
});

// ══════════════════════════════════════════════
// GET /api/attn/history
// ══════════════════════════════════════════════

attnRoutes.get('/history', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const wallet = auth.wallet.toLowerCase();
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  const rows = await c.env.DB.prepare(
    'SELECT id, amount, type, ref_email_id, note, created_at FROM attn_transactions WHERE wallet = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(wallet, limit, offset).all();

  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM attn_transactions WHERE wallet = ?'
  ).bind(wallet).first<{ total: number }>();

  return c.json({
    transactions: rows.results,
    total: countResult?.total || 0,
    limit,
    offset,
  });
});

// ══════════════════════════════════════════════
// POST /api/attn/buy — Purchase ATTN with USDC
// ══════════════════════════════════════════════

attnRoutes.post('/buy', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle || !auth.wallet) return c.json({ error: 'Wallet-based auth required' }, 403);

  const { tx_hash, network } = await c.req.json<{
    tx_hash: string;
    network?: string; // default: 'base-mainnet'
  }>();

  if (!tx_hash) return c.json({ error: 'tx_hash is required' }, 400);

  const wallet = auth.wallet.toLowerCase();

  // Verify on-chain USDC transfer
  try {
    const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
    const receipt = await client.waitForTransactionReceipt({
      hash: tx_hash as Hex,
      timeout: 15_000,
    });

    if (receipt.status !== 'success') {
      return c.json({ error: 'Transaction failed on-chain' }, 400);
    }

    // Find USDC Transfer event
    const transferLog = receipt.logs.find(
      (log) => log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()
        && log.topics[0] === USDC_TRANSFER_TOPIC
    );

    if (!transferLog || !transferLog.topics[1]) {
      return c.json({ error: 'No USDC Transfer event found' }, 400);
    }

    const txFrom = ('0x' + transferLog.topics[1].slice(26)).toLowerCase();
    if (txFrom !== wallet) {
      return c.json({ error: 'USDC sender does not match authenticated wallet' }, 400);
    }

    // Check not already used
    const existing = await c.env.DB.prepare(
      'SELECT id FROM attn_transactions WHERE note LIKE ? AND type = \'purchase\''
    ).bind(`%${tx_hash}%`).first();
    if (existing) {
      return c.json({ error: 'This transaction has already been used to purchase ATTN' }, 409);
    }

    const usdcAmount = Number(BigInt(transferLog.data)) / 1e6;
    const attnAmount = Math.floor(usdcAmount * ATTN.BUY_RATE);

    if (attnAmount < 1) {
      return c.json({ error: `Minimum purchase: ${(1 / ATTN.BUY_RATE).toFixed(4)} USDC (= 1 ATTN)` }, 400);
    }

    await ensureBalance(c.env.DB, wallet, auth.handle);

    const txId = generateId();
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE attn_balances SET balance = balance + ? WHERE wallet = ?')
        .bind(attnAmount, wallet),
      c.env.DB.prepare(
        'INSERT INTO attn_transactions (id, wallet, amount, type, note) VALUES (?, ?, ?, \'purchase\', ?)'
      ).bind(txId, wallet, attnAmount, `${usdcAmount.toFixed(2)} USDC → ${attnAmount} ATTN | tx: ${tx_hash}`),
    ]);

    return c.json({
      success: true,
      usdc_spent: usdcAmount.toFixed(2),
      attn_received: attnAmount,
      rate: `1 USDC = ${ATTN.BUY_RATE} ATTN`,
      tx_hash,
    });
  } catch (e: any) {
    return c.json({ error: `Verification failed: ${e.message}` }, 400);
  }
});

// ══════════════════════════════════════════════
// GET /api/attn/settings — My receive price
// ══════════════════════════════════════════════

attnRoutes.get('/settings', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const settings = await c.env.DB.prepare(
    'SELECT receive_price, updated_at FROM attn_settings WHERE handle = ?'
  ).bind(auth.handle).first<{ receive_price: number; updated_at: number }>();

  return c.json({
    handle: auth.handle,
    receive_price: settings?.receive_price ?? ATTN.DEFAULT_STAKE,
    min: ATTN.MIN_STAKE,
    max: ATTN.MAX_STAKE,
    note: 'receive_price is the ATTN stake required to email you. Cold emails cost max(receive_price, COLD_STAKE).',
  });
});

// ══════════════════════════════════════════════
// PUT /api/attn/settings — Set receive price
// ══════════════════════════════════════════════

attnRoutes.put('/settings', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const { receive_price } = await c.req.json<{ receive_price: number }>();

  if (typeof receive_price !== 'number' || receive_price < ATTN.MIN_STAKE || receive_price > ATTN.MAX_STAKE) {
    return c.json({ error: `receive_price must be between ${ATTN.MIN_STAKE} and ${ATTN.MAX_STAKE}` }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO attn_settings (handle, receive_price, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(handle) DO UPDATE SET receive_price = ?, updated_at = ?`
  ).bind(auth.handle, receive_price, now, receive_price, now).run();

  return c.json({ success: true, receive_price });
});

// ══════════════════════════════════════════════
// Helpers (exported for use by send.ts, inbox.ts, cron.ts)
// ══════════════════════════════════════════════

/**
 * Ensure attn_balances row exists for a wallet.
 * Creates with signup grant if new.
 */
export async function ensureBalance(db: D1Database, wallet: string, handle: string): Promise<void> {
  const w = wallet.toLowerCase();
  const existing = await db.prepare('SELECT wallet FROM attn_balances WHERE wallet = ?').bind(w).first();
  if (!existing) {
    const now = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare(
        'INSERT OR IGNORE INTO attn_balances (wallet, handle, balance, last_drip_at, last_earn_reset, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(w, handle, ATTN.SIGNUP_GRANT, now, now, now),
      db.prepare(
        'INSERT INTO attn_transactions (id, wallet, amount, type, note, created_at) VALUES (?, ?, ?, \'signup_grant\', \'Welcome to BaseMail! 🎉\', ?)'
      ).bind(generateId(), w, ATTN.SIGNUP_GRANT, now),
    ]);
  }
}

/**
 * Determine stake amount for sending email.
 * Returns 0 if no stake needed (self-send, whitelisted).
 */
export async function getStakeAmount(
  db: D1Database,
  senderHandle: string,
  senderWallet: string,
  recipientHandle: string,
): Promise<{ amount: number; reason: 'cold' | 'reply' | 'self' | 'whitelisted' }> {
  // Self-send
  const recipientAcct = await db.prepare(
    'SELECT wallet FROM accounts WHERE handle = ?'
  ).bind(recipientHandle).first<{ wallet: string }>();
  if (recipientAcct && recipientAcct.wallet.toLowerCase() === senderWallet.toLowerCase()) {
    return { amount: 0, reason: 'self' };
  }

  // Whitelisted
  const wl = await db.prepare(
    'SELECT id FROM attention_whitelist WHERE recipient_handle = ? AND (sender_handle = ? OR sender_wallet = ?)'
  ).bind(recipientHandle, senderHandle, senderWallet).first();
  if (wl) {
    return { amount: 0, reason: 'whitelisted' };
  }

  // Check if existing conversation (recipient has emailed sender before)
  const priorEmail = await db.prepare(
    `SELECT id FROM emails WHERE handle = ? AND from_addr LIKE ? AND folder = 'inbox' LIMIT 1`
  ).bind(senderHandle, `${recipientHandle}@%`).first();

  if (priorEmail) {
    // Reply thread: lower stake
    const settings = await db.prepare(
      'SELECT receive_price FROM attn_settings WHERE handle = ?'
    ).bind(recipientHandle).first<{ receive_price: number }>();
    return { amount: settings?.receive_price ?? ATTN.REPLY_STAKE, reason: 'reply' };
  }

  // Cold email: higher stake
  const settings = await db.prepare(
    'SELECT receive_price FROM attn_settings WHERE handle = ?'
  ).bind(recipientHandle).first<{ receive_price: number }>();
  const coldPrice = Math.max(settings?.receive_price ?? ATTN.DEFAULT_STAKE, ATTN.COLD_STAKE);
  return { amount: coldPrice, reason: 'cold' };
}

/**
 * Stake ATTN from sender for an email.
 * Returns null if insufficient balance (email should still send).
 */
export async function stakeAttn(
  db: D1Database,
  senderWallet: string,
  senderHandle: string,
  receiverWallet: string,
  receiverHandle: string,
  emailId: string,
  amount: number,
): Promise<{ escrowed: boolean; balance_after: number } | null> {
  const w = senderWallet.toLowerCase();
  const rw = receiverWallet.toLowerCase();

  // Check balance
  const bal = await db.prepare('SELECT balance FROM attn_balances WHERE wallet = ?')
    .bind(w).first<{ balance: number }>();

  if (!bal || bal.balance < amount) {
    return null; // Insufficient — caller should still send email
  }

  const now = Math.floor(Date.now() / 1000);
  const txId = generateId();

  await db.batch([
    // Deduct from sender
    db.prepare('UPDATE attn_balances SET balance = balance - ? WHERE wallet = ?')
      .bind(amount, w),
    // Create escrow
    db.prepare(
      `INSERT INTO attn_escrow (email_id, sender_wallet, receiver_wallet, sender_handle, receiver_handle, amount, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(emailId, w, rw, senderHandle, receiverHandle, amount, now, now + ATTN.ESCROW_WINDOW),
    // Log transaction
    db.prepare(
      'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'stake\', ?, ?, ?)'
    ).bind(txId, w, -amount, emailId, `Staked ${amount} ATTN to email ${receiverHandle}`, now),
  ]);

  return { escrowed: true, balance_after: bal.balance - amount };
}

/**
 * Refund ATTN to sender when email is read.
 * Returns refund amount, or 0 if no escrow found.
 */
export async function refundOnRead(db: D1Database, emailId: string): Promise<number> {
  const escrow = await db.prepare(
    'SELECT sender_wallet, sender_handle, amount FROM attn_escrow WHERE email_id = ? AND status = \'pending\''
  ).bind(emailId).first<{ sender_wallet: string; sender_handle: string; amount: number }>();

  if (!escrow) return 0;

  const now = Math.floor(Date.now() / 1000);
  const txId = generateId();

  await db.batch([
    // Refund sender
    db.prepare('UPDATE attn_balances SET balance = balance + ? WHERE wallet = ?')
      .bind(escrow.amount, escrow.sender_wallet),
    // Mark escrow as refunded
    db.prepare('UPDATE attn_escrow SET status = \'refunded\', settled_at = ? WHERE email_id = ?')
      .bind(now, emailId),
    // Log
    db.prepare(
      'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'refund\', ?, \'Email was read — refund\', ?)'
    ).bind(txId, escrow.sender_wallet, escrow.amount, emailId, now),
  ]);

  return escrow.amount;
}

/**
 * Process reply bonus: refund escrow + mint bonus for both parties.
 */
export async function processReplyBonus(
  db: D1Database,
  emailId: string,
  replierWallet: string,
  replierHandle: string,
): Promise<{ refunded: number; bonus: number } | null> {
  const escrow = await db.prepare(
    'SELECT sender_wallet, sender_handle, receiver_wallet, receiver_handle, amount FROM attn_escrow WHERE email_id = ? AND status = \'pending\''
  ).bind(emailId).first<{
    sender_wallet: string; sender_handle: string;
    receiver_wallet: string; receiver_handle: string; amount: number;
  }>();

  if (!escrow) return null;

  const now = Math.floor(Date.now() / 1000);

  await db.batch([
    // Refund sender's stake
    db.prepare('UPDATE attn_balances SET balance = balance + ? WHERE wallet = ?')
      .bind(escrow.amount, escrow.sender_wallet),
    // Bonus to sender
    db.prepare('UPDATE attn_balances SET balance = balance + ? WHERE wallet = ?')
      .bind(ATTN.REPLY_BONUS, escrow.sender_wallet),
    // Bonus to replier (receiver of original email)
    db.prepare('UPDATE attn_balances SET balance = balance + ? WHERE wallet = ?')
      .bind(ATTN.REPLY_BONUS, replierWallet),
    // Mark escrow
    db.prepare('UPDATE attn_escrow SET status = \'refunded\', settled_at = ? WHERE email_id = ?')
      .bind(now, emailId),
    // Transactions
    db.prepare(
      'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'refund\', ?, \'Reply received — refund\', ?)'
    ).bind(generateId(), escrow.sender_wallet, escrow.amount, emailId, now),
    db.prepare(
      'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'reply_bonus\', ?, \'Reply bonus — great conversation! 🎉\', ?)'
    ).bind(generateId(), escrow.sender_wallet, ATTN.REPLY_BONUS, emailId, now),
    db.prepare(
      'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'reply_bonus\', ?, \'Reply bonus — thanks for replying! 🎉\', ?)'
    ).bind(generateId(), replierWallet, ATTN.REPLY_BONUS, emailId, now),
  ]);

  return { refunded: escrow.amount, bonus: ATTN.REPLY_BONUS };
}

/**
 * Reject email: immediately transfer ATTN to receiver.
 */
export async function rejectEmail(
  db: D1Database,
  emailId: string,
  receiverWallet: string,
): Promise<{ transferred: number } | null> {
  const escrow = await db.prepare(
    'SELECT sender_wallet, sender_handle, amount FROM attn_escrow WHERE email_id = ? AND status = \'pending\''
  ).bind(emailId).first<{ sender_wallet: string; sender_handle: string; amount: number }>();

  if (!escrow) return null;

  // Check daily earn cap
  const receiver = await db.prepare(
    'SELECT daily_earned FROM attn_balances WHERE wallet = ?'
  ).bind(receiverWallet.toLowerCase()).first<{ daily_earned: number }>();

  if (receiver && receiver.daily_earned + escrow.amount > ATTN.DAILY_EARN_CAP) {
    // Cap reached — refund to sender instead (all positive: no tokens destroyed)
    await refundOnRead(db, emailId);
    return { transferred: 0 };
  }

  const now = Math.floor(Date.now() / 1000);

  await db.batch([
    // Transfer to receiver
    db.prepare('UPDATE attn_balances SET balance = balance + ?, daily_earned = daily_earned + ? WHERE wallet = ?')
      .bind(escrow.amount, escrow.amount, receiverWallet.toLowerCase()),
    // Mark escrow
    db.prepare('UPDATE attn_escrow SET status = \'transferred\', settled_at = ? WHERE email_id = ?')
      .bind(now, emailId),
    // Log for receiver
    db.prepare(
      'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'compensation\', ?, \'Email rejected — attention compensation\', ?)'
    ).bind(generateId(), receiverWallet.toLowerCase(), escrow.amount, emailId, now),
    // Log for sender
    db.prepare(
      'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'forfeit\', ?, \'Email was rejected\', ?)'
    ).bind(generateId(), escrow.sender_wallet, -escrow.amount, emailId, now),
  ]);

  return { transferred: escrow.amount };
}

// ── ID generator ──
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `attn-${timestamp}-${random}`;
}
