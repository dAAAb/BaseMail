/**
 * MPP (Merchant Payment Protocol) middleware for BaseMail
 *
 * Dual-track auth:
 * - "Bearer ..." → existing SIWE/JWT/API key flow (unchanged)
 * - "Payment ..." or no auth → MPP flow (402 challenge → pay → retry)
 *
 * MPP users get auto-created accounts using their Tempo wallet address.
 *
 * Reference: https://mpp.dev/quickstart/server
 * Pattern:
 *   const response = await mppx.charge({ amount: '0.1' })(request)
 *   if (response.status === 402) return response.challenge
 *   return response.withReceipt(Response.json({ data: '...' }))
 */
import { Context, Next } from 'hono';
import { Mppx, tempo } from 'mppx/server';
import { privateKeyToAccount } from 'viem/accounts';
import { AppBindings } from './types';

// PathUSD on Tempo chain (6 decimals)
const PATHUSD = '0x20c0000000000000000000000000000000000000';

// Cache the Mppx instance per isolate (avoid re-creating on every request)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mppxInstance: any = null;
let _lastConfig: string | null = null;

function getMppx(env: { WALLET_ADDRESS?: string; MPP_SECRET_KEY?: string; MPP_PRIVATE_KEY?: string }): any {
  const secretKey = env.MPP_SECRET_KEY;
  const privateKey = env.MPP_PRIVATE_KEY;
  if (!secretKey) throw new Error('MPP_SECRET_KEY required for MPP');
  if (!privateKey) throw new Error('MPP_PRIVATE_KEY required for MPP');

  const configKey = `${secretKey}:${privateKey}`;
  if (_mppxInstance && _lastConfig === configKey) return _mppxInstance;

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  _mppxInstance = Mppx.create({
    secretKey,
    methods: [
      tempo({
        currency: PATHUSD as `0x${string}`,
        account,
        mode: 'push',
        waitForConfirmation: false,
      }),
    ],
  });
  _lastConfig = configKey;
  return _mppxInstance;
}

/**
 * Hono middleware: MPP charge gate
 *
 * amount is human-readable (e.g., '0.01' for $0.01, '1.00' for $1.00)
 *
 * If the request has a Bearer token → skip MPP, proceed to normal auth.
 * If the request has a Payment credential or no auth → run MPP flow.
 *
 * On successful payment, sets auth context with the payer's wallet.
 */
export function mppCharge(amount: string) {
  return async (c: Context<AppBindings>, next: Next) => {
    // Feature flag: skip MPP if not enabled
    const mppEnabled = (c.env as any).MPP_ENABLED;
    console.log('[MPP] MPP_ENABLED =', mppEnabled);
    if (mppEnabled !== 'true') {
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
    } catch (_e: any) {
      // MPP not configured — fall through to normal auth (will 401)
      console.error('[MPP] getMppx failed:', _e?.message || _e);
      return next();
    }

    // mppx.charge returns a handler: (request) => Promise<Response>
    const chargeHandler = mppx.charge({ amount });
    const response = await chargeHandler(c.req.raw);

    // 402 → return challenge to client (tells them how to pay)
    if (response.status === 402) {
      return response.challenge;
    }

    // Payment verified → extract payer info and auto-create account
    // The response has .withReceipt() to attach receipt to our actual response
    // We store the response object to call .withReceipt() later

    // Try to get payer wallet from the credential/receipt
    let payerWallet: string | null = null;
    try {
      // In push mode, the credential contains the tx hash from the payer
      // The payer's address can be extracted from the verified credential
      const body = await response.clone().json();
      payerWallet = body?.receipt?.payer || body?.identity?.address || body?.payer || null;
    } catch {
      // If we can't parse body, try headers
      try {
        const payerHeader = response.headers?.get?.('X-MPP-Payer');
        if (payerHeader) payerWallet = payerHeader;
      } catch {}
    }

    // Store MPP response for withReceipt in the response phase
    (c as any)._mppResponse = response;

    if (payerWallet) {
      const wallet = payerWallet.toLowerCase();

      // Auto-create or find account for this wallet
      let handle: string | null = null;
      try {
        const existing = await c.env.DB.prepare(
          'SELECT handle FROM accounts WHERE wallet = ?'
        ).bind(wallet).first<{ handle: string }>();

        if (existing) {
          handle = existing.handle;
        } else {
          // Auto-create account with wallet-derived handle
          handle = wallet.slice(0, 10); // 0x + first 8 hex chars
          const now = Math.floor(Date.now() / 1000);
          await c.env.DB.prepare(
            `INSERT OR IGNORE INTO accounts (handle, wallet, basename, created_at, tier, credits)
             VALUES (?, ?, NULL, ?, 'free', 10)`
          ).bind(handle, wallet, now).run();
        }
      } catch {
        handle = wallet.slice(0, 10);
      }

      // Set auth context so downstream handlers work
      c.set('auth', { wallet, handle: handle || wallet.slice(0, 10) });
    }

    return next();
  };
}

/**
 * Post-handler middleware: attach Payment-Receipt to the response
 * Call this AFTER the main handler to wrap the response with MPP receipt.
 */
export function mppReceiptMiddleware() {
  return async (c: Context<AppBindings>, next: Next) => {
    await next();

    const mppResponse = (c as any)._mppResponse;
    if (mppResponse && typeof mppResponse.withReceipt === 'function') {
      try {
        // Wrap the actual response with the Payment-Receipt header
        const receiptResponse = mppResponse.withReceipt(c.res);
        c.res = receiptResponse;
      } catch {
        // If withReceipt fails, just return the original response
      }
    }
  };
}
