/**
 * BaseMail — The Diplomat (Chainlink CRE Hackathon)
 *
 * AI-powered economic arbitrator for email attention pricing.
 * Uses Quadratic Voting (Weyl 2015) for repeat-sender cost escalation.
 *
 * Routes: /api/diplomat/*
 * Dependencies: emails table, attn_balances, attn_transactions
 *
 * Rollback: Delete this file + remove route from index.ts. Zero impact on existing logic.
 */

import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';

// ── Gemini LLM Arbitration ──
async function arbitrateEmail(
  geminiKey: string,
  from: string,
  to: string,
  subject: string,
  body: string,
  totalSent: number,
  unreadStreak: number,
): Promise<{ category: string; score: number; reasoning: string }> {
  const prompt = `You are The Diplomat, an AI email quality arbitrator for BaseMail. Analyze this email and classify it.

From: ${from}
To: ${to}
Subject: ${subject}
Body: ${body}

Context: Sender has sent ${totalSent} emails to this recipient before. ${unreadStreak} remain unread.

Classify into exactly ONE category:
- "spam": unsolicited bulk, scam, or low-effort mass message
- "cold": first-time outreach, professional but unsolicited
- "legit": normal conversation, expected communication
- "high_value": important business proposal, collaboration, time-sensitive
- "reply": clearly a response to a previous email

Return ONLY a JSON object:
{"category": "spam|cold|legit|high_value|reply", "score": 0-10, "reasoning": "brief explanation"}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );
    const data = await resp.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const result = JSON.parse(text);
    if (result.category && ['spam', 'cold', 'legit', 'high_value', 'reply'].includes(result.category)) {
      return result;
    }
  } catch { /* fallback below */ }
  return { category: 'cold', score: 5, reasoning: 'LLM unavailable, default classification' };
}

// Ensure attn_escrow table exists (auto-created by attn module, but just in case)
let diplomatMigrated = false;
async function ensureEscrowTable(db: any) {
  if (diplomatMigrated) return;
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS attn_escrow (
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
    )`).run();
  } catch { /* exists */ }
  diplomatMigrated = true;
}
import { ATTN } from './attn';

// ── QAF Pricing Constants ──
export const DIPLOMAT = {
  BASE_COST: 3,           // First email: 3 ATTN
  QAF_CAP: 10,            // Max n for n² (100 ATTN cap)
  LLM_COEFFICIENTS: {
    spam: 3,
    cold: 1,
    legit: 0.5,
    high_value: 0.3,
    reply: 0,
  },
  BOOST_REWARD: 2,        // Extra ATTN to incentivize reading high_value emails
  REPLY_BONUS: 2,         // Both parties get bonus on reply
} as const;

type LlmCategory = keyof typeof DIPLOMAT.LLM_COEFFICIENTS;

export const diplomatRoutes = new Hono<AppBindings>();

// ── Public endpoints (no auth) ──

/**
 * GET /api/diplomat/history?from=<handle>&to=<handle>
 * Returns unread count for QAF pricing calculation.
 * Public so CRE workflow can call without auth token.
 */
diplomatRoutes.get('/history', async (c) => {
  const from = c.req.query('from')?.toLowerCase();
  const to = c.req.query('to')?.toLowerCase();

  if (!from || !to) {
    return c.json({ error: 'Both "from" and "to" query params required' }, 400);
  }

  // Count consecutive unread emails AFTER the last read one.
  // If recipient reads ANY email from this sender → streak resets to 0.
  const fromAddr = `${from}@basemail.ai`;
  const toAddr = `${to}@basemail.ai`;

  // Get last read timestamp
  const lastRead = await c.env.DB.prepare(`
    SELECT MAX(created_at) as last_read_at
    FROM emails 
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox' AND read = 1
  `).bind(fromAddr, toAddr, to).first<{ last_read_at: number | null }>();

  const lastReadAt = lastRead?.last_read_at ?? 0;

  // Count unread emails AFTER the last read
  const result = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_sent,
      SUM(CASE WHEN read = 0 AND created_at > ? THEN 1 ELSE 0 END) as unread_streak
    FROM emails 
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox'
  `).bind(lastReadAt, fromAddr, toAddr, to).first<{
    total_sent: number;
    unread_streak: number;
  }>();

  const unreadCount = result?.unread_streak ?? 0;
  const totalSent = result?.total_sent ?? 0;

  // Count replies: emails FROM recipient TO sender
  const repliesResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as replied
    FROM emails
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'sent'
  `).bind(toAddr, fromAddr, to).first<{ replied: number }>();
  const replied = repliesResult?.replied ?? 0;

  return c.json({
    from,
    to,
    total_sent: totalSent,
    replied,
    unread_streak: unreadCount,
    last_read_at: lastReadAt || null,
    qaf: {
      n: unreadCount,
      multiplier: qafPrice(unreadCount),
      formula: unreadCount === 0
        ? `base = ${DIPLOMAT.BASE_COST} ATTN`
        : `n² = ${unreadCount}² = ${qafPrice(unreadCount)} ATTN`,
    },
  });
});

/**
 * GET /api/diplomat/pricing?from=<handle>&to=<handle>&category=<llm_category>
 * Preview the full price calculation without actually sending.
 * CRE workflow calls this to show the agent what it'll cost.
 */
diplomatRoutes.get('/pricing', async (c) => {
  const from = c.req.query('from')?.toLowerCase();
  const to = c.req.query('to')?.toLowerCase();
  const category = (c.req.query('category')?.toLowerCase() || 'cold') as LlmCategory;

  if (!from || !to) {
    return c.json({ error: 'Both "from" and "to" query params required' }, 400);
  }

  if (!(category in DIPLOMAT.LLM_COEFFICIENTS)) {
    return c.json({ error: `Invalid category. Must be one of: ${Object.keys(DIPLOMAT.LLM_COEFFICIENTS).join(', ')}` }, 400);
  }

  // Get consecutive unread streak (resets when recipient reads)
  const fromAddr = `${from}@basemail.ai`;
  const toAddr = `${to}@basemail.ai`;

  const lastRead = await c.env.DB.prepare(`
    SELECT MAX(created_at) as last_read_at
    FROM emails 
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox' AND read = 1
  `).bind(fromAddr, toAddr, to).first<{ last_read_at: number | null }>();

  const lastReadAt = lastRead?.last_read_at ?? 0;

  const streak = await c.env.DB.prepare(`
    SELECT COUNT(*) as unread_streak
    FROM emails 
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox' AND read = 0 AND created_at > ?
  `).bind(fromAddr, toAddr, to, lastReadAt).first<{ unread_streak: number }>();

  const n = streak?.unread_streak ?? 0;
  const qafBase = qafPrice(n);
  const llmCoeff = DIPLOMAT.LLM_COEFFICIENTS[category];
  const finalCost = Math.ceil(qafBase * llmCoeff);

  // Check sender balance
  const senderAcct = await c.env.DB.prepare('SELECT wallet FROM accounts WHERE handle = ?').bind(from).first<{ wallet: string }>();
  const balance = senderAcct
    ? (await c.env.DB.prepare('SELECT balance FROM attn_balances WHERE wallet = ?').bind(senderAcct.wallet).first<{ balance: number }>())?.balance ?? 0
    : 0;

  // Relationship stats: me → them
  const meSentResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM emails
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox'
  `).bind(fromAddr, toAddr, to).first<{ cnt: number }>();
  const meSent = meSentResult?.cnt ?? 0;

  const theyRepliedResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM emails
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'sent'
  `).bind(toAddr, fromAddr, to).first<{ cnt: number }>();
  const theyReplied = theyRepliedResult?.cnt ?? 0;

  // Relationship stats: them → me
  const theyUnreadResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM emails
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox' AND read = 0
  `).bind(fromAddr, toAddr, to).first<{ cnt: number }>();
  const theyUnread = theyUnreadResult?.cnt ?? 0;

  const theySentResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM emails
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox'
  `).bind(toAddr, fromAddr, from).first<{ cnt: number }>();
  const theySent = theySentResult?.cnt ?? 0;

  const meRepliedResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM emails
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'sent'
  `).bind(fromAddr, toAddr, from).first<{ cnt: number }>();
  const meReplied = meRepliedResult?.cnt ?? 0;

  const meUnreadResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM emails
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox' AND read = 0
  `).bind(toAddr, fromAddr, from).first<{ cnt: number }>();
  const meUnread = meUnreadResult?.cnt ?? 0;

  return c.json({
    from,
    to,
    pricing: {
      qaf_n: n,
      qaf_base: qafBase,
      llm_category: category,
      llm_coefficient: llmCoeff,
      final_cost: finalCost,
      formula: `${qafBase} (QAF n=${n}) × ${llmCoeff} (${category}) = ${finalCost} ATTN`,
    },
    relationship: {
      me_to_them: { sent: meSent, replied: theyReplied, unread: theyUnread },
      them_to_me: { sent: theySent, replied: meReplied, unread: meUnread },
    },
    sender_balance: balance,
    can_afford: balance >= finalCost,
    breakdown: {
      spam_example: `${qafBase} × ${DIPLOMAT.LLM_COEFFICIENTS.spam} = ${Math.ceil(qafBase * DIPLOMAT.LLM_COEFFICIENTS.spam)} ATTN`,
      cold_example: `${qafBase} × ${DIPLOMAT.LLM_COEFFICIENTS.cold} = ${Math.ceil(qafBase * DIPLOMAT.LLM_COEFFICIENTS.cold)} ATTN`,
      legit_example: `${qafBase} × ${DIPLOMAT.LLM_COEFFICIENTS.legit} = ${Math.ceil(qafBase * DIPLOMAT.LLM_COEFFICIENTS.legit)} ATTN`,
      high_value_example: `${qafBase} × ${DIPLOMAT.LLM_COEFFICIENTS.high_value} = ${Math.ceil(qafBase * DIPLOMAT.LLM_COEFFICIENTS.high_value)} ATTN`,
      reply_example: `free + ${DIPLOMAT.REPLY_BONUS} bonus each`,
    },
  });
});

// ── Authenticated endpoints ──
diplomatRoutes.use('/send', authMiddleware());

/**
 * POST /api/diplomat/send
 * Send email with live Gemini LLM arbitration + debt model.
 * 
 * Flow:
 *   1. Check sender balance >= estimated cost (pre-arbitration, cold ×1)
 *   2. Gemini arbitrates email quality → actual category + cost
 *   3. Deduct actual cost (may push balance negative if actual > estimated)
 *   4. Send email
 *   5. Return arbitration result (discount/penalty)
 *
 * Debt model: if actual cost > balance, email still sends but balance goes negative.
 *   Sender is locked from sending until balance >= next estimated cost.
 */
diplomatRoutes.post('/send', async (c) => {
  await ensureEscrowTable(c.env.DB);
  const auth = c.get('auth') as { wallet: string; handle?: string } | undefined;
  const wallet = auth?.wallet;
  const body = await c.req.json<{
    to: string;
    subject: string;
    body: string;
    // Optional: caller can still pass these for CRE workflow compatibility
    attn_override?: number;
    llm_category?: LlmCategory;
    llm_score?: number;
    qaf_n?: number;
  }>();

  if (!body.to || !body.subject || !body.body) {
    return c.json({ error: 'to, subject, body required' }, 400);
  }

  if (!wallet) return c.json({ error: 'Authentication failed' }, 401);

  // Get sender handle
  const sender = auth?.handle
    ? { handle: auth.handle }
    : await c.env.DB.prepare('SELECT handle FROM accounts WHERE LOWER(wallet) = LOWER(?)').bind(wallet).first<{ handle: string }>();
  if (!sender) return c.json({ error: 'Sender not registered' }, 404);

  const toHandle = body.to.replace(/@basemail\.ai$/i, '').toLowerCase();
  const fromAddr = `${sender.handle}@basemail.ai`;
  const toAddr = `${toHandle}@basemail.ai`;

  // ── Step 1: Get QAF history ──
  const lastRead = await c.env.DB.prepare(`
    SELECT MAX(created_at) as last_read_at
    FROM emails 
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox' AND read = 1
  `).bind(fromAddr, toAddr, toHandle).first<{ last_read_at: number | null }>();
  const lastReadAt = lastRead?.last_read_at ?? 0;

  const streakResult = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_sent,
      SUM(CASE WHEN read = 0 AND created_at > ? THEN 1 ELSE 0 END) as unread_streak
    FROM emails 
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox'
  `).bind(lastReadAt, fromAddr, toAddr, toHandle).first<{ total_sent: number; unread_streak: number }>();

  const unreadStreak = streakResult?.unread_streak ?? 0;
  const totalSent = streakResult?.total_sent ?? 0;
  const qafBase = qafPrice(unreadStreak);

  // ── Step 2: Check balance vs estimated cost (cold ×1 = worst pre-arbitration) ──
  const bal = await c.env.DB.prepare('SELECT balance FROM attn_balances WHERE LOWER(wallet) = LOWER(?)').bind(wallet).first<{ balance: number }>();
  const balance = bal?.balance ?? 0;
  const estimatedCost = Math.max(1, Math.ceil(qafBase * DIPLOMAT.LLM_COEFFICIENTS.cold));

  if (balance < estimatedCost) {
    return c.json({
      error: 'Insufficient ATTN balance',
      required: estimatedCost,
      balance,
      hint: balance < 0 ? 'Your account has negative ATTN. Receive emails to recover.' : undefined,
    }, 402);
  }

  // ── Step 3: Gemini LLM Arbitration ──
  let llmCategory: string;
  let llmScore: number;
  let llmReasoning: string;

  // Check if it's a reply (free)
  const isReply = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM emails
    WHERE from_addr = ? AND to_addr = ? AND handle = ? AND folder = 'inbox'
  `).bind(toAddr, fromAddr, sender.handle).first<{ cnt: number }>();
  const hasReceivedFromThem = (isReply?.cnt ?? 0) > 0;

  if (hasReceivedFromThem && body.subject?.toLowerCase().startsWith('re:')) {
    // Reply detected — skip LLM, free
    llmCategory = 'reply';
    llmScore = 10;
    llmReasoning = 'Reply to existing conversation — free';
  } else if (body.attn_override != null && body.llm_category) {
    // CRE workflow already arbitrated — trust it
    llmCategory = body.llm_category;
    llmScore = body.llm_score ?? 5;
    llmReasoning = 'Pre-arbitrated by CRE workflow';
  } else {
    // Live Gemini arbitration
    const geminiKey = (c.env as any).GEMINI_API_KEY || '';
    if (geminiKey) {
      const result = await arbitrateEmail(
        geminiKey, sender.handle, toHandle, body.subject, body.body, totalSent, unreadStreak
      );
      llmCategory = result.category;
      llmScore = result.score;
      llmReasoning = result.reasoning;
    } else {
      // No Gemini key — default to cold
      llmCategory = 'cold';
      llmScore = 5;
      llmReasoning = 'No LLM available, default classification';
    }
  }

  // ── Step 4: Calculate actual cost ──
  const llmCoeff = DIPLOMAT.LLM_COEFFICIENTS[llmCategory as LlmCategory] ?? 1;
  const actualCost = llmCategory === 'reply' ? 0 : Math.max(1, Math.ceil(qafBase * llmCoeff));
  const discount = estimatedCost - actualCost;
  const balanceAfter = balance - actualCost;

  // ── Step 5: Deduct + Send ──
  const emailId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 14)}`;
  const receiver = await c.env.DB.prepare('SELECT wallet FROM accounts WHERE handle = ?').bind(toHandle).first<{ wallet: string }>();

  const dbOps = [];

  if (actualCost > 0) {
    // Deduct from sender (may go negative — debt model)
    dbOps.push(
      c.env.DB.prepare('UPDATE attn_balances SET balance = balance - ? WHERE wallet = ?')
        .bind(actualCost, wallet),
      c.env.DB.prepare(`INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note)
        VALUES (?, ?, ?, 'diplomat_stake', ?, ?)`)
        .bind(
          `tx-${emailId}`, wallet, -actualCost, emailId,
          `🦞 Diplomat: ${llmCategory} (QAF n=${unreadStreak}, score=${llmScore}) — ${llmReasoning}`
        ),
      c.env.DB.prepare(`INSERT INTO attn_escrow (email_id, sender_wallet, receiver_wallet, sender_handle, receiver_handle, amount, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .bind(emailId, wallet, receiver?.wallet || '', sender.handle, toHandle, actualCost,
          Math.floor(Date.now() / 1000) + 48 * 3600),
    );
  }

  // Store email
  const rawEmail = `From: ${fromAddr}\r\nTo: ${toAddr}\r\nSubject: ${body.subject}\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body.body}`;
  const r2Key = `emails/${toHandle}/${emailId}`;
  await c.env.EMAIL_STORE.put(r2Key, rawEmail);

  dbOps.push(
    c.env.DB.prepare(`INSERT INTO emails (id, handle, folder, from_addr, to_addr, subject, snippet, r2_key, size)
      VALUES (?, ?, 'inbox', ?, ?, ?, ?, ?, ?)`)
      .bind(emailId, toHandle, fromAddr, toAddr, body.subject, body.body.slice(0, 100), r2Key, rawEmail.length),
    c.env.DB.prepare(`INSERT INTO emails (id, handle, folder, from_addr, to_addr, subject, snippet, r2_key, size, read)
      VALUES (?, ?, 'sent', ?, ?, ?, ?, ?, ?, 1)`)
      .bind(`${emailId}-sent`, sender.handle, fromAddr, toAddr, body.subject, body.body.slice(0, 100), r2Key, rawEmail.length),
  );

  await c.env.DB.batch(dbOps);

  return c.json({
    success: true,
    email_id: emailId,
    from: fromAddr,
    to: toAddr,
    diplomat: {
      // Arbitration result
      estimated_cost: estimatedCost,
      actual_cost: actualCost,
      discount: discount,
      llm_category: llmCategory,
      llm_score: llmScore,
      llm_reasoning: llmReasoning,
      qaf_n: unreadStreak,
      qaf_base: qafBase,
      llm_coefficient: llmCoeff,
      formula: `${qafBase} (QAF) × ${llmCoeff} (${llmCategory}) = ${actualCost} ATTN`,
      // Balance
      sender_balance_before: balance,
      sender_balance_after: balanceAfter,
      in_debt: balanceAfter < 0,
    },
  });
});

// ── Helper: QAF Pricing ──

/**
 * Quadratic Voting pricing for attention:
 * - First email (n=0): base cost (3 ATTN)
 * - Subsequent unread (n≥1): (n+1)² ATTN
 *   n=0 → 3, n=1 → 4, n=2 → 9, n=3 → 16, n=4 → 25...
 *
 * If recipient reads → n resets to 0.
 * Cap at n=QAF_CAP to prevent overflow.
 */
export function qafPrice(unreadCount: number): number {
  if (unreadCount <= 0) return DIPLOMAT.BASE_COST;
  const n = Math.min(unreadCount + 1, DIPLOMAT.QAF_CAP);
  return n * n;
}
