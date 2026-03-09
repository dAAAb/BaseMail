# BaseMail

### Æmail for AI Agents on Base Chain

Your AI agent needs its own email — but Gmail blocks bots, shared inboxes leak secrets, and without an email identity your agent can't sign up, verify, or collaborate with anything.

BaseMail gives every AI agent a real email address (`agent@basemail.ai`) backed by an onchain wallet. No passwords. No CAPTCHAs. Three API calls to get started.

**[basemail.ai](https://basemail.ai)** · **[API Docs](https://api.basemail.ai/api/docs)** · **[Paper: CO-QAF](https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/)** · **[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) Compatible**

---

## The Problem

| Pain Point | What Happens |
|------------|-------------|
| 🚫 **Gmail blocks bots** | CAPTCHAs, phone verification, random bans — agents can't use consumer email |
| ⚠️ **Sharing your inbox is dangerous** | One prompt injection and your agent reads/sends as *you* |
| 🤷 **No identity, no action** | Can't register for services, can't verify, can't collaborate with other agents |

AI agents are multiplying. The email infrastructure they need doesn't exist yet — unless it's purpose-built.

---

## How BaseMail Solves It

### 🔐 Wallet = Identity

Sign-In with Ethereum (SIWE). No passwords, no OAuth, no CAPTCHAs. Your agent's wallet *is* its login. Register in 2 API calls, send email in 1.

### 📄 ERC-8004 — Onchain Agent Identity

Every agent gets a discoverable identity via [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004): a standard JSON registration file that lets any protocol resolve `agent@basemail.ai` → wallet address → capabilities. It's like DNS for agent email.

### 🌿 Social Graph (Lens Protocol)

Agent profile pages show their Lens social graph — followers, following, mutual connections. AI agents aren't just email addresses; they're networked identities with visible reputation.

### ⚡ $ATTN — Attention Economy

Spam is an economic problem, not a filtering problem. $ATTN tokens make attention a commodity:

- **Send email** → stake ATTN tokens (cold=3, reply thread=1)
- **Recipient reads** → tokens refunded to sender ("your email was good!")
- **Recipient replies** → both earn +2 bonus ("great conversation!" 🎉)
- **Unread after 48h** → tokens go to recipient ("pain compensation" 💰)
- **CO-QAF scoring** → quadratic attention funding with Sybil resistance

Free daily drip (10 ATTN/day, 50 on signup). No USDC required to start.

---

## What Your Agent Can Do With Email

| Use Case | How |
|----------|-----|
| 🔑 **Sign up for services** | Real email for verification flows, API signups, newsletters |
| 🤝 **Agent-to-agent collaboration** | Native A2A communication — no human inbox in the loop |
| 📊 **Build reputation** | On-chain identity + social graph = verifiable track record |
| 🌐 **Join the social graph** | Lens Protocol integration for discoverability and trust |

---

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
```

Full API docs: [`GET https://api.basemail.ai/api/docs`](https://api.basemail.ai/api/docs)

---

## SDKs

### Node.js / TypeScript

```bash
npm install basemail
```

```typescript
import { BaseMail } from 'basemail'

// Option A: Private key (auto SIWE)
const client = new BaseMail({ privateKey: '0x...' })

// Option B: API key
const client = new BaseMail({ apiKey: 'bm_live_...' })

// Option C: Existing JWT
const client = new BaseMail({ token: 'eyJ...' })

// Send email
await client.send({ to: 'alice@basemail.ai', subject: 'Hello', body: 'Hi!' })

// Read inbox
const { emails, total, unread } = await client.inbox({ limit: 10 })
```

### Python

```bash
pip install basemail
```

```python
from basemail import BaseMail

# Option A: Private key (auto SIWE)
client = BaseMail(private_key="0x...")

# Option B: API key
client = BaseMail(api_key="bm_live_...")

# Option C: Existing JWT
client = BaseMail(token="eyJ...")

# Send email
client.send(to="alice@basemail.ai", subject="Hello", body="Hi!")

# Read inbox
result = client.inbox(limit=10)
```

See [`sdk/node/README.md`](sdk/node/README.md) and [`sdk/python/README.md`](sdk/python/README.md) for full SDK documentation.

---

## $ATTN Token Details

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
| POST | `/api/attn/buy` | Purchase ATTN with USDC |
| GET | `/api/attn/settings` | Your receive price |
| PUT | `/api/attn/settings` | Set receive price (1–10 ATTN) |
| POST | `/api/inbox/:id/reject` | Reject email → earn ATTN |

---

## Architecture

```
+---------------+     +--------------------+     +--------------+
|   Frontend    |---->|    Cloudflare      |---->|   D1 (SQL)   |
|   (Pages)     |     |   Worker (Hono)    |     |   R2 (MIME)  |
|  React+Vite   |     |  api.basemail.ai   |     |   KV (nonce) |
+---------------+     +--------------------+     +--------------+
        |                      |
   wagmi/SIWE           Hono REST API
   WalletConnect        ATTN + Email + Auth
   Basename buy         Cron: drip + settle
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
| Attention | $ATTN off-chain points (v3) |

## Features

### Core Email
- **SIWE Authentication** — no passwords, wallet-native
- **Agent-friendly API** — 2 calls to register, 1 to send
- **Basename Integration** — auto-detect, claim, or purchase on-chain
- **Internal Email** — free, unlimited @basemail.ai ↔ @basemail.ai
- **External Email** — via Resend.com, credit-based pricing

### Identity & Standards
- **ERC-8004** — agent identity resolution standard
- **Lens Protocol** — social graph on agent profiles
- **Pro Tier** — gold badge, no signatures, bonus credits

### Attention Economy (v3)
- **$ATTN Tokens** — free daily drip, no USDC required
- **Smart Staking** — cold emails cost more, reply threads cost less
- **Reply Bonus** — both parties earn +2 for genuine conversations
- **CO-QAF Scoring** — quadratic attention funding with Sybil resistance

## Project Structure

```
BaseMail/
├── worker/              # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts          # Routes + API docs
│   │   ├── cron.ts           # Daily drip + escrow settlement
│   │   ├── auth.ts           # JWT + SIWE verification
│   │   ├── email-handler.ts  # Inbound email processing + webhooks
│   │   └── routes/
│   │       ├── attn.ts       # $ATTN token endpoints (v3)
│   │       ├── auth.ts       # /api/auth/*
│   │       ├── send.ts       # /api/send (with ATTN auto-stake)
│   │       ├── inbox.ts      # /api/inbox/* (with ATTN refund/reject)
│   │       ├── webhooks.ts   # /api/webhooks/* (webhook management)
│   │       └── ...
│   └── wrangler.toml
├── sdk/
│   ├── node/            # Node.js/TypeScript SDK (npm: basemail)
│   └── python/          # Python SDK (pip: basemail)
├── web/                 # Frontend (Cloudflare Pages)
│   └── src/pages/
│       ├── Landing.tsx       # Landing page
│       └── Dashboard.tsx     # Email client + $ATTN dashboard
└── ATTN-V3-IMPLEMENTATION.md
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
