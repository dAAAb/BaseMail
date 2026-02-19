# BaseMail

**On-Chain Email with Attention Bonds — Built on Base**

BaseMail is an email system where **your inbox has a price**. Powered by [Attention Bonds](https://basescan.org/address/0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220#code) — a USDC escrow mechanism inspired by [Quadratic Funding](https://wtfisqf.com/) — senders stake tokens to reach you. Reply → they get refunded. Ignore → you keep the bond. Spam becomes economically irrational.

**Live at [basemail.ai](https://basemail.ai)** · **Contract: [BaseScan](https://basescan.org/address/0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220#code)** · **Paper: [Connection-Oriented QAF](https://blog.juchunko.com/en/attention-bond-email-arxiv/)**

---

## Why Attention Bonds?

Email is broken. Inboxes overflow with spam, cold outreach, and noise. Traditional filters are heuristic — they can't measure *intent*.

Attention Bonds fix this with mechanism design:

| Problem | Solution |
|---------|----------|
| Spam floods inboxes | Senders must **stake USDC** to reach you |
| No cost to waste attention | **Bonds are forfeited** if recipient ignores the email |
| Legitimate senders penalized | **Bonds are refunded** (minus protocol fee) when recipient replies |
| Sybil attacks on attention | **CO-QAF discounting** reduces manipulation by correlated senders |

This is **Quadratic Attention Funding** applied to communication — a new primitive for the attention economy.

## How It Works

```
Sender                    BaseMail                     Recipient
  │                          │                            │
  ├── Approve USDC ─────────>│                            │
  ├── Deposit Bond ─────────>│  (on-chain escrow)         │
  ├── Send Email ───────────>│───── Email arrives ───────>│
  │                          │                            │
  │                          │     Recipient replies? ────┤
  │                          │         │                  │
  │                    ┌─────┴─────┐   │                  │
  │                    │  YES      │   │  NO (7 days)     │
  │                    │           │   │                  │
  │<── Bond Refunded ──┤  -10% fee │   ├── Bond Forfeited │
  │    (90% back)      └───────────┘   │  (recipient keeps)
  │                                    └──────────────────┘
```

### On-Chain Mechanism

- **AttentionBondEscrow** contract on Base Mainnet ([verified source](https://basescan.org/address/0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220#code))
- USDC escrow with 7-day response window (configurable 1–30 days)
- Dynamic pricing: `p(t,s) = p₀ · (1 + α·D(t))^β · (1 - γ·R̄ₛ(t))`
- Whitelist support — trusted senders skip bonding
- 10% protocol fee on refunds (configurable up to 20%)

### Connection-Oriented QAF (CO-QAF)

BaseMail implements **CO-QAF** — a Sybil-resistant extension of Quadratic Funding for attention allocation:

- **α_ij estimation**: Jaccard similarity of recipient overlap between senders
- **Sybil resistance**: CO-QAF bounds the Sybil premium at `1/α` (constant), vs. unbounded growth in standard QAF
- **Bridging capital amplified**: Senders who connect otherwise-separate communities get full quadratic weight
- **Bonding capital discounted**: Correlated senders (same social circles) receive diminished matching

> Reference: *"Connection-Oriented Quadratic Attention Funding"* — Ko, Tang, Weyl (2026)

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│  Frontend    │────>│  Cloudflare      │────>│  D1 (SQL)  │
│  (Pages)     │     │  Worker (Hono)   │     │  R2 (MIME) │
│  React+Vite  │     │  api.basemail.ai │     │  KV (nonce)│
└─────────────┘     └──────────────────┘     └────────────┘
       │                     │                      │
  wagmi/SIWE          Hono REST API          AttentionBondEscrow
  Wallet Connect      11 attention           (Base Mainnet)
  Basename buy        endpoints              USDC escrow
```

| Component | Stack |
|-----------|-------|
| Worker | Cloudflare Workers, Hono, viem |
| Frontend | React, Vite, Tailwind, wagmi |
| Database | Cloudflare D1 (SQLite) |
| Email Storage | Cloudflare R2 |
| Auth Nonces | Cloudflare KV |
| Inbound Email | Cloudflare Email Routing |
| Outbound Email | Resend.com API |
| Smart Contract | Solidity 0.8.34, OpenZeppelin, Base Mainnet |
| Token | USDC (Base) |

## Features

### Core Email
- **SIWE Authentication** — Sign-In with Ethereum, no passwords
- **Agent-friendly API** — 2 calls to register, 1 to send
- **Basename Integration** — Auto-detect, claim, or purchase Basenames on-chain
- **Internal Email** — Free, unlimited @basemail.ai ↔ @basemail.ai
- **External Email** — Via Resend.com, credit-based pricing
- **Pre-storage** — Emails to unregistered 0x addresses are held for 30 days

### Attention Economy (v2)
- **Attention Bonds** — USDC escrow for inbound emails, on-chain via `AttentionBondEscrow.sol`
- **Dynamic Pricing** — Attention price adjusts based on demand and response rate
- **CO-QAF Scoring** — Quadratic attention funding with Sybil resistance
- **Compose Detection** — Auto-detects if recipient has bonds enabled, shows deposit prompt
- **3-Step Deposit Flow** — Approve USDC → Deposit to Escrow → Record bond via API
- **Email Activity Stats** — Dashboard shows received/sent/unique senders/reply rate
- **Whitelist Management** — Exempt trusted senders from bonding

## Smart Contract

**[AttentionBondEscrow.sol](https://basescan.org/address/0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220#code)** — Verified on BaseScan

```solidity
// Core functions
function deposit(address recipient, bytes32 emailId, uint256 amount) external;
function reply(bytes32 emailId) external;      // Recipient replies → refund sender
function forfeit(bytes32 emailId) external;    // No reply after window → recipient keeps bond

// Configuration (per-user)
function setAttentionPrice(uint256 price) external;
function setWhitelist(address sender, bool status) external;
function setResponseWindow(uint256 window) external;  // 1-30 days

// View
function getAttentionPrice(address recipient) public view returns (uint256);
function getBond(bytes32 emailId) external view returns (...);
```

**Parameters:**
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base)
- Protocol fee: 10% (on refunds only)
- Min bond: 0.001 USDC
- Default price: 0.01 USDC
- Response window: 7 days (default)

## API

### Quick Start (AI Agents)

```bash
# 1. Get SIWE message
curl -X POST https://api.basemail.ai/api/auth/start \
  -H "Content-Type: application/json" \
  -d '{"address":"YOUR_WALLET_ADDRESS"}'

# 2. Sign message + register (returns JWT token)
curl -X POST https://api.basemail.ai/api/auth/agent-register \
  -H "Content-Type: application/json" \
  -d '{"address":"...","signature":"0x...","message":"..."}'

# 3. Send email
curl -X POST https://api.basemail.ai/api/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"someone@basemail.ai","subject":"Hello","body":"Hi!"}'
```

### Attention Bond Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attention/config` | Get your attention bond config |
| PUT | `/api/attention/config` | Enable/configure attention bonds |
| GET | `/api/attention/price/:handle` | Get recipient's current attention price |
| POST | `/api/attention/bond` | Record a bond (after on-chain deposit) |
| GET | `/api/attention/bonds` | List your bonds (sent/received) |
| GET | `/api/attention/stats` | QAF score, demand, response rate |
| GET | `/api/attention/qaf` | CO-QAF scoring with α_ij matrix |
| POST | `/api/attention/whitelist` | Add sender to whitelist |
| DELETE | `/api/attention/whitelist/:address` | Remove from whitelist |
| GET | `/api/attention/whitelist` | List whitelisted addresses |
| GET | `/api/attention/leaderboard` | Top accounts by QAF score |

Full API docs: `GET https://api.basemail.ai/api/docs`

## Project Structure

```
BaseMail/
├── worker/              # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts          # Routes + API docs
│   │   ├── auth.ts           # JWT + SIWE verification
│   │   ├── email-handler.ts  # Inbound email processing
│   │   └── routes/
│   │       ├── attention.ts  # Attention bond endpoints (11 routes)
│   │       ├── auth.ts       # /api/auth/*
│   │       ├── register.ts   # /api/register/* + Basename check
│   │       ├── send.ts       # /api/send
│   │       ├── inbox.ts      # /api/inbox/*
│   │       ├── identity.ts   # /api/identity/*
│   │       └── credits.ts    # /api/credits/*
│   └── wrangler.toml
├── web/                 # Frontend (Cloudflare Pages)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx   # Landing + Basename availability check
│   │   │   └── Dashboard.tsx # Email client + Attention Bonds UI
│   │   └── wagmi.ts          # Wallet config (Base Mainnet)
│   └── vite.config.ts
├── contracts/           # Smart contracts
│   ├── contracts/
│   │   └── AttentionBondEscrow.sol  # USDC escrow contract
│   └── hardhat.config.ts
└── skill/               # OpenClaw AI agent skill
    └── handlers/
        └── index.ts     # Agent email integration
```

## Development

### Prerequisites

- Node.js 20+
- Cloudflare account (Workers, D1, R2, KV, Email Routing)
- Wrangler CLI

### Setup

```bash
# Install dependencies (npm workspace — must run from root)
npm install

# Configure secrets (create worker/.dev.vars)
# JWT_SECRET=your-secret-here
# WALLET_PRIVATE_KEY=0x...
# RESEND_API_KEY=re_...

# Run worker locally
cd worker && npx wrangler dev

# Run frontend locally
cd web && npx vite dev
```

### Deploy

```bash
# Deploy worker
cd worker && npx wrangler deploy

# Build + deploy frontend
cd web && npx vite build && npx wrangler pages deploy dist --project-name=basemail-web
```

## Related Work

- [Quadratic Funding](https://wtfisqf.com/) — Buterin, Hitzig, Weyl (2019)
- [Plural Funding](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4712606) — Connection-Oriented Quadratic Funding
- [Attention Markets](https://doi.org/10.1257/aer.96.4.1191) — Loder & Van Alstyne (2006)
- [Sender-Pays Email](https://doi.org/10.1257/aer.102.3.416) — Rao & Reiley (2012)

## License

MIT
