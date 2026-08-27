/**
 * Wallet providers (wagmi + react-query), loaded lazily so the public pages
 * (landing, developers, about, …) never download the wallet SDKs.
 */
import './polyfills';
import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmi';

const queryClient = new QueryClient();

// Only auto-reconnect when this browser has connected before; otherwise wagmi would
// initialise every connector SDK (WalletConnect relay, Coinbase) on mount.
function hasRecentConnector(): boolean {
  try { return !!localStorage.getItem('wagmi.recentConnectorId'); } catch { return false; }
}

export default function WalletApp({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config} reconnectOnMount={hasRecentConnector()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
