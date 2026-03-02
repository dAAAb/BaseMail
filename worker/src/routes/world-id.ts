import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';
import { signRpRequest } from '../rp-sign';

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
 * POST /api/world-id/rp-signature
 * Generate RP signature for IDKit v4. Requires auth.
 * Returns: { sig, nonce, created_at, expires_at }
 */
worldId.post('/rp-signature', authMiddleware(), async (c) => {
  const SIGNING_KEY = c.env.WORLD_ID_SIGNING_KEY;
  const ACTION = c.env.WORLD_ID_ACTION || 'verify-human';

  if (!SIGNING_KEY) {
    return c.json({ error: 'World ID signing key not configured' }, 500);
  }

  const { sig, nonce, createdAt, expiresAt } = await signRpRequest(SIGNING_KEY);

  return c.json({
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
  });
});

/**
 * POST /api/world-id/verify
 * Client-side verified: accepts IDKit result + World ID API verification result.
 * The frontend verifies with World ID API directly (CF Workers are IP-blocked),
 * then sends both the proof and the verification result here for storage.
 *
 * Body: { idkit_result, verify_result }
 * - idkit_result: raw IDKit response (for audit)
 * - verify_result: response from POST /v4/verify/{rp_id} (done by frontend)
 */
worldId.post('/verify', authMiddleware(), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    idkit_result?: any;
    verify_result?: any;
    // Also accept direct fields for backward compat
    nullifier_hash?: string;
    verification_level?: string;
    protocol_version?: string;
  }>();

  const verifyResult = body.verify_result;

  if (!verifyResult || !verifyResult.success) {
    return c.json({
      error: 'Missing or failed verify_result. Frontend must call World ID /v4/verify first.',
      detail: verifyResult?.detail || verifyResult?.code,
    }, 400);
  }

  // Extract nullifier from verified result
  const firstResult = verifyResult.results?.[0];
  const nullifier = firstResult?.nullifier || verifyResult.nullifier;
  const identifier = firstResult?.identifier || 'orb';

  if (!nullifier) {
    return c.json({ error: 'No nullifier in verification result' }, 400);
  }

  // Ensure DB table exists
  await ensureTable(c.env.DB);

  // Check if this nullifier was already used (same human, different account)
  const existing = await c.env.DB.prepare(
    'SELECT handle FROM world_id_verifications WHERE nullifier_hash = ?'
  ).bind(nullifier).first<{ handle: string }>();

  if (existing) {
    if (existing.handle === auth.handle) {
      return c.json({ ok: true, message: 'Already verified', is_human: true });
    }
    return c.json({
      error: 'This World ID is already linked to another BaseMail account',
    }, 409);
  }

  // Determine version from response
  const version = verifyResult.protocol_version || body.protocol_version || 'v4';

  // Store verification
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO world_id_verifications (id, handle, wallet, nullifier_hash, verification_level, world_id_version)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, auth.handle, auth.wallet, nullifier, identifier, version).run();

  // Mark account as human (add column if not exists — D1 safe)
  try {
    await c.env.DB.exec('ALTER TABLE accounts ADD COLUMN is_human INTEGER DEFAULT 0');
  } catch (_) { /* column already exists */ }

  await c.env.DB.prepare('UPDATE accounts SET is_human = 1 WHERE handle = ?')
    .bind(auth.handle).run();

  return c.json({
    ok: true,
    is_human: true,
    verification_level: identifier,
    protocol_version: version,
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
 * Authenticated: remove own World ID verification
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

/**
 * GET /api/world-id/debug
 * Temporary: test World ID v4 API connectivity
 */
worldId.get('/debug', async (c) => {
  const RP_ID = c.env.WORLD_ID_RP_ID;
  const HAS_SIGNING_KEY = !!c.env.WORLD_ID_SIGNING_KEY;

  // Test connectivity to all World ID API domains
  const domains = [
    'https://developer.world.org',
    'https://developer.worldcoin.org',
    'https://staging-developer.worldcoin.org',
  ];
  const apiTests: Record<string, string> = {};
  for (const domain of domains) {
    try {
      const res = await fetch(`${domain}/api/v4/verify/${RP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol_version: '3.0', nonce: 'test', action: 'verify-human', responses: [] }),
      });
      const text = await res.text();
      apiTests[domain] = `${res.status}: ${text.slice(0, 200)}`;
    } catch (e: any) {
      apiTests[domain] = `Error: ${e.message}`;
    }
  }

  return c.json({
    rp_id: RP_ID,
    has_signing_key: HAS_SIGNING_KEY,
    app_id: c.env.WORLD_ID_APP_ID,
    action: c.env.WORLD_ID_ACTION,
    api_tests: apiTests,
  });
});

export { worldId as worldIdRoutes };
