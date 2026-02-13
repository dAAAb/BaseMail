import type { Env } from './types';

// Refresh tokens: long-lived, stored hashed in DB.
// This avoids forcing agents to SIWE-sign every day.

const DEFAULT_REFRESH_TTL_DAYS = 60;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

export function generateRefreshToken(): string {
  // URL-safe token. Prefix helps recognition.
  // 32 bytes randomness.
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `bm_refresh_${b64}`;
}

export async function issueRefreshToken(env: Env, wallet: string, handle: string): Promise<string> {
  const token = generateRefreshToken();
  const tokenHash = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + DEFAULT_REFRESH_TTL_DAYS * 24 * 60 * 60;

  await env.DB.prepare(
    `INSERT INTO refresh_tokens (token_hash, wallet, handle, created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, NULL)`
  )
    .bind(tokenHash, wallet.toLowerCase(), handle, now, expiresAt)
    .run();

  return token;
}

export async function verifyRefreshToken(env: Env, refreshToken: string): Promise<{ wallet: string; handle: string } | null> {
  if (!refreshToken) return null;
  if (!refreshToken.startsWith('bm_refresh_')) return null;

  const tokenHash = await sha256Hex(refreshToken);
  const row = await env.DB.prepare(
    'SELECT wallet, handle, expires_at FROM refresh_tokens WHERE token_hash = ?'
  )
    .bind(tokenHash)
    .first<{ wallet: string; handle: string; expires_at: number }>();

  if (!row) return null;
  if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) return null;

  // best-effort last_used
  await env.DB.prepare('UPDATE refresh_tokens SET last_used_at = ? WHERE token_hash = ?')
    .bind(Math.floor(Date.now() / 1000), tokenHash)
    .run();

  return { wallet: row.wallet, handle: row.handle };
}
