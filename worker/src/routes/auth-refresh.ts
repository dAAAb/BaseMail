import { Hono } from 'hono';
import { AppBindings } from '../types';
import { createToken } from '../auth';
import { verifyRefreshToken, issueRefreshToken } from '../refresh';

export const authRefreshRoutes = new Hono<AppBindings>();

/**
 * POST /api/auth/refresh
 * Body: { refresh_token }
 * Returns: { token, refresh_token? }
 *
 * Backward compatible: existing clients can ignore this.
 */
authRefreshRoutes.post('/refresh', async (c) => {
  const { refresh_token, rotate } = await c.req.json<{ refresh_token: string; rotate?: boolean }>();
  if (!refresh_token) return c.json({ error: 'refresh_token is required' }, 400);

  const verified = await verifyRefreshToken(c.env, refresh_token);
  if (!verified) return c.json({ error: 'Invalid or expired refresh token' }, 401);

  const token = await createToken({ wallet: verified.wallet, handle: verified.handle }, c.env.JWT_SECRET!);

  if (rotate) {
    const newRefresh = await issueRefreshToken(c.env, verified.wallet, verified.handle);
    return c.json({ token, refresh_token: newRefresh });
  }

  return c.json({ token });
});
