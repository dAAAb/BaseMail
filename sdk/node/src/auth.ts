import { privateKeyToAccount } from 'viem/accounts';
import type { BaseMailOptions, AuthResult } from './types';

/**
 * Handle SIWE-based authentication using a private key.
 * 1. POST /api/auth/start to get SIWE message
 * 2. Sign message locally with viem
 * 3. POST /api/auth/agent-register with signature
 */
export async function authenticateWithPrivateKey(
  privateKey: string,
  baseUrl: string,
  basename?: string,
): Promise<AuthResult> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const address = account.address;

  // Step 1: Get SIWE message
  const startRes = await fetch(`${baseUrl}/api/auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });

  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error(`Auth start failed: ${(err as any).error || startRes.statusText}`);
  }

  const { message } = (await startRes.json()) as { nonce: string; message: string };

  // Step 2: Sign the SIWE message locally
  const signature = await account.signMessage({ message });

  // Step 3: Register/login
  const registerBody: Record<string, string> = { address, signature, message };
  if (basename) registerBody.basename = basename;

  const registerRes = await fetch(`${baseUrl}/api/auth/agent-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerBody),
  });

  if (!registerRes.ok) {
    const err = await registerRes.json().catch(() => ({}));
    throw new Error(`Auth register failed: ${(err as any).error || registerRes.statusText}`);
  }

  return (await registerRes.json()) as AuthResult;
}
