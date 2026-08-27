/**
 * Fixed-window rate limiter backed by KV.
 *
 * Added after the 2026-08-24 abuse incident: 198 wallets registered in 16
 * minutes and burned their free credits on 799 spam emails to gmail.
 */
import type { Context } from 'hono';
import type { AppBindings, RateLimitState } from './types';

export function clientIp(c: Context<AppBindings>): string {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

/**
 * Returns true if the caller is over the limit. Fails open on KV errors.
 */
export async function isRateLimited(
  c: Context<AppBindings>,
  scope: string,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  try {
    const nowSec = Date.now() / 1000;
    const bucket = Math.floor(nowSec / windowSec);
    const resetSeconds = Math.max(1, Math.ceil((bucket + 1) * windowSec - nowSec));
    const kvKey = `rl:${scope}:${key}:${bucket}`;
    const current = parseInt((await c.env.NONCE_KV.get(kvKey)) || '0', 10);
    if (current >= limit) {
      record(c, { limit, remaining: 0, resetSeconds });
      return true;
    }
    // Not atomic, but good enough to stop bulk scripts.
    await c.env.NONCE_KV.put(kvKey, String(current + 1), { expirationTtl: windowSec + 60 });
    record(c, { limit, remaining: Math.max(0, limit - current - 1), resetSeconds });
    return false;
  } catch {
    return false;
  }
}

/** Keep the most restrictive policy when several limiters run in one request. */
function record(c: Context<AppBindings>, next: RateLimitState): void {
  const prev: RateLimitState | undefined = c.get('ratelimit');
  if (!prev || next.remaining < prev.remaining || (next.remaining === prev.remaining && next.limit < prev.limit)) {
    c.set('ratelimit', next);
  }
}

/**
 * Emit RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset (IETF draft
 * names; Reset is seconds until the window rolls over) on the current
 * response when isRateLimited() recorded window state for this request.
 * Call after `await next()` in a middleware.
 */
export function applyRateLimitHeaders(c: Context<AppBindings>): void {
  const state: RateLimitState | undefined = c.get('ratelimit');
  if (!state) return;
  const h = c.res.headers;
  if (!h.has('RateLimit-Limit')) h.set('RateLimit-Limit', String(state.limit));
  if (!h.has('RateLimit-Remaining')) h.set('RateLimit-Remaining', String(state.remaining));
  if (!h.has('RateLimit-Reset')) h.set('RateLimit-Reset', String(state.resetSeconds));
}

export function rateLimitResponse(c: Context<AppBindings>, what: string) {
  const state: RateLimitState | undefined = c.get('ratelimit');
  const reset = state?.resetSeconds ?? 3600;
  c.header('Retry-After', String(reset));
  if (state) c.header('RateLimit-Limit', String(state.limit));
  c.header('RateLimit-Remaining', '0');
  c.header('RateLimit-Reset', String(reset));
  return c.json({ error: `Too many ${what} from this IP. Please try again later.`, code: 'rate_limited' }, 429);
}

// Policy constants
export const REGISTER_PER_IP_PER_HOUR = 5;
export const SPONSORED_BASENAME_PER_IP_PER_DAY = 2; // worker pays ETH for these
export const EXTERNAL_SEND_PER_IP_PER_HOUR = 30;   // free tier only
export const EXTERNAL_SEND_PER_HANDLE_PER_HOUR = 10; // free tier only
