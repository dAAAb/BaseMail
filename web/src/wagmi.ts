import { createConfig, fallback, http } from 'wagmi';
import { base, mainnet, baseSepolia } from 'wagmi/chains';
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors';

export const config = createConfig({
  chains: [base, mainnet, baseSepolia],
  connectors: [
    coinbaseWallet({ appName: 'BaseMail' }),   // Primary — 放第一位
    walletConnect({ projectId: 'add5558996c46a35e9f43542dc4eba29' }),
    injected(),                                  // Fallback for browser extensions
  ],
  transports: {
    // mainnet.base.org alone is rate-limited ("not for production" per Base docs) and
    // failed mid-send with "RPC Request failed." — fall back across public endpoints that
    // allow browser CORS and serve receipts (same set as worker/src/rpc.ts).
    [base.id]: fallback([
      http('https://base.gateway.tenderly.co'),
      http('https://base.drpc.org'),
      http('https://mainnet.base.org'),
      http('https://base-mainnet.public.blastapi.io'),
    ], { retryCount: 1, rank: { interval: 30_000 } }), // re-rank by health every 30s so a rate-limited endpoint drops back
    [mainnet.id]: http(),
    [baseSepolia.id]: http(),
  },
});
