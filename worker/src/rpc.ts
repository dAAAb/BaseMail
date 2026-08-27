/**
 * Shared viem transports with fallback across several public RPCs.
 * Public endpoints rate-limit or drop methods without notice
 * (publicnode blocks eth_getTransactionReceipt, mainnet.base.org 429s),
 * so never depend on a single one.
 */
import { fallback, http, type Transport } from 'viem';

const BASE_RPCS = [
  'https://mainnet.base.org',
  'https://base.drpc.org',
  'https://base-mainnet.public.blastapi.io',
  'https://base.gateway.tenderly.co',
];

const ETH_RPCS = [
  'https://cloudflare-eth.com',
  'https://eth.drpc.org',
  'https://eth-mainnet.public.blastapi.io',
];

const opts = { timeout: 10_000, retryCount: 1 } as const;

export function baseTransport(): Transport {
  return fallback(BASE_RPCS.map((u) => http(u, opts)), { rank: false, retryCount: 0 });
}

export function ethTransport(): Transport {
  return fallback(ETH_RPCS.map((u) => http(u, opts)), { rank: false, retryCount: 0 });
}
