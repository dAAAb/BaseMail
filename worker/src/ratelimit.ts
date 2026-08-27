/**
 * Fixed-window rate limiter backed by KV.
 *
 * Added after the 2026-08-24 abuse incident: 198 wallets registered in 16
 * minutes and burned their free credits on 799 spam emails to gmail.
 */
import type { Context } from 'hono';
import type { AppBindings } from './types';

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
    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const kvKey = `rl:${scope}:${key}:${bucket}`;
    const current = parseInt((await c.env.NONCE_KV.get(kvKey)) || '0', 10);
    if (current >= limit) return true;
    // Not atomic, but good enough to stop bulk scripts.
    await c.env.NONCE_KV.put(kvKey, String(current + 1), { expirationTtl: windowSec + 60 });
    return false;
  } catch {
    return false;
  }
}

export function rateLimitResponse(c: Context<AppBindings>, what: string) {
  return c.json({ error: `Too many ${what} from this IP. Please try again later.` }, 429);
}

// Policy constants
export const REGISTER_PER_IP_PER_HOUR = 5;
export const EXTERNAL_SEND_PER_IP_PER_HOUR = 30;   // free tier only
export const EXTERNAL_SEND_PER_HANDLE_PER_HOUR = 10; // free tier only
