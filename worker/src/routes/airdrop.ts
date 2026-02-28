/**
 * BaseMail — $ATTN Airdrop Waves
 *
 * Flexible wave-based airdrop system. Each wave has:
 * - A scoring formula (what actions earn points)
 * - A multiplier (e.g., 2x for early birds)
 * - A snapshot cutoff (only count activity before this date)
 * - A claim window (when users can claim)
 *
 * Wave config is code-defined (not DB) for simplicity + auditability.
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../auth';
import { ATTN, ensureBalance } from './attn';

// ══════════════════════════════════════════════
// Wave Definitions
// ══════════════════════════════════════════════

export interface WaveConfig {
  id: string;
  name: string;
  description: string;
  multiplier: number;
  /** Unix timestamp: only count activity BEFORE this time */
  snapshotCutoff: number;
  /** Unix timestamp: claims open at this time */
  claimOpensAt: number;
  /** Unix timestamp: claims close (0 = never) */
  claimClosesAt: number;
  /** Scoring weights */
  scoring: {
    email_received: number;
    email_read: number;
    email_replied: number;
    email_sent: number;
    attn_staked: number;
    days_since_signup: number;
  };
  /** Max airdrop per account (0 = unlimited) */
  maxPerAccount: number;
  /** Badge / label for UI */
  badge: string;
}

// ── Wave 1: Early Bird (pre-April Fools) ──
// Claim opens: 2026-04-01T04:01:00 PT = 2026-04-01T11:01:00 UTC
const WAVE_1: WaveConfig = {
  id: 'wave1-early-bird',
  name: 'Wave 1: Early Bird',
  description: 'Reward early adopters who used BaseMail before April 1, 2026. 2× multiplier!',
  multiplier: 2,
  snapshotCutoff: Math.floor(new Date('2026-04-01T11:01:00Z').getTime() / 1000),
  claimOpensAt: Math.floor(new Date('2026-04-01T11:01:00Z').getTime() / 1000),
  claimClosesAt: 0, // never expires
  scoring: {
    email_received: 1,
    email_read: 2,
    email_replied: 5,
    email_sent: 1,
    attn_staked: 0.5,
    days_since_signup: 2,
  },
  maxPerAccount: 5000,
  badge: '🐣',
};

// Add future waves here
// const WAVE_2: WaveConfig = { ... };

export const WAVES: WaveConfig[] = [WAVE_1];

export function getWave(id: string): WaveConfig | undefined {
  return WAVES.find(w => w.id === id);
}

// ══════════════════════════════════════════════
// Scoring Engine
// ══════════════════════════════════════════════

export interface AirdropScore {
  breakdown: {
    emails_received: number;
    emails_read: number;
    emails_replied: number;
    emails_sent: number;
    attn_staked: number;
    days_since_signup: number;
  };
  base_score: number;
  multiplier: number;
  total: number;
}

export async function calculateScore(
  db: D1Database,
  handle: string,
  wallet: string,
  wave: WaveConfig,
): Promise<AirdropScore> {
  const cutoff = wave.snapshotCutoff;
  const w = wallet.toLowerCase();

  // Run all queries in parallel
  const [received, read, replied, sent, staked, account] = await Promise.all([
    // Emails received (inbox) before cutoff
    db.prepare(
      'SELECT COUNT(*) as c FROM emails WHERE handle = ? AND folder = \'inbox\' AND created_at < ?'
    ).bind(handle, cutoff).first<{ c: number }>(),

    // Emails read before cutoff
    db.prepare(
      'SELECT COUNT(*) as c FROM emails WHERE handle = ? AND folder = \'inbox\' AND read = 1 AND created_at < ?'
    ).bind(handle, cutoff).first<{ c: number }>(),

    // Emails replied to (sent emails that are replies, before cutoff)
    db.prepare(
      `SELECT COUNT(*) as c FROM emails WHERE handle = ? AND folder = 'sent' AND subject LIKE 'Re:%' AND created_at < ?`
    ).bind(handle, cutoff).first<{ c: number }>(),

    // Emails sent before cutoff
    db.prepare(
      'SELECT COUNT(*) as c FROM emails WHERE handle = ? AND folder = \'sent\' AND created_at < ?'
    ).bind(handle, cutoff).first<{ c: number }>(),

    // Total ATTN staked before cutoff
    db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM attn_escrow WHERE sender_wallet = ? AND created_at < ?'
    ).bind(w, cutoff).first<{ total: number }>(),

    // Account creation date
    db.prepare(
      'SELECT created_at FROM accounts WHERE handle = ?'
    ).bind(handle).first<{ created_at: number }>(),
  ]);

  const now = Math.min(Math.floor(Date.now() / 1000), cutoff);
  const signupTs = account?.created_at ?? now;
  const daysSinceSignup = Math.max(0, Math.floor((now - signupTs) / 86400));

  const breakdown = {
    emails_received: received?.c ?? 0,
    emails_read: read?.c ?? 0,
    emails_replied: replied?.c ?? 0,
    emails_sent: sent?.c ?? 0,
    attn_staked: staked?.total ?? 0,
    days_since_signup: daysSinceSignup,
  };

  const base_score = Math.floor(
    breakdown.emails_received * wave.scoring.email_received +
    breakdown.emails_read * wave.scoring.email_read +
    breakdown.emails_replied * wave.scoring.email_replied +
    breakdown.emails_sent * wave.scoring.email_sent +
    breakdown.attn_staked * wave.scoring.attn_staked +
    breakdown.days_since_signup * wave.scoring.days_since_signup
  );

  let total = Math.floor(base_score * wave.multiplier);
  if (wave.maxPerAccount > 0) {
    total = Math.min(total, wave.maxPerAccount);
  }

  return { breakdown, base_score, multiplier: wave.multiplier, total };
}

// ══════════════════════════════════════════════
// Routes
// ══════════════════════════════════════════════

export const airdropRoutes = new Hono<{ Bindings: Env }>();

// Auto-migrate
let airdropMigrated = false;
airdropRoutes.use('/*', async (c, next) => {
  if (!airdropMigrated) {
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS attn_airdrop_claims (
          id TEXT PRIMARY KEY,
          wave_id TEXT NOT NULL,
          wallet TEXT NOT NULL,
          handle TEXT NOT NULL,
          amount INTEGER NOT NULL,
          score_snapshot TEXT NOT NULL,
          claimed_at INTEGER NOT NULL,
          UNIQUE(wave_id, wallet)
        )`),
        c.env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_airdrop_wave ON attn_airdrop_claims(wave_id)`),
      ]);
    } catch (e) {
      console.error('Airdrop migration:', e);
    }
    airdropMigrated = true;
  }
  await next();
});

// All endpoints require auth
airdropRoutes.use('/*', authMiddleware());

// ── GET /api/airdrop/waves — List all waves with status ──
airdropRoutes.get('/waves', async (c) => {
  const auth = c.get('auth');
  const now = Math.floor(Date.now() / 1000);
  const w = auth.wallet.toLowerCase();

  const waves = await Promise.all(WAVES.map(async (wave) => {
    // Check if already claimed
    const claim = await c.env.DB.prepare(
      'SELECT amount, claimed_at FROM attn_airdrop_claims WHERE wave_id = ? AND wallet = ?'
    ).bind(wave.id, w).first<{ amount: number; claimed_at: number }>();

    // Calculate score
    const score = await calculateScore(c.env.DB, auth.handle, auth.wallet, wave);

    const status = claim ? 'claimed'
      : now < wave.claimOpensAt ? 'preview'
      : (wave.claimClosesAt > 0 && now > wave.claimClosesAt) ? 'expired'
      : 'claimable';

    return {
      id: wave.id,
      name: wave.name,
      description: wave.description,
      badge: wave.badge,
      multiplier: wave.multiplier,
      status,
      score,
      claim_opens_at: wave.claimOpensAt,
      claim_opens_in_seconds: Math.max(0, wave.claimOpensAt - now),
      claimed: claim ? { amount: claim.amount, claimed_at: claim.claimed_at } : null,
    };
  }));

  return c.json({ waves });
});

// ── GET /api/airdrop/:waveId — Single wave detail ──
airdropRoutes.get('/:waveId', async (c) => {
  const auth = c.get('auth');
  const waveId = c.req.param('waveId');
  const wave = getWave(waveId);
  if (!wave) return c.json({ error: 'Wave not found' }, 404);

  const now = Math.floor(Date.now() / 1000);
  const w = auth.wallet.toLowerCase();

  const claim = await c.env.DB.prepare(
    'SELECT amount, claimed_at FROM attn_airdrop_claims WHERE wave_id = ? AND wallet = ?'
  ).bind(wave.id, w).first<{ amount: number; claimed_at: number }>();

  const score = await calculateScore(c.env.DB, auth.handle, auth.wallet, wave);

  const status = claim ? 'claimed'
    : now < wave.claimOpensAt ? 'preview'
    : (wave.claimClosesAt > 0 && now > wave.claimClosesAt) ? 'expired'
    : 'claimable';

  return c.json({
    id: wave.id,
    name: wave.name,
    description: wave.description,
    badge: wave.badge,
    multiplier: wave.multiplier,
    status,
    score,
    claim_opens_at: wave.claimOpensAt,
    claim_opens_in_seconds: Math.max(0, wave.claimOpensAt - now),
    claimed: claim ? { amount: claim.amount, claimed_at: claim.claimed_at } : null,
  });
});

// ── POST /api/airdrop/:waveId/claim — Claim airdrop ──
airdropRoutes.post('/:waveId/claim', async (c) => {
  const auth = c.get('auth');
  const waveId = c.req.param('waveId');
  const wave = getWave(waveId);
  if (!wave) return c.json({ error: 'Wave not found' }, 404);

  const now = Math.floor(Date.now() / 1000);
  const w = auth.wallet.toLowerCase();

  // Check timing
  if (now < wave.claimOpensAt) {
    return c.json({
      error: 'Claim not open yet',
      claim_opens_at: wave.claimOpensAt,
      claim_opens_in_seconds: wave.claimOpensAt - now,
    }, 403);
  }
  if (wave.claimClosesAt > 0 && now > wave.claimClosesAt) {
    return c.json({ error: 'Claim window has closed' }, 403);
  }

  // Check if already claimed
  const existing = await c.env.DB.prepare(
    'SELECT id FROM attn_airdrop_claims WHERE wave_id = ? AND wallet = ?'
  ).bind(wave.id, w).first();
  if (existing) {
    return c.json({ error: 'Already claimed' }, 409);
  }

  // Calculate final score at claim time
  const score = await calculateScore(c.env.DB, auth.handle, auth.wallet, wave);
  if (score.total <= 0) {
    return c.json({ error: 'No airdrop earned (score is 0)' }, 400);
  }

  // Ensure balance row exists
  await ensureBalance(c.env.DB, auth.wallet, auth.handle);

  const claimId = `airdrop-${wave.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Atomic: record claim + credit balance + log transaction
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO attn_airdrop_claims (id, wave_id, wallet, handle, amount, score_snapshot, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(claimId, wave.id, w, auth.handle, score.total, JSON.stringify(score), now),
    c.env.DB.prepare(
      'UPDATE attn_balances SET balance = balance + ? WHERE wallet = ?'
    ).bind(score.total, w),
    c.env.DB.prepare(
      'INSERT INTO attn_transactions (id, wallet, amount, type, note, created_at) VALUES (?, ?, ?, \'airdrop\', ?, ?)'
    ).bind(
      claimId, w, score.total,
      `${wave.name} airdrop (${wave.multiplier}× multiplier)`, now,
    ),
  ]);

  return c.json({
    claimed: true,
    wave: wave.id,
    amount: score.total,
    score,
  });
});

// ── GET /api/airdrop/:waveId/leaderboard — Top earners (public hype) ──
airdropRoutes.get('/:waveId/leaderboard', async (c) => {
  const waveId = c.req.param('waveId');
  const wave = getWave(waveId);
  if (!wave) return c.json({ error: 'Wave not found' }, 404);

  const claims = await c.env.DB.prepare(
    'SELECT handle, amount, claimed_at FROM attn_airdrop_claims WHERE wave_id = ? ORDER BY amount DESC LIMIT 20'
  ).bind(wave.id).all();

  return c.json({
    wave: wave.id,
    leaderboard: (claims.results || []).map((r: any) => ({
      handle: r.handle,
      amount: r.amount,
      claimed_at: r.claimed_at,
    })),
  });
});
