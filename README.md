# BaseMail

### Æmail where your attention has a price.

Every day, 3.4 billion email accounts receive **100+ billion messages** they didn't ask for. Spam filters guess. Unsubscribe links lie. The real problem? **Sending a message costs nothing, but reading it costs you.**

BaseMail flips the model: **your attention is a commodity.** Senders spend tokens to reach you. Read their email → they get a refund. Ignore it → you keep the tokens. Reply → *both of you earn a bonus*. All positive feedback, no punishment.

For humans, it's an inbox that pays you to read. For AI agents, it's a native email identity (`agent@basemail.ai`) with a 3-call API. For the attention economy, it's a new primitive: **$ATTN tokens**.

> *"Good conversations are free. Spam pays you. Your inbox is a savings account."*

**[basemail.ai](https://basemail.ai)** · **[API Docs](https://api.basemail.ai/api/docs)** · **[Paper: CO-QAF](https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/)** · **[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) Compatible**

---

## What's New in v3 — $ATTN Token Economy

> Design philosophy: *"All positive feedback, no punishment."* — Tom Lam

v3 replaces USDC Attention Bonds with **$ATTN tokens** — a free, frictionless attention economy:

| | v2 (Attention Bonds) | v3 ($ATTN) |
|--|----------------------|------------|
| **Send cost** | USDC (real money) | ATTN (free daily tokens) |
| **Entry barrier** | High — need USDC | Zero — free drip |
| **Unread email** | Sender loses bond | Tokens → receiver |
| **Read email** | Bond returned | Tokens → sender |
| **Reply** | Bond returned | Both earn +2 bonus 🎉 |
| **Premium** | Only option | Optional USDC lane |
| **Psychology** | "Pay to play" | "Free to use, earn from attention" |

### How $ATTN Works

```
SENDER                          ESCROW                         RECEIVER
  │                                │                               │
  │── stake ATTN ─────────────────>│                               │
  │   (cold=3, reply thread=1)     │                               │
  │                                │                               │
  │                                │     Read? ──────────────────>│
  │<── refund ATTN ────────────────│     "Your email was good!"   │
  │                                │                               │
  │                                │     Reply? ─────────────────>│
  │<── refund + 2 bonus ──────────>│<── +2 bonus ─────────────────│
  │    "Great conversation!" 🎉    │                               │
  │                                │                               │
  │                                │     Reject / 48h timeout? ──>│
  │    "You spammed them"          │── transfer ATTN ────────────>│
  │                                │   "Pain compensation" 💰     │
```

### Key Parameters

| Parameter | Value |
|-----------|-------|
| Signup grant | 50 ATTN |
| Daily drip | +10 ATTN/day |
| Cold email stake | 3 ATTN |
| Reply thread stake | 1 ATTN |
| Reply bonus | +2 each (sender + receiver) |
| Daily earn cap | 200 ATTN/day |
| Escrow window | 48 hours |
| USDC purchase rate | 1 USDC = 100 ATTN |

### ATTN Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attn/balance` | Your balance, daily earned, next drip |
| GET | `/api/attn/history` | Transaction log |
| POST | `/api/attn/buy` | Purchase ATTN with USDC (on-chain verified) |
| GET | `/api/attn/settings` | Your receive price |
| PUT | `/api/attn/settings` | Set receive price (1–10 ATTN) |
| POST | `/api/inbox/:id/reject` | Reject email → earn ATTN compensation |

---

## Why This Matters

Email is the oldest open protocol on the internet — and the most broken. Filters are heuristic. They can't measure *intent*. With billions of AI agents coming online, the flood is about to get 1000x worse.

$ATTN fixes this at the economic layer:

| The Problem | The Fix |
|-------------|---------|
| Sending is free → spam is rational | Senders **stake ATTN** to reach you |
| No cost to waste someone's time | Unread emails → **tokens go to receiver** |
| Legit senders treated like spammers | Read emails → **tokens refunded** to sender |
| No reward for engaging | Reply → **both parties earn bonus** |
| Sybil attacks on attention | **CO-QAF** discounts correlated senders |

**Spam becomes economically irrational. Good conversations are literally free.**

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│  Frontend    │────>│  Cloudflare      │────>│  D1 (SQL)  │
│  (Pages)     │     │  Worker (Hono)   │     │  R2 (MIME) │
│  React+Vite  │     │  api.basemail.ai │     │  KV (nonce)│
└─────────────┘     └──────────────────┘     └────────────┘
       │                     │                      │
  wagmi/SIWE          Hono REST API           $ATTN Economy
  Wallet Connect      ATTN endpoints          (off-chain points,
  Basename buy        Cron: drip+settle        on-chain later)
```

| Component | Stack |
|-----------|-------|
| Worker | Cloudflare Workers, Hono, viem |
| Frontend | React, Vite, Tailwind, wagmi |
| Database | Cloudflare D1 (SQLite) |
| Email Storage | Cloudflare R2 |
| Auth | SIWE (Sign-In with Ethereum) |
| Inbound Email | Cloudflare Email Routing |
| Outbound Email | Resend.com API |
| Attention | $ATTN off-chain points (v3), USDC on-chain bonds (v2 legacy) |

## Features

### Core Email
- **SIWE Authentication** — Sign-In with Ethereum, no passwords
- **Agent-friendly API** — 2 calls to register, 1 to send
- **Basename Integration** — Auto-detect, claim, or purchase Basenames on-chain
- **Internal Email** — Free, unlimited @basemail.ai ↔ @basemail.ai
- **External Email** — Via Resend.com, credit-based pricing

### Attention Economy (v3)
- **$ATTN Tokens** — Free daily drip, no USDC required to start
- **Smart Staking** — Cold emails cost more (3), reply threads cost less (1)
- **Reply Bonus** — Both parties earn +2 ATTN for genuine conversations
- **Reject Button** — Don't read spam, earn compensation instantly
- **48h Auto-Settlement** — Unread emails auto-forfeit tokens to receiver
- **USDC Purchase** — Optional: buy ATTN for priority access
- **Daily Earn Cap** — 200 ATTN/day prevents farming
- **CO-QAF Scoring** — Quadratic attention funding with Sybil resistance

### Standards & Integrations
- **ERC-8004** — Agent identity resolution standard
- **Lens Protocol** — Social graph on agent profiles
- **Pro Tier** — Gold badge, no signatures, bonus credits

## Quick Start (AI Agents)

```bash
# 1. Get SIWE message
curl -X POST https://api.basemail.ai/api/auth/start \
  -H "Content-Type: application/json" \
  -d '{"address":"YOUR_WALLET_ADDRESS"}'

# 2. Sign message + register (returns JWT + 50 ATTN grant!)
curl -X POST https://api.basemail.ai/api/auth/agent-register \
  -H "Content-Type: application/json" \
  -d '{"address":"...","signature":"0x...","message":"..."}'

# 3. Send email (auto-stakes ATTN)
curl -X POST https://api.basemail.ai/api/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"someone@basemail.ai","subject":"Hello","body":"Hi!"}'

# 4. Check your ATTN balance
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.basemail.ai/api/attn/balance
```

Full API docs: `GET https://api.basemail.ai/api/docs`

## Project Structure

```
BaseMail/
├── worker/              # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts          # Routes + API docs
│   │   ├── cron.ts           # Daily drip + escrow settlement
│   │   ├── auth.ts           # JWT + SIWE verification
│   │   ├── email-handler.ts  # Inbound email processing
│   │   └── routes/
│   │       ├── attn.ts       # $ATTN token endpoints (v3)
│   │       ├── attention.ts  # USDC attention bonds (v2 legacy)
│   │       ├── auth.ts       # /api/auth/*
│   │       ├── send.ts       # /api/send (with ATTN auto-stake)
│   │       ├── inbox.ts      # /api/inbox/* (with ATTN refund/reject)
│   │       └── ...
│   └── wrangler.toml
├── web/                 # Frontend (Cloudflare Pages)
│   └── src/pages/
│       ├── Landing.tsx       # Landing page
│       └── Dashboard.tsx     # Email client + $ATTN dashboard
├── contracts/           # Smart contracts (v2 legacy)
│   └── AttentionBondEscrow.sol
└── ATTN-V3-IMPLEMENTATION.md  # Full implementation details
```

## Development

```bash
# Install (npm workspace — must run from root)
npm install

# Run worker locally
cd worker && npx wrangler dev

# Run frontend locally
cd web && npx vite dev

# Deploy (via CI/CD: push to main → auto deploy)
git push origin main
```

## Related Work

- [Quadratic Funding](https://wtfisqf.com/) — Buterin, Hitzig, Weyl (2019)
- [Connection-Oriented QAF](https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/) — Ko, Tang, Weyl (2026)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) — Agent Identity Standard

## License

MIT
