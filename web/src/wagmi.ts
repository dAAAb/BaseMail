import { createConfig, http } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [base, mainnet],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'BaseMail' }),
  ],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
  },
});
