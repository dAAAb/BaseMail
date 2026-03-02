/**
 * RP Signature generation for World ID v4.
 * CF Worker compatible — uses viem's secp256k1 (already bundled) + Web Crypto.
 *
 * Matches @worldcoin/idkit-server signRequest algorithm:
 * - nonce = hashToField(random32) = (keccak256(random32) >> 8) as 32 bytes
 * - message = nonce(32) || createdAt_u64_be(8) || expiresAt_u64_be(8)
 * - sig = secp256k1.sign(keccak256(message), privKey) + recovery byte + 27
 */

import { keccak256, toBytes, toHex, type Hex } from 'viem';

// We need secp256k1 signing — viem uses @noble/secp256k1 internally.
// Import from viem/accounts which exposes signing primitives.
import { sign } from 'viem/accounts';

/**
 * hashToField: (keccak256(input) >> 8) as 32-byte hex
 */
function hashToField(input: Uint8Array): Hex {
  const hash = BigInt(keccak256(input));
  const shifted = hash >> 8n;
  return ('0x' + shifted.toString(16).padStart(64, '0')) as Hex;
}

/**
 * Build the 48-byte message: nonce(32) || createdAt_be(8) || expiresAt_be(8)
 */
function buildMessage(nonceBytes: Uint8Array, createdAt: number, expiresAt: number): Uint8Array {
  const message = new Uint8Array(48);
  message.set(nonceBytes, 0);
  const view = new DataView(message.buffer);
  view.setBigUint64(32, BigInt(createdAt), false);
  view.setBigUint64(40, BigInt(expiresAt), false);
  return message;
}

export interface RpSignatureResult {
  sig: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Sign an RP request. CF Worker compatible.
 */
export async function signRpRequest(signingKeyHex: string, ttl = 300): Promise<RpSignatureResult> {
  // Generate nonce
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonceHex = hashToField(randomBytes);
  const nonceBytes = toBytes(nonceHex);

  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = createdAt + ttl;

  // Build message
  const message = buildMessage(nonceBytes, createdAt, expiresAt);

  // Hash the message with keccak256
  const msgHash = keccak256(message);

  // Sign with secp256k1 using viem
  const keyHex = (signingKeyHex.startsWith('0x') ? signingKeyHex : '0x' + signingKeyHex) as Hex;

  // viem's signMessage won't work here (it prefixes with EIP-191).
  // We need raw secp256k1 signing of the hash.
  // Use @noble/secp256k1 directly via viem's re-export.
  const { secp256k1 } = await import('@noble/curves/secp256k1');

  const privKeyBytes = toBytes(keyHex);
  const hashBytes = toBytes(msgHash as Hex);
  const signature = secp256k1.sign(hashBytes, privKeyBytes);

  const compact = signature.toCompactRawBytes();
  const sig65 = new Uint8Array(65);
  sig65.set(compact, 0);
  sig65[64] = signature.recovery + 27;

  return {
    sig: toHex(sig65),
    nonce: nonceHex,
    createdAt,
    expiresAt,
  };
}
