import type { Env } from './types';
import { sha256Hex } from './refresh';

// API keys: agent-friendly long-lived credentials.
// Stored hashed in DB. Returned once on creation.

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateApiKey(): string {
  // 24 bytes => 48 hex chars
  const raw = crypto.getRandomValues(new Uint8Array(24));
  const hex = bytesToHex(raw);
  return `bm_live_${hex}`;
}

export async function storeApiKey(env: Env, handle: string, apiKey: string, name: string | null, scopes: string): Promise<void> {
  const hash = await sha256Hex(apiKey);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO api_keys (key_hash, handle, name, scopes, created_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL)`
  )
    .bind(hash, handle, name, scopes, now)
    .run();
}

export async function verifyApiKey(env: Env, apiKey: string): Promise<{ handle: string; scopes: string } | null> {
  if (!apiKey) return null;
  if (!apiKey.startsWith('bm_live_')) return null;

  const hash = await sha256Hex(apiKey);
  const row = await env.DB.prepare(
    'SELECT handle, scopes, revoked_at FROM api_keys WHERE key_hash = ?'
  )
    .bind(hash)
    .first<{ handle: string; scopes: string; revoked_at: number | null }>();

  if (!row) return null;
  if (row.revoked_at) return null;

  await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?')
    .bind(Math.floor(Date.now() / 1000), hash)
    .run();

  return { handle: row.handle, scopes: row.scopes };
}
