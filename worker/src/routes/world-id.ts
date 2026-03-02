import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';

const worldId = new Hono<AppBindings>();

// ─── Auto-migrate: create table if not exists ───
async function ensureTable(db: D1Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS world_id_verifications (
      id                TEXT PRIMARY KEY,
      handle            TEXT NOT NULL,
      wallet            TEXT NOT NULL,
      nullifier_hash    TEXT NOT NULL UNIQUE,
      verification_level TEXT NOT NULL DEFAULT 'orb',
      credential_type   TEXT,
      world_id_version  TEXT NOT NULL DEFAULT 'v4',
      verified_at       INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (handle) REFERENCES accounts(handle)
    );
    CREATE INDEX IF NOT EXISTS idx_worldid_handle ON world_id_verifications(handle);
    CREATE INDEX IF NOT EXISTS idx_worldid_nullifier ON world_id_verifications(nullifier_hash);
  `);
}

/**
 * POST /api/world-id/verify
 * Accepts IDKit proof, verifies with World ID cloud API, stores result.
 * Body: { merkle_root, nullifier_hash, proof, verification_level, signal? }
 */
worldId.post('/verify', authMiddleware(), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    merkle_root: string;
    nullifier_hash: string;
    proof: string;
    verification_level?: string;
    signal?: string;
  }>();

  const { merkle_root, nullifier_hash, proof, verification_level, signal } = body;

  if (!merkle_root || !nullifier_hash || !proof) {
    return c.json({ error: 'Missing required proof fields' }, 400);
  }

  const APP_ID = c.env.WORLD_ID_APP_ID;
  const ACTION = c.env.WORLD_ID_ACTION || 'verify-human';

  if (!APP_ID) {
    return c.json({ error: 'World ID not configured' }, 500);
  }

  // Call World ID cloud verification API
  // v2 endpoint works for both v3 and v4 proofs (with allow_legacy_proofs)
  const verifyRes = await fetch(
    `https://developer.worldcoin.org/api/v2/verify/${APP_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merkle_root,
        nullifier_hash,
        proof,
        action: ACTION,
        signal: signal || '',
      }),
    },
  );

  if (!verifyRes.ok) {
    const err = await verifyRes.text();
    console.error('World ID verify failed:', verifyRes.status, err);
    return c.json({
      error: 'World ID verification failed',
      detail: verifyRes.status === 400 ? 'Invalid proof or already used' : 'Verification service error',
    }, 400);
  }

  const verifyData = await verifyRes.json<{
    success: boolean;
    nullifier_hash: string;
    action: string;
  }>();

  if (!verifyData.success) {
    return c.json({ error: 'Proof verification returned false' }, 400);
  }

  // Ensure DB table exists
  await ensureTable(c.env.DB);

  // Check if this nullifier was already used (same human, different account)
  const existing = await c.env.DB.prepare(
    'SELECT handle FROM world_id_verifications WHERE nullifier_hash = ?'
  ).bind(nullifier_hash).first<{ handle: string }>();

  if (existing) {
    if (existing.handle === auth.handle) {
      return c.json({ ok: true, message: 'Already verified', is_human: true });
    }
    return c.json({
      error: 'This World ID is already linked to another BaseMail account',
    }, 409);
  }

  // Store verification
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO world_id_verifications (id, handle, wallet, nullifier_hash, verification_level, world_id_version)
    VALUES (?, ?, ?, ?, ?, 'v4')
  `).bind(id, auth.handle, auth.wallet, nullifier_hash, verification_level || 'orb').run();

  // Mark account as human (add column if not exists — D1 safe)
  try {
    await c.env.DB.exec('ALTER TABLE accounts ADD COLUMN is_human INTEGER DEFAULT 0');
  } catch (_) { /* column already exists */ }

  await c.env.DB.prepare('UPDATE accounts SET is_human = 1 WHERE handle = ?')
    .bind(auth.handle).run();

  return c.json({
    ok: true,
    is_human: true,
    verification_level: verification_level || 'orb',
    message: '✅ Human verified!',
  });
});

/**
 * GET /api/world-id/status/:handle
 * Public: check if a handle is a verified human
 */
worldId.get('/status/:handle', async (c) => {
  const handle = c.req.param('handle');

  await ensureTable(c.env.DB);

  const record = await c.env.DB.prepare(
    'SELECT verification_level, verified_at FROM world_id_verifications WHERE handle = ? LIMIT 1'
  ).bind(handle).first<{ verification_level: string; verified_at: number }>();

  if (!record) {
    return c.json({ handle, is_human: false });
  }

  return c.json({
    handle,
    is_human: true,
    verification_level: record.verification_level,
    verified_at: record.verified_at,
  });
});

/**
 * DELETE /api/world-id/verify
 * Authenticated: remove own World ID verification (rare, but useful)
 */
worldId.delete('/verify', authMiddleware(), async (c) => {
  const auth = c.get('auth');

  await ensureTable(c.env.DB);

  await c.env.DB.prepare('DELETE FROM world_id_verifications WHERE handle = ?')
    .bind(auth.handle).run();

  try {
    await c.env.DB.prepare('UPDATE accounts SET is_human = 0 WHERE handle = ?')
      .bind(auth.handle).run();
  } catch (_) { /* is_human column may not exist */ }

  return c.json({ ok: true, message: 'World ID verification removed' });
});

export { worldId as worldIdRoutes };
