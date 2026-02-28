import { Hono } from 'hono';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';

export const inboxRoutes = new Hono<AppBindings>();

inboxRoutes.use('/*', authMiddleware());

/**
 * GET /api/inbox
 * List emails
 * Query: ?folder=inbox|sent&limit=20&offset=0
 */
inboxRoutes.get('/', async (c) => {
  const auth = c.get('auth');

  if (!auth.handle) {
    return c.json({ error: 'No email registered for this wallet' }, 403);
  }

  const folder = c.req.query('folder') || 'inbox';
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = parseInt(c.req.query('offset') || '0');
  const bonded = c.req.query('bonded') === 'true';
  const sort = c.req.query('sort') || 'created_at'; // created_at | bond_amount | deadline
  const order = c.req.query('order') === 'asc' ? 'ASC' : 'DESC';

  // Lazy-forfeit expired bonds for this user
  const now = Math.floor(Date.now() / 1000);
  try {
    await c.env.DB.prepare(
      `UPDATE attention_bonds SET status = 'forfeited', resolved_time = ?
       WHERE recipient_handle = ? AND status = 'active' AND response_deadline < ?`
    ).bind(now, auth.handle, now).run();
  } catch (_) { /* ignore if table doesn't exist */ }

  let emails;
  if (bonded) {
    const sortCol = sort === 'bond_amount' ? 'ab.amount_usdc' : sort === 'deadline' ? 'ab.response_deadline' : 'e.created_at';
    const defaultOrder = sort === 'deadline' ? 'ASC' : 'DESC';
    const finalOrder = c.req.query('order') ? order : defaultOrder;
    emails = await c.env.DB.prepare(
      `SELECT e.id, e.folder, e.from_addr, e.to_addr, e.subject, e.snippet, e.size, e.read, e.created_at,
              ab.amount_usdc as bond_amount, ab.status as bond_status, ab.response_deadline as bond_deadline
       FROM emails e
       INNER JOIN attention_bonds ab ON ab.email_id = e.id
       WHERE e.handle = ? AND e.folder = 'inbox' AND ab.status = 'active'
       ORDER BY ${sortCol} ${finalOrder}
       LIMIT ? OFFSET ?`
    ).bind(auth.handle, limit, offset).all();
  } else {
    emails = await c.env.DB.prepare(
      `SELECT e.id, e.folder, e.from_addr, e.to_addr, e.subject, e.snippet, e.size, e.read, e.created_at,
              ab.amount_usdc as bond_amount, ab.status as bond_status, ab.response_deadline as bond_deadline,
              ae.amount as attn_stake, ae.status as attn_status, ae.expires_at as attn_expires
       FROM emails e
       LEFT JOIN attention_bonds ab ON ab.email_id = e.id AND ab.status = 'active'
       LEFT JOIN attn_escrow ae ON ae.email_id = e.id
       WHERE e.handle = ? AND e.folder = ?
       ORDER BY
         CASE WHEN ae.amount IS NOT NULL AND ae.status = 'pending' THEN ae.amount ELSE 0 END DESC,
         e.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(auth.handle, folder, limit, offset).all();
  }

  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM emails WHERE handle = ? AND folder = ?'
  ).bind(auth.handle, folder).first<{ total: number }>();

  const unreadResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as unread FROM emails WHERE handle = ? AND folder = ? AND read = 0'
  ).bind(auth.handle, folder).first<{ unread: number }>();

  // Count bonded emails
  let bondedCount = 0;
  try {
    const bondedResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM emails e
       INNER JOIN attention_bonds ab ON ab.email_id = e.id
       WHERE e.handle = ? AND e.folder = 'inbox' AND ab.status = 'active'`
    ).bind(auth.handle).first<{ count: number }>();
    bondedCount = bondedResult?.count || 0;
  } catch (_) {}

  return c.json({
    emails: emails.results,
    total: countResult?.total || 0,
    unread: unreadResult?.unread || 0,
    bonded_count: bondedCount,
    limit,
    offset,
  });
});

/**
 * POST /api/inbox/mark-read
 * Mark emails as read.
 * Body: { ids?: string[], folder?: 'inbox'|'sent' }
 * - If ids provided: mark those ids as read for this handle.
 * - Else: mark all unread emails in the folder as read (default inbox).
 */
inboxRoutes.post('/mark-read', async (c) => {
  const auth = c.get('auth');
  if (!auth.handle) return c.json({ error: 'No email registered for this wallet' }, 403);

  let body: { ids?: string[]; folder?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const folder = body.folder || 'inbox';
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : null;

  if (ids && ids.length > 0) {
    // Mark selected ids
    const qs = ids.map(() => '?').join(',');
    const stmt = `UPDATE emails SET read = 1 WHERE handle = ? AND id IN (${qs})`;
    await c.env.DB.prepare(stmt).bind(auth.handle, ...ids).run();
  } else {
    // Mark all unread in folder
    await c.env.DB.prepare(
      'UPDATE emails SET read = 1 WHERE handle = ? AND folder = ? AND read = 0'
    ).bind(auth.handle, folder).run();
  }

  const unreadResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as unread FROM emails WHERE handle = ? AND folder = ? AND read = 0'
  ).bind(auth.handle, folder).first<{ unread: number }>();

  return c.json({ success: true, folder, unread: unreadResult?.unread || 0 });
});

/**
 * GET /api/inbox/:id
 * Read a specific email with body and attachment metadata
 */
inboxRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  const emailId = c.req.param('id');

  const email = await c.env.DB.prepare(
    'SELECT * FROM emails WHERE id = ? AND handle = ?'
  ).bind(emailId, auth.handle).first();

  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }

  // Mark as read
  if (!(email as { read: number }).read) {
    await c.env.DB.prepare(
      'UPDATE emails SET read = 1 WHERE id = ?'
    ).bind(emailId).run();

    // ── ATTN v3: Refund sender on read ──
    try {
      const { refundOnRead } = await import('./attn');
      await refundOnRead(c.env.DB, emailId);
    } catch (_) { /* ATTN system not ready — skip */ }
  }

  // Fetch raw content from R2
  const r2Key = (email as { r2_key: string }).r2_key;
  const r2Object = await c.env.EMAIL_STORE.get(r2Key);
  const body = r2Object ? await r2Object.text() : null;

  // Parse attachment metadata from MIME
  const attachments = body ? parseAttachmentMeta(body) : [];

  return c.json({
    ...email,
    read: 1,
    body,
    attachments,
  });
});

/**
 * GET /api/inbox/:id/attachment/:index
 * Download a specific attachment by index
 */
inboxRoutes.get('/:id/attachment/:index', async (c) => {
  const auth = c.get('auth');
  const emailId = c.req.param('id');
  const index = parseInt(c.req.param('index'));

  const email = await c.env.DB.prepare(
    'SELECT r2_key FROM emails WHERE id = ? AND handle = ?'
  ).bind(emailId, auth.handle).first<{ r2_key: string }>();

  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }

  const r2Object = await c.env.EMAIL_STORE.get(email.r2_key);
  if (!r2Object) {
    return c.json({ error: 'Email content not found' }, 404);
  }

  const raw = await r2Object.text();
  const attachments = extractAttachments(raw);

  if (index < 0 || index >= attachments.length) {
    return c.json({ error: 'Attachment not found' }, 404);
  }

  const att = attachments[index];
  const data = Uint8Array.from(atob(att.data), (c) => c.charCodeAt(0));

  return new Response(data, {
    headers: {
      'Content-Type': att.content_type,
      'Content-Disposition': `attachment; filename="${att.filename}"`,
    },
  });
});

/**
 * GET /api/inbox/:id/raw
 * Get raw email content
 */
inboxRoutes.get('/:id/raw', async (c) => {
  const auth = c.get('auth');
  const emailId = c.req.param('id');

  const email = await c.env.DB.prepare(
    'SELECT r2_key FROM emails WHERE id = ? AND handle = ?'
  ).bind(emailId, auth.handle).first<{ r2_key: string }>();

  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }

  const r2Object = await c.env.EMAIL_STORE.get(email.r2_key);
  if (!r2Object) {
    return c.json({ error: 'Email content not found' }, 404);
  }

  return new Response(r2Object.body, {
    headers: { 'Content-Type': 'message/rfc822' },
  });
});

/**
 * POST /api/inbox/:id/reject
 * Reject an email without reading it — immediately forfeit ATTN to receiver
 */
inboxRoutes.post('/:id/reject', async (c) => {
  const auth = c.get('auth');
  const emailId = c.req.param('id');

  if (!auth.handle) return c.json({ error: 'Not registered' }, 403);

  const email = await c.env.DB.prepare(
    'SELECT id, read, from_addr FROM emails WHERE id = ? AND handle = ? AND folder = ?'
  ).bind(emailId, auth.handle, 'inbox').first<{ id: string; read: number; from_addr: string }>();

  if (!email) return c.json({ error: 'Email not found' }, 404);

  if (email.read) {
    return c.json({ error: 'Cannot reject — email was already read (ATTN already refunded)' }, 400);
  }

  let attnTransferred = 0;
  try {
    const { rejectEmail } = await import('./attn');
    const result = await rejectEmail(c.env.DB, emailId, auth.wallet);
    if (result) attnTransferred = result.transferred;
  } catch (_) { /* ATTN system not ready */ }

  // Mark as read to prevent double-settlement
  await c.env.DB.prepare('UPDATE emails SET read = 1 WHERE id = ?').bind(emailId).run();

  return c.json({
    success: true,
    email_id: emailId,
    rejected: true,
    attn_received: attnTransferred,
    note: attnTransferred > 0
      ? `You received ${attnTransferred} ATTN as attention compensation`
      : 'No ATTN escrow was active for this email',
  });
});

/**
 * DELETE /api/inbox/:id
 * Delete an email
 */
inboxRoutes.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const emailId = c.req.param('id');

  const email = await c.env.DB.prepare(
    'SELECT r2_key FROM emails WHERE id = ? AND handle = ?'
  ).bind(emailId, auth.handle).first<{ r2_key: string }>();

  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }

  await c.env.EMAIL_STORE.delete(email.r2_key);
  await c.env.DB.prepare(
    'DELETE FROM emails WHERE id = ?'
  ).bind(emailId).run();

  return c.json({ success: true });
});

// ── MIME Parsing Helpers ──

interface AttachmentMeta {
  filename: string;
  content_type: string;
  size: number;
}

interface AttachmentFull extends AttachmentMeta {
  data: string; // base64
}

function parseAttachmentMeta(raw: string): AttachmentMeta[] {
  const attachments: AttachmentMeta[] = [];
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/);
  if (!boundaryMatch) return attachments;

  const boundary = boundaryMatch[1];
  const parts = raw.split('--' + boundary);

  for (const part of parts) {
    const dispositionMatch = part.match(/Content-Disposition:\s*attachment[^]*?filename="?([^"\r\n]+)"?/i);
    if (!dispositionMatch) continue;

    const filename = dispositionMatch[1].trim();
    const ctMatch = part.match(/Content-Type:\s*([^\r\n;]+)/i);
    const contentType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    // Estimate size from base64 data
    const bodyStart = part.indexOf('\r\n\r\n') !== -1
      ? part.indexOf('\r\n\r\n') + 4
      : part.indexOf('\n\n') !== -1
        ? part.indexOf('\n\n') + 2
        : -1;

    let size = 0;
    if (bodyStart !== -1) {
      const b64 = part.slice(bodyStart).replace(/[\r\n\s]/g, '');
      size = Math.floor(b64.length * 0.75);
    }

    attachments.push({ filename, content_type: contentType, size });
  }

  return attachments;
}

function extractAttachments(raw: string): AttachmentFull[] {
  const attachments: AttachmentFull[] = [];
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/);
  if (!boundaryMatch) return attachments;

  const boundary = boundaryMatch[1];
  const parts = raw.split('--' + boundary);

  for (const part of parts) {
    const dispositionMatch = part.match(/Content-Disposition:\s*attachment[^]*?filename="?([^"\r\n]+)"?/i);
    if (!dispositionMatch) continue;

    const filename = dispositionMatch[1].trim();
    const ctMatch = part.match(/Content-Type:\s*([^\r\n;]+)/i);
    const contentType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    const bodyStart = part.indexOf('\r\n\r\n') !== -1
      ? part.indexOf('\r\n\r\n') + 4
      : part.indexOf('\n\n') !== -1
        ? part.indexOf('\n\n') + 2
        : -1;

    if (bodyStart === -1) continue;

    const data = part.slice(bodyStart).replace(/[\r\n\s]/g, '').replace(/--$/, '');
    const size = Math.floor(data.length * 0.75);

    attachments.push({ filename, content_type: contentType, size, data });
  }

  return attachments;
}
