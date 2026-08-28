import { privateKeyToAccount } from 'viem/accounts';
import type { AuthResult, RefreshResult, VerifyResult } from './types';
import { errorFromResponse } from './errors';

type FetchFn = typeof fetch;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function signedSiwe(privateKey: string, baseUrl: string, fetchFn: FetchFn) {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const address = account.address;
  const startPath = '/api/auth/start';
  const startRes = await fetchFn(`${baseUrl}${startPath}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ address }),
  });
  if (!startRes.ok) throw await errorFromResponse('POST', startPath, startRes);
  const { message } = (await startRes.json()) as { nonce: string; message: string };
  const signature = await account.signMessage({ message });
  return { address, message, signature };
}

/**
 * Sign in with a private key WITHOUT auto-registering:
 * POST /api/auth/start -> sign -> POST /api/auth/verify.
 * Not subject to the registration rate limit; `registered` tells you whether
 * the wallet already has an inbox (if false, the token carries no handle).
 */
export async function signInWithPrivateKey(privateKey: string, baseUrl: string, fetchFn: FetchFn): Promise<VerifyResult> {
  const { address, message, signature } = await signedSiwe(privateKey, baseUrl, fetchFn);
  const path = '/api/auth/verify';
  const res = await fetchFn(`${baseUrl}${path}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ address, signature, message }),
  });
  if (!res.ok) throw await errorFromResponse('POST', path, res);
  return (await res.json()) as VerifyResult;
}

/**
 * SIWE authentication with a private key (one round trip pair):
 * 1. POST /api/auth/start        -> { nonce, message }
 * 2. sign `message` locally (EIP-191 personal_sign) with viem
 * 3. POST /api/auth/agent-register { address, signature, message, basename? }
 *    -> 201 (new account) or 200 (existing account), both return a JWT + refresh_token.
 */
export async function authenticateWithPrivateKey(
  privateKey: string,
  baseUrl: string,
  fetchFn: FetchFn,
  basename?: string,
): Promise<AuthResult> {
  const { address, message, signature } = await signedSiwe(privateKey, baseUrl, fetchFn);

  const registerBody: Record<string, string> = { address, signature, message };
  if (basename) registerBody.basename = basename;

  const registerPath = '/api/auth/agent-register';
  const registerRes = await fetchFn(`${baseUrl}${registerPath}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(registerBody),
  });
  if (!registerRes.ok) throw await errorFromResponse('POST', registerPath, registerRes);

  return (await registerRes.json()) as AuthResult;
}

/** POST /api/auth/refresh — exchange a refresh token for a fresh 24h JWT. */
export async function refreshToken(
  refresh_token: string,
  baseUrl: string,
  fetchFn: FetchFn,
  rotate = false,
): Promise<RefreshResult> {
  const path = '/api/auth/refresh';
  const res = await fetchFn(`${baseUrl}${path}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ refresh_token, rotate }),
  });
  if (!res.ok) throw await errorFromResponse('POST', path, res);
  return (await res.json()) as RefreshResult;
}
