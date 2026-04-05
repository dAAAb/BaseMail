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
 */
import { Context, Next } from 'hono';
import { Mppx, tempo } from 'mppx/server';
import { privateKeyToAccount } from 'viem/accounts';
import { AppBindings } from './types';

// USDC.e on Tempo chain (6 decimals)
const USDC_E = '0x20c000000000000000000000b9537d11c60e8b50';

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
        currency: USDC_E as `0x${string}`,
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
    } catch {
      return next();
    }

    // mppx.charge returns a handler: (request) => Promise<Response>
    const chargeHandler = mppx.charge({ amount });
    const response = await chargeHandler(c.req.raw);

    // 402 → return challenge to client (tells them how to pay)
    if (response.status === 402) {
      return response.challenge;
    }

    // Payment verified → extract payer wallet from credential
    // The credential is base64-encoded JSON with "source": "did:pkh:eip155:<chainId>:<address>"
    let payerWallet: string | null = null;
    try {
      const credPayload = authHeader.replace(/^Payment\s+/i, '');
      if (credPayload) {
        const decoded = JSON.parse(atob(credPayload));
        const source = decoded?.source || '';
        const addrMatch = source.match(/0x[0-9a-fA-F]{40}/);
        if (addrMatch) payerWallet = addrMatch[0];
      }
    } catch {}

    // Fallback: try response object
    if (!payerWallet) {
      try {
        const body = typeof response.json === 'function' ? await response.json() : response;
        payerWallet = body?.receipt?.payer || body?.identity?.address || body?.payer || null;
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
        const receiptResponse = mppResponse.withReceipt(c.res);
        c.res = receiptResponse;
      } catch {
        // If withReceipt fails, just return the original response
      }
    }
  };
}
