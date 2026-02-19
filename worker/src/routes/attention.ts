import { Hono } from 'hono';
import { createPublicClient, http, decodeEventLog, parseAbi, type Hex } from 'viem';
import { base } from 'viem/chains';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';

// ── Base Mainnet constants ──
const BASE_RPC = 'https://mainnet.base.org';
const ESCROW_CONTRACT = '0x0f686c8ac82654fe0d3e3309f4243f13c9576b27';

const ESCROW_ABI = parseAbi([
  'event BondDeposited(bytes32 indexed emailId, address indexed sender, address indexed recipient, uint256 amount)',
]);

export const attentionRoutes = new Hono<AppBindings>();

// ══════════════════════════════════════════════
// PUBLIC: Get attention price for a recipient
// ══════════════════════════════════════════════

attentionRoutes.get('/price/:handle', async (c) => {
  const handle = c.req.param('handle').toLowerCase();

  const config = await c.env.DB.prepare(
    'SELECT base_price, alpha, beta, gamma, response_window, enabled FROM attention_config WHERE handle = ?'
  ).bind(handle).first<{
    base_price: number; alpha: number; beta: number; gamma: number;
    response_window: number; enabled: number;
  }>();

  if (!config || !config.enabled) {
    return c.json({
      handle,
      attention_bonds_enabled: false,
      price_usdc: 0,
      note: 'This recipient does not require attention bonds',
    });
  }

  // Calculate dynamic price: p(t) = p₀ · (1 + α·D(t))^β
  // D(t) = message count in rolling 7-day window
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
  const demandRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM emails WHERE handle = ? AND folder = ? AND created_at > ?'
  ).bind(handle, 'inbox', sevenDaysAgo).first<{ count: number }>();

  const demand = demandRow?.count || 0;
  const dynamicPrice = config.base_price * Math.pow(1 + config.alpha * demand, config.beta);

  return c.json({
    handle,
    attention_bonds_enabled: true,
    base_price_usdc: config.base_price,
    current_price_usdc: Math.round(dynamicPrice * 1e6) / 1e6,
    demand_7d: demand,
    response_window_hours: Math.round(config.response_window / 3600),
    parameters: {
      alpha: config.alpha,
      beta: config.beta,
      gamma: config.gamma,
    },
  });
});

// ══════════════════════════════════════════════
// PUBLIC: Get QAF score for a recipient
// ══════════════════════════════════════════════

attentionRoutes.get('/qaf/:handle', async (c) => {
  const handle = c.req.param('handle').toLowerCase();

  const score = await c.env.DB.prepare(
    'SELECT qaf_value, coqaf_value, unique_senders, total_bonds, updated_at FROM qaf_scores WHERE handle = ?'
  ).bind(handle).first<{
    qaf_value: number; coqaf_value: number; unique_senders: number;
    total_bonds: number; updated_at: number;
  }>();

  if (!score) {
    return c.json({ handle, qaf_value: 0, unique_senders: 0, total_bonds: 0 });
  }

  return c.json({
    handle,
    qaf_value: score.qaf_value,
    coqaf_value: score.coqaf_value,
    unique_senders: score.unique_senders,
    total_bonds_usdc: score.total_bonds,
    breadth_premium: score.unique_senders > 0 ? score.qaf_value / score.total_bonds : 0,
    updated_at: score.updated_at,
  });
});

// ══════════════════════════════════════════════
// PUBLIC: Get sender-specific price (with reply rate discount)
// ══════════════════════════════════════════════

attentionRoutes.get('/price/:handle/for/:sender', async (c) => {
  const handle = c.req.param('handle').toLowerCase();
  const senderHandle = c.req.param('sender').toLowerCase();

  const config = await c.env.DB.prepare(
    'SELECT base_price, alpha, beta, gamma, response_window, enabled FROM attention_config WHERE handle = ?'
  ).bind(handle).first<{
    base_price: number; alpha: number; beta: number; gamma: number;
    response_window: number; enabled: number;
  }>();

  if (!config || !config.enabled) {
    return c.json({ handle, sender: senderHandle, price_usdc: 0, bonds_required: false });
  }

  // Check whitelist
  const wl = await c.env.DB.prepare(
    'SELECT id FROM attention_whitelist WHERE recipient_handle = ? AND sender_handle = ?'
  ).bind(handle, senderHandle).first();

  if (wl) {
    return c.json({ handle, sender: senderHandle, price_usdc: 0, whitelisted: true });
  }

  // Get demand
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
  const demandRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM emails WHERE handle = ? AND folder = ? AND created_at > ?'
  ).bind(handle, 'inbox', sevenDaysAgo).first<{ count: number }>();
  const demand = demandRow?.count || 0;

  // Get sender reply rate
  const rep = await c.env.DB.prepare(
    'SELECT reply_rate FROM sender_reputation WHERE sender_handle = ? AND recipient_handle = ?'
  ).bind(senderHandle, handle).first<{ reply_rate: number }>();
  const replyRate = rep?.reply_rate || 0;

  // p(t,s) = p₀ · (1 + α·D(t))^β · (1 - γ·R̄ₛ(t))
  const price = config.base_price
    * Math.pow(1 + config.alpha * demand, config.beta)
    * (1 - config.gamma * replyRate);

  return c.json({
    handle,
    sender: senderHandle,
    price_usdc: Math.round(Math.max(price, config.base_price * (1 - config.gamma)) * 1e6) / 1e6,
    reply_rate: replyRate,
    demand_7d: demand,
    whitelisted: false,
  });
});

// ══════════════════════════════════════════════
// PUBLIC: Get CO-QAF breakdown (α_ij graph)
// ══════════════════════════════════════════════

attentionRoutes.get('/coqaf/:handle', async (c) => {
  const handle = c.req.param('handle').toLowerCase();

  // Get senders with bonds
  const bonds = await c.env.DB.prepare(`
    SELECT sender_handle, SUM(amount_usdc) as total_bond
    FROM attention_bonds
    WHERE recipient_handle = ? AND status IN ('active', 'refunded')
    GROUP BY sender_handle
  `).bind(handle).all<{ sender_handle: string; total_bond: number }>();

  if (!bonds.results || bonds.results.length === 0) {
    return c.json({ handle, coqaf_value: 0, qaf_value: 0, senders: [] });
  }

  const senders = bonds.results;

  // Compute recipient sets for Jaccard
  const recipientSets: Map<string, Set<string>> = new Map();
  for (const s of senders) {
    const bondRecipients = await c.env.DB.prepare(
      'SELECT DISTINCT recipient_handle FROM attention_bonds WHERE sender_handle = ?'
    ).bind(s.sender_handle).all<{ recipient_handle: string }>();
    const set = new Set<string>();
    for (const r of (bondRecipients.results || [])) set.add(r.recipient_handle.toLowerCase());
    recipientSets.set(s.sender_handle, set);
  }

  // Build α_ij matrix and sender details
  const senderDetails = senders.map(si => {
    const Ri = recipientSets.get(si.sender_handle) || new Set();
    const connections: { sender: string; alpha: number }[] = [];
    let sumAlpha = 0;

    for (const sj of senders) {
      if (sj.sender_handle === si.sender_handle) continue;
      const Rj = recipientSets.get(sj.sender_handle) || new Set();
      // Inline jaccard
      let inter = 0;
      for (const x of Ri) if (Rj.has(x)) inter++;
      const union = Ri.size + Rj.size - inter;
      const alpha = union > 0 ? inter / union : 0;
      if (alpha > 0) connections.push({ sender: sj.sender_handle, alpha: Math.round(alpha * 1000) / 1000 });
      sumAlpha += alpha;
    }

    const bTilde = si.total_bond / (1 + sumAlpha);
    return {
      sender: si.sender_handle,
      bond_usdc: si.total_bond,
      sum_alpha: Math.round(sumAlpha * 1000) / 1000,
      discounted_bond: Math.round(bTilde * 1e6) / 1e6,
      connections: connections.filter(c => c.alpha > 0),
    };
  });

  // Compute values
  let sumSqrtB = 0, sumSqrtBtilde = 0;
  for (const s of senderDetails) {
    const original = senders.find(x => x.sender_handle === s.sender)!;
    sumSqrtB += Math.sqrt(original.total_bond);
    sumSqrtBtilde += Math.sqrt(s.discounted_bond);
  }

  return c.json({
    handle,
    qaf_value: Math.round(sumSqrtB * sumSqrtB * 1e6) / 1e6,
    coqaf_value: Math.round(sumSqrtBtilde * sumSqrtBtilde * 1e6) / 1e6,
    discount_ratio: sumSqrtB > 0 ? Math.round((sumSqrtBtilde * sumSqrtBtilde) / (sumSqrtB * sumSqrtB) * 1000) / 1000 : 1,
    alpha_method: 'jaccard_recipient_overlap',
    alpha_description: 'α_ij = Jaccard(recipients_i, recipients_j) — high overlap means bonding (discounted), low overlap means bridging (full weight)',
    senders: senderDetails,
  });
});

// ══════════════════════════════════════════════
// AUTHENTICATED: Configure attention bonds
// ══════════════════════════════════════════════

const authed = new Hono<AppBindings>();
authed.use('/*', authMiddleware());

// Set attention config
authed.put('/config', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const body = await c.req.json<{
    enabled?: boolean;
    base_price?: number;
    alpha?: number;
    beta?: number;
    gamma?: number;
    response_window_hours?: number;
  }>();

  const now = Math.floor(Date.now() / 1000);

  // Validate parameters
  if (body.base_price !== undefined && (body.base_price < 0.001 || body.base_price > 1000)) {
    return c.json({ error: 'base_price must be between 0.001 and 1000 USDC' }, 400);
  }
  if (body.alpha !== undefined && (body.alpha < 0 || body.alpha > 10)) {
    return c.json({ error: 'alpha must be between 0 and 10' }, 400);
  }
  if (body.beta !== undefined && (body.beta < 0.1 || body.beta > 5)) {
    return c.json({ error: 'beta must be between 0.1 and 5' }, 400);
  }
  if (body.gamma !== undefined && (body.gamma < 0 || body.gamma > 0.99)) {
    return c.json({ error: 'gamma must be between 0 and 0.99' }, 400);
  }

  const responseWindow = body.response_window_hours
    ? Math.min(Math.max(body.response_window_hours * 3600, 86400), 30 * 86400)
    : 604800;

  await c.env.DB.prepare(`
    INSERT INTO attention_config (handle, base_price, alpha, beta, gamma, response_window, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(handle) DO UPDATE SET
      base_price = COALESCE(?, base_price),
      alpha = COALESCE(?, alpha),
      beta = COALESCE(?, beta),
      gamma = COALESCE(?, gamma),
      response_window = COALESCE(?, response_window),
      enabled = COALESCE(?, enabled),
      updated_at = ?
  `).bind(
    auth.handle,
    body.base_price ?? 0.01, body.alpha ?? 0.1, body.beta ?? 1.0,
    body.gamma ?? 0.5, responseWindow, body.enabled ? 1 : 0, now, now,
    body.base_price ?? null, body.alpha ?? null, body.beta ?? null,
    body.gamma ?? null, body.response_window_hours ? responseWindow : null,
    body.enabled !== undefined ? (body.enabled ? 1 : 0) : null, now,
  ).run();

  return c.json({ success: true, handle: auth.handle, config: body });
});

// Get my attention config
authed.get('/config', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const config = await c.env.DB.prepare(
    'SELECT * FROM attention_config WHERE handle = ?'
  ).bind(auth.handle).first();

  return c.json({ handle: auth.handle, config: config || { enabled: false } });
});

// ── Whitelist management ──

authed.get('/whitelist', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT sender_handle, sender_wallet, note, created_at FROM attention_whitelist WHERE recipient_handle = ? ORDER BY created_at DESC'
  ).bind(auth.handle).all();

  return c.json({ handle: auth.handle, whitelist: rows.results });
});

authed.post('/whitelist', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const { sender_handle, sender_wallet, note } = await c.req.json<{
    sender_handle?: string; sender_wallet?: string; note?: string;
  }>();

  if (!sender_handle && !sender_wallet) {
    return c.json({ error: 'Provide sender_handle or sender_wallet' }, 400);
  }

  const id = `wl-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  await c.env.DB.prepare(
    'INSERT INTO attention_whitelist (id, recipient_handle, sender_handle, sender_wallet, note) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, auth.handle, sender_handle || null, sender_wallet || null, note || null).run();

  return c.json({ success: true, id });
});

authed.delete('/whitelist/:sender', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);
  const sender = c.req.param('sender');

  await c.env.DB.prepare(
    'DELETE FROM attention_whitelist WHERE recipient_handle = ? AND (sender_handle = ? OR sender_wallet = ?)'
  ).bind(auth.handle, sender, sender).run();

  return c.json({ success: true });
});

// ── Bond stats ──

authed.get('/stats', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  // Bonds received
  const received = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunded,
      SUM(CASE WHEN status = 'forfeited' THEN 1 ELSE 0 END) as forfeited,
      SUM(amount_usdc) as total_usdc,
      SUM(CASE WHEN status = 'refunded' THEN amount_usdc ELSE 0 END) as refunded_usdc,
      SUM(CASE WHEN status = 'forfeited' THEN amount_usdc ELSE 0 END) as forfeited_usdc
    FROM attention_bonds WHERE recipient_handle = ?
  `).bind(auth.handle).first();

  // Bonds sent
  const sent = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunded,
      SUM(CASE WHEN status = 'forfeited' THEN 1 ELSE 0 END) as forfeited,
      SUM(amount_usdc) as total_usdc
    FROM attention_bonds WHERE sender_handle = ?
  `).bind(auth.handle).first();

  // QAF score
  const qaf = await c.env.DB.prepare(
    'SELECT qaf_value, unique_senders, total_bonds FROM qaf_scores WHERE handle = ?'
  ).bind(auth.handle).first();

  return c.json({
    handle: auth.handle,
    bonds_received: received,
    bonds_sent: sent,
    qaf: qaf || { qaf_value: 0, unique_senders: 0, total_bonds: 0 },
  });
});

// ── Record bond deposit (called after on-chain tx) ──

authed.post('/bond', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const { email_id, recipient_handle, tx_hash } = await c.req.json<{
    email_id: string;
    recipient_handle: string;
    tx_hash: string;
  }>();

  if (!email_id || !recipient_handle || !tx_hash) {
    return c.json({ error: 'email_id, recipient_handle, tx_hash required' }, 400);
  }

  // Get recipient wallet
  const recipient = await c.env.DB.prepare(
    'SELECT wallet FROM accounts WHERE handle = ?'
  ).bind(recipient_handle).first<{ wallet: string }>();
  if (!recipient) return c.json({ error: 'Recipient not found' }, 404);

  // ── On-chain verification: parse BondDeposited event from tx receipt ──
  let verifiedAmount: number;
  try {
    const client = createPublicClient({ chain: base, transport: http(BASE_RPC) });
    const receipt = await client.waitForTransactionReceipt({
      hash: tx_hash as Hex,
      timeout: 15_000,
    });

    if (receipt.status !== 'success') {
      return c.json({ error: 'Transaction failed on-chain' }, 400);
    }

    // Find BondDeposited event from our escrow contract
    const bondLog = receipt.logs.find(
      (log) => log.address.toLowerCase() === ESCROW_CONTRACT.toLowerCase()
        && log.topics.length >= 4 // emailId, sender, recipient are indexed
    );

    if (!bondLog) {
      return c.json({ error: 'No BondDeposited event found from escrow contract' }, 400);
    }

    // Decode the event
    const decoded = decodeEventLog({
      abi: ESCROW_ABI,
      data: bondLog.data,
      topics: bondLog.topics,
    });

    if (decoded.eventName !== 'BondDeposited') {
      return c.json({ error: 'Unexpected event from escrow contract' }, 400);
    }

    const { emailId: onChainEmailId, sender: onChainSender, recipient: onChainRecipient, amount } = decoded.args;

    // Verify sender matches authenticated wallet
    if (!auth.wallet) {
      return c.json({ error: 'Bond verification requires wallet-based auth (JWT), not API key' }, 400);
    }
    if (onChainSender.toLowerCase() !== auth.wallet.toLowerCase()) {
      return c.json({ error: 'On-chain sender does not match authenticated wallet' }, 400);
    }

    // Verify recipient matches
    if (onChainRecipient.toLowerCase() !== recipient.wallet.toLowerCase()) {
      return c.json({ error: 'On-chain recipient does not match recipient wallet' }, 400);
    }

    // Amount is in USDC (6 decimals)
    verifiedAmount = Number(amount) / 1e6;

    if (verifiedAmount < 0.001) {
      return c.json({ error: 'Bond amount below minimum (0.001 USDC)' }, 400);
    }
  } catch (e: any) {
    return c.json({ error: `On-chain verification failed: ${e.message}` }, 400);
  }

  // Get response window
  const config = await c.env.DB.prepare(
    'SELECT response_window FROM attention_config WHERE handle = ?'
  ).bind(recipient_handle).first<{ response_window: number }>();
  const window = config?.response_window || 604800;

  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(`
    INSERT INTO attention_bonds (email_id, sender_handle, sender_wallet, recipient_handle, recipient_wallet, amount_usdc, tx_hash, status, deposit_time, response_deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(
    email_id, auth.handle, auth.wallet || '', recipient_handle, recipient.wallet,
    verifiedAmount, tx_hash, now, now + window,
  ).run();

  // Update sender reputation
  await c.env.DB.prepare(`
    INSERT INTO sender_reputation (id, sender_handle, recipient_handle, emails_sent, total_bonded, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(sender_handle, recipient_handle) DO UPDATE SET
      emails_sent = emails_sent + 1,
      total_bonded = total_bonded + ?,
      last_email_at = ?,
      updated_at = ?
  `).bind(
    `rep-${Date.now().toString(36)}`, auth.handle, recipient_handle, verifiedAmount, now,
    verifiedAmount, now, now,
  ).run();

  // Recalculate QAF
  await recalculateQAF(c.env.DB, recipient_handle);

  return c.json({
    success: true,
    email_id,
    bond_status: 'active',
    verified_amount_usdc: verifiedAmount,
    deadline: now + window,
    tx_hash,
  });
});

// ── Mark reply → trigger refund tracking ──

authed.post('/reply/:email_id', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);
  const emailId = c.req.param('email_id');

  const bond = await c.env.DB.prepare(
    'SELECT * FROM attention_bonds WHERE email_id = ? AND recipient_handle = ? AND status = ?'
  ).bind(emailId, auth.handle, 'active').first<{
    email_id: string; sender_handle: string; amount_usdc: number;
  }>();

  if (!bond) {
    return c.json({ error: 'No active bond found for this email' }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const protocolFee = bond.amount_usdc * 0.1; // 10% τ
  const refund = bond.amount_usdc - protocolFee;

  await c.env.DB.prepare(
    'UPDATE attention_bonds SET status = ?, resolved_time = ?, protocol_fee = ? WHERE email_id = ?'
  ).bind('refunded', now, protocolFee, emailId).run();

  // Update sender reputation
  await c.env.DB.prepare(`
    UPDATE sender_reputation SET
      emails_replied = emails_replied + 1,
      total_refunded = total_refunded + ?,
      reply_rate = CAST(emails_replied + 1 AS REAL) / CAST(emails_sent AS REAL),
      updated_at = ?
    WHERE sender_handle = ? AND recipient_handle = ?
  `).bind(refund, now, bond.sender_handle, auth.handle).run();

  return c.json({
    success: true,
    email_id: emailId,
    status: 'refunded',
    refund_usdc: refund,
    protocol_fee_usdc: protocolFee,
    note: 'On-chain refund should be triggered via AttentionBondEscrow.reply()',
  });
});

// Mount authenticated routes
attentionRoutes.route('/', authed);

// ══════════════════════════════════════════════
// Helper: Recalculate QAF score
// ══════════════════════════════════════════════

async function recalculateQAF(db: D1Database, handle: string) {
  // Get all active + refunded bonds for this recipient (not forfeited — those were spam)
  const bonds = await db.prepare(`
    SELECT sender_handle, SUM(amount_usdc) as total_bond
    FROM attention_bonds
    WHERE recipient_handle = ? AND status IN ('active', 'refunded')
    GROUP BY sender_handle
  `).bind(handle).all<{ sender_handle: string; total_bond: number }>();

  if (!bonds.results || bonds.results.length === 0) {
    await db.prepare(`
      INSERT INTO qaf_scores (handle, qaf_value, coqaf_value, unique_senders, total_bonds, updated_at)
      VALUES (?, 0, 0, 0, 0, ?)
      ON CONFLICT(handle) DO UPDATE SET qaf_value = 0, coqaf_value = 0, unique_senders = 0, total_bonds = 0, updated_at = ?
    `).bind(handle, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();
    return;
  }

  const senders = bonds.results;

  // ── Standard QAF: AV = (Σ√bᵢ)² ──
  let sumSqrtB = 0;
  let totalBonds = 0;
  for (const row of senders) {
    sumSqrtB += Math.sqrt(row.total_bond);
    totalBonds += row.total_bond;
  }
  const qafValue = sumSqrtB * sumSqrtB;

  // ── CO-QAF: AV_CO = (Σ√b̃ᵢ)² where b̃ᵢ = bᵢ / (1 + Σⱼ αᵢⱼ) ──
  // Estimate α_ij via shared-recipient Jaccard similarity from email history
  const coqafValue = await computeCoQAF(db, senders);

  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    INSERT INTO qaf_scores (handle, qaf_value, coqaf_value, unique_senders, total_bonds, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(handle) DO UPDATE SET
      qaf_value = ?, coqaf_value = ?, unique_senders = ?, total_bonds = ?, updated_at = ?
  `).bind(
    handle, qafValue, coqafValue, senders.length, totalBonds, now,
    qafValue, coqafValue, senders.length, totalBonds, now,
  ).run();
}

/**
 * Compute CO-QAF with α_ij estimated from email behavior.
 *
 * α_ij = social proximity between senders i and j, estimated as:
 *   Jaccard(R_i, R_j) where R_i = set of recipients sender i has emailed
 *
 * This captures the ISD insight: senders who email the same people are
 * "bonding" (high α → heavy discount), while senders from different
 * communities are "bridging" (low α → full weight).
 *
 * Formula: b̃ᵢ = bᵢ / (1 + Σⱼ≠ᵢ αᵢⱼ), AV_CO = (Σ√b̃ᵢ)²
 */
async function computeCoQAF(
  db: D1Database,
  senders: { sender_handle: string; total_bond: number }[],
): Promise<number> {
  if (senders.length <= 1) {
    // Single sender — no graph discount possible, CO-QAF = QAF
    const b = senders[0]?.total_bond ?? 0;
    return b; // (√b)² = b
  }

  // Fetch recipient sets for each sender (from sent emails)
  const recipientSets: Map<string, Set<string>> = new Map();

  for (const s of senders) {
    const rows = await db.prepare(`
      SELECT DISTINCT
        CASE WHEN folder = 'sent' THEN handle ELSE from_addr END as counterpart
      FROM emails
      WHERE (from_addr = ? OR (handle = ? AND folder = 'sent'))
      LIMIT 200
    `).bind(
      s.sender_handle + '@basemail.ai',
      s.sender_handle,
    ).all<{ counterpart: string }>();

    // Also include bond recipients from attention_bonds
    const bondRecipients = await db.prepare(`
      SELECT DISTINCT recipient_handle FROM attention_bonds WHERE sender_handle = ?
    `).bind(s.sender_handle).all<{ recipient_handle: string }>();

    const recipients = new Set<string>();
    for (const r of (rows.results || [])) {
      recipients.add(r.counterpart.toLowerCase());
    }
    for (const r of (bondRecipients.results || [])) {
      recipients.add(r.recipient_handle.toLowerCase());
    }
    recipientSets.set(s.sender_handle, recipients);
  }

  // Compute α_ij (Jaccard similarity) and discounted bonds
  let sumSqrtBtilde = 0;

  for (const si of senders) {
    const Ri = recipientSets.get(si.sender_handle) || new Set();

    // Σⱼ≠ᵢ αᵢⱼ
    let sumAlpha = 0;
    for (const sj of senders) {
      if (sj.sender_handle === si.sender_handle) continue;
      const Rj = recipientSets.get(sj.sender_handle) || new Set();
      const alpha = jaccard(Ri, Rj);
      sumAlpha += alpha;
    }

    // b̃ᵢ = bᵢ / (1 + Σⱼ αᵢⱼ)
    const bTilde = si.total_bond / (1 + sumAlpha);
    sumSqrtBtilde += Math.sqrt(bTilde);
  }

  return sumSqrtBtilde * sumSqrtBtilde;
}

/** Jaccard similarity: |A ∩ B| / |A ∪ B|, returns 0 if both empty */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}
