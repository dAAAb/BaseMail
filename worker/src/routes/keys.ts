import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';
import { generateApiKey, storeApiKey } from '../api-keys';
import { sha256Hex } from '../refresh';

export const keyRoutes = new Hono<AppBindings>();

keyRoutes.use('/*', authMiddleware());

// Create a new API key (returns plaintext once)
keyRoutes.post('/create', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'No handle' }, 403);

  const body = await c.req.json<{ name?: string; scopes?: string[] }>().catch(() => ({} as any));
  const name = body?.name?.slice(0, 64) || null;
  const scopes = (body?.scopes && body.scopes.length > 0) ? body.scopes.join(',') : 'send,inbox';

  const apiKey = generateApiKey();
  await storeApiKey(c.env, auth.handle, apiKey, name, scopes);

  return c.json({
    api_key: apiKey,
    handle: auth.handle,
    scopes: scopes.split(','),
    note: 'Store this API key now. It will not be shown again.',
  });
});

// List keys (no plaintext)
keyRoutes.get('/list', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'No handle' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT key_hash, name, scopes, created_at, last_used_at, revoked_at FROM api_keys WHERE handle = ? ORDER BY created_at DESC'
  )
    .bind(auth.handle)
    .all<{ key_hash: string; name: string | null; scopes: string; created_at: number; last_used_at: number | null; revoked_at: number | null }>();

  return c.json({
    keys: (rows.results || []).map((r) => ({
      id: r.key_hash.slice(0, 12),
      name: r.name,
      scopes: (r.scopes || '').split(',').filter(Boolean),
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      revoked_at: r.revoked_at,
    })),
  });
});

// Revoke a key by providing the full key (or key_hash prefix)
keyRoutes.post('/revoke', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'No handle' }, 403);

  const { api_key, key_id } = await c.req.json<{ api_key?: string; key_id?: string }>();
  let keyHash: string | null = null;

  if (api_key && api_key.startsWith('bm_live_')) {
    keyHash = await sha256Hex(api_key);
  } else if (key_id && key_id.length >= 6) {
    // Allow prefix match for convenience
    const row = await c.env.DB.prepare(
      'SELECT key_hash FROM api_keys WHERE handle = ? AND substr(key_hash, 1, ?) = ?'
    )
      .bind(auth.handle, key_id.length, key_id)
      .first<{ key_hash: string }>();
    keyHash = row?.key_hash || null;
  }

  if (!keyHash) return c.json({ error: 'Provide api_key or key_id' }, 400);

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'UPDATE api_keys SET revoked_at = ? WHERE handle = ? AND key_hash = ?'
  )
    .bind(now, auth.handle, keyHash)
    .run();

  return c.json({ success: true });
});
