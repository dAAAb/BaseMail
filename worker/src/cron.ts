/**
 * BaseMail v3.0 — Cron Handler
 *
 * Scheduled tasks:
 * 1. Reset daily_earned counters (once per day)
 * 2. Daily ATTN drip (+10 per account)
 * 3. Settle expired ATTN escrows (48h timeout)
 *
 * Rollback: Remove `scheduled` from index.ts default export + remove cron trigger from wrangler.toml.
 */

import type { Env } from './types';
import { ATTN } from './routes/attn';

export async function handleCron(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 86400;

  try {
    // ── 1. Reset daily_earned for new day ──
    await env.DB.prepare(
      'UPDATE attn_balances SET daily_earned = 0, last_earn_reset = ? WHERE last_earn_reset < ?'
    ).bind(now, oneDayAgo).run();

    // ── 2. Daily drip — REMOVED (now claim-based) ──
    // Users must manually claim their daily ATTN via POST /api/attn/claim.
    // Unclaimed drips do NOT accumulate — use it or lose it.

    // ── 3. Settle expired escrows ──
    const expired = await env.DB.prepare(
      'SELECT email_id, sender_wallet, sender_handle, receiver_wallet, receiver_handle, amount FROM attn_escrow WHERE status = \'pending\' AND expires_at < ?'
    ).bind(now).all();

    for (const row of (expired.results || [])) {
      const e = row as {
        email_id: string; sender_wallet: string; sender_handle: string;
        receiver_wallet: string; receiver_handle: string; amount: number;
      };

      try {
        // Check receiver daily earn cap
        const receiver = await env.DB.prepare(
          'SELECT daily_earned FROM attn_balances WHERE wallet = ?'
        ).bind(e.receiver_wallet).first<{ daily_earned: number }>();

        if (receiver && receiver.daily_earned + e.amount > ATTN.DAILY_EARN_CAP) {
          // Cap reached → refund to sender (all positive: no tokens destroyed)
          await env.DB.batch([
            env.DB.prepare('UPDATE attn_balances SET balance = balance + ? WHERE wallet = ?')
              .bind(e.amount, e.sender_wallet),
            env.DB.prepare('UPDATE attn_escrow SET status = \'refunded\', settled_at = ? WHERE email_id = ?')
              .bind(now, e.email_id),
            env.DB.prepare(
              'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'cap_refund\', ?, ?, ?)'
            ).bind(
              `cron-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
              e.sender_wallet, e.amount, e.email_id,
              'Receiver daily cap reached — refunded to sender', now,
            ),
          ]);
        } else {
          // Transfer to receiver (email was not read within 48h)
          await env.DB.batch([
            // Credit receiver
            env.DB.prepare('UPDATE attn_balances SET balance = balance + ?, daily_earned = daily_earned + ? WHERE wallet = ?')
              .bind(e.amount, e.amount, e.receiver_wallet),
            // Mark escrow settled
            env.DB.prepare('UPDATE attn_escrow SET status = \'transferred\', settled_at = ? WHERE email_id = ?')
              .bind(now, e.email_id),
            // Log for receiver
            env.DB.prepare(
              'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'compensation\', ?, ?, ?)'
            ).bind(
              `cron-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
              e.receiver_wallet, e.amount, e.email_id,
              `Unread email from ${e.sender_handle} — attention compensation`, now,
            ),
            // Log for sender
            env.DB.prepare(
              'INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note, created_at) VALUES (?, ?, ?, \'forfeit\', ?, ?, ?)'
            ).bind(
              `cron-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
              e.sender_wallet, -e.amount, e.email_id,
              `Email to ${e.receiver_handle} not read within 48h`, now,
            ),
          ]);
        }
      } catch (escrowErr) {
        // Don't let one failed escrow block others
        console.error(`Escrow settlement failed for ${e.email_id}:`, escrowErr);
      }
    }
  } catch (err) {
    console.error('Cron handler error:', err);
  }
}
