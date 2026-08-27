// Buffer polyfill required by the WalletConnect SDK; loaded with the wallet chunk only.
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
export {};
