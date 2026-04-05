import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';

export const webhookRoutes = new Hono<AppBindings>();

webhookRoutes.use('/*', authMiddleware());

// Create a new webhook
webhookRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'No handle' }, 403);

  const body = await c.req.json<{ url?: string; events?: string[] }>().catch(() => ({} as any));
  const url = body?.url;
  if (!url) return c.json({ error: 'url is required' }, 400);

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  const events = (body.events && body.events.length > 0)
    ? body.events.join(',')
    : 'message.received';

  // Generate webhook secret
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(secretBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO webhooks (id, handle, url, events, secret, active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).bind(id, auth.handle, url, events, secret, now).run();

  return c.json({
    id,
    url,
    events,
    secret,
    active: 1,
    created_at: now,
    note: 'Store the secret now. It will not be shown again. Use it to verify webhook signatures via the X-BaseMail-Signature header.',
  }, 201);
});

// List webhooks (secrets not returned)
webhookRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'No handle' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT id, url, events, active, created_at, last_triggered_at FROM webhooks WHERE handle = ? ORDER BY created_at DESC'
  ).bind(auth.handle).all<{
    id: string; url: string; events: string; active: number;
    created_at: number; last_triggered_at: number | null;
  }>();

  return c.json({
    webhooks: rows.results || [],
  });
});

// Delete a webhook
webhookRoutes.delete('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'No handle' }, 403);

  const webhookId = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM webhooks WHERE id = ? AND handle = ?'
  ).bind(webhookId, auth.handle).run();

  if (!result.meta?.changes) {
    return c.json({ error: 'Webhook not found' }, 404);
  }

  return c.json({ success: true });
});
