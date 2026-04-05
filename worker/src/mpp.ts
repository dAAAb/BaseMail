/**
 * MPP (Merchant Payment Protocol) middleware for BaseMail
 *
 * Dual-track auth:
 * - "Bearer ..." → existing SIWE/JWT/API key flow (unchanged)
 * - "Payment ..." or no auth → MPP flow (402 challenge → pay → retry)
 *
 * MPP users get auto-created accounts using their Tempo wallet address.
 */
import { Context, Next } from 'hono';
import { Mppx, tempo } from 'mppx/server';
import { privateKeyToAccount } from 'viem/accounts';
import { AppBindings } from './types';

// Cache the Mppx instance per isolate (avoid re-creating on every request)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mppxInstance: any = null;
let _lastKey: string | null = null;

function getMppx(env: { WALLET_PRIVATE_KEY?: string; MPP_SECRET_KEY?: string }): any {
  const pk = env.WALLET_PRIVATE_KEY;
  if (!pk) throw new Error('WALLET_PRIVATE_KEY required for MPP');

  // Re-create if key changed (shouldn't happen, but defensive)
  if (_mppxInstance && _lastKey === pk) return _mppxInstance;

  const account = privateKeyToAccount(pk as `0x${string}`);

  _mppxInstance = Mppx.create({
    secretKey: env.MPP_SECRET_KEY,
    methods: [
      tempo({
        // PathUSD on Base — 6 decimals
        currency: '0x20c000000000000000000000b9537d11c60e8b50',
        account,
      }),
    ],
  });
  _lastKey = pk;
  return _mppxInstance;
}

/**
 * Hono middleware: MPP charge gate
 *
 * If the request has a Bearer token → skip MPP, proceed to normal auth.
 * If the request has a Payment credential or no auth → run MPP flow.
 *
 * On successful payment, sets:
 *   c.var.mppWallet  — payer's wallet address
 *   c.var.mppReceipt — full MPP response (for Payment-Receipt header)
 *   c.var.auth       — auto-created AuthContext for the payer
 */
export function mppCharge(amount: string) {
  return async (c: Context<AppBindings>, next: Next) => {
    // Feature flag: skip MPP if not enabled
    if ((c.env as any).MPP_ENABLED !== 'true') {
      return next();
    }

    const authHeader = c.req.header('Authorization') || '';

    // Bearer token → existing SIWE/JWT/API-key flow, skip MPP entirely
    if (authHeader.startsWith('Bearer ')) {
      return next();
    }

    // No Bearer → try MPP flow
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mppx: any;
    try {
      mppx = getMppx(c.env);
    } catch (e: any) {
      // MPP not configured — fall through to normal auth (will 401)
      return next();
    }

    const chargeHandler = mppx.charge({ amount });
    const response = await chargeHandler(c.req.raw);

    // 402 → return challenge to client
    if (response.status === 402) {
      return response;
    }

    // 200 → payment successful
    if (response.status === 200) {
      // Extract payer wallet from response headers or body
      let payerWallet: string | null = null;
      try {
        const body = await response.clone().json() as any;
        payerWallet = body?.identity?.address || body?.payer || null;
      } catch {
        // Try header fallback
        try {
          payerWallet = response.headers?.get('X-MPP-Payer') || null;
        } catch {}
      }

      if (payerWallet) {
        // Store MPP context
        (c as any).set('mppWallet', payerWallet);
        (c as any).set('mppReceipt', response);

        // Auto-create or find account for this wallet
        const wallet = payerWallet.toLowerCase();
        let handle: string | null = null;

        try {
          const existing = await c.env.DB.prepare(
            'SELECT handle FROM accounts WHERE wallet = ?'
          ).bind(wallet).first<{ handle: string }>();

          if (existing) {
            handle = existing.handle;
          } else {
            // Auto-create account with wallet-derived handle
            handle = wallet.slice(0, 10); // 0x + first 8 chars
            const now = Math.floor(Date.now() / 1000);

            // Ensure accounts table exists
            await c.env.DB.prepare(
              `CREATE TABLE IF NOT EXISTS accounts (
                handle TEXT PRIMARY KEY, wallet TEXT NOT NULL, basename TEXT,
                webhook_url TEXT, created_at INTEGER NOT NULL, tx_hash TEXT,
                tier TEXT NOT NULL DEFAULT 'free', credits INTEGER NOT NULL DEFAULT 10
              )`
            ).run();

            await c.env.DB.prepare(
              `INSERT OR IGNORE INTO accounts (handle, wallet, basename, created_at, tier, credits)
               VALUES (?, ?, NULL, ?, 'free', 10)`
            ).bind(handle, wallet, now).run();
          }
        } catch (e) {
          // DB error — still allow the request with wallet-only auth
          handle = wallet.slice(0, 10);
        }

        // Set auth context so downstream handlers work
        c.set('auth', { wallet, handle: handle || wallet.slice(0, 10) });
        return next();
      }
    }

    // Unexpected status — return as-is
    return response;
  };
}

/**
 * Add Payment-Receipt header to response if MPP was used
 */
export function mppReceiptHeader() {
  return async (c: Context<AppBindings>, next: Next) => {
    await next();

    const receipt = (c as any).get?.('mppReceipt');
    if (receipt?.headers) {
      try {
        const receiptHeader = receipt.headers.get('Payment-Receipt');
        if (receiptHeader) {
          c.res.headers.set('Payment-Receipt', receiptHeader);
        }
      } catch {}
    }
  };
}
