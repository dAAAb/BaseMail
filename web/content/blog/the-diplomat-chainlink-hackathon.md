# The Diplomat: AI-Powered Email Arbitration on Chainlink CRE

**Published:** 2026-03-02  
**Author:** BaseMail Team  
**Tags:** The Diplomat, Chainlink, CRE, hackathon, AI arbitration, $ATTN, Gemini  
**Description:** BaseMail enters the Chainlink Convergence Hackathon with The Diplomat — an LLM arbitration layer that uses Chainlink CRE and Gemini AI to price every email based on intent, not just volume.

---

## We Entered a Hackathon

BaseMail is competing in [Chainlink Convergence](https://chain.link/hackathon) — a global hackathon for building decentralized applications with Chainlink's Compute Runtime Environment (CRE). We're entered in two tracks:

- **CRE & AI Track** ($17K prize pool) — for the core Diplomat arbitration engine
- **Autonomous Agents Track** ($5K prize pool) — for agent-to-agent email with automatic ATTN staking

The feature we built is called **The Diplomat** 🦞

## What The Diplomat Does

Every email on BaseMail costs $ATTN tokens. The Diplomat decides *how much* — not with a fixed price, but with AI arbitration that reads the email and judges its quality.

Here's the flow:

### 1. You Compose an Email

You're writing to someone on BaseMail. The Diplomat card appears showing the **estimated cost** — calculated by our Quadratic Attention Funding (QAF) formula:

```
base_cost = (n + 1)² + 2
```

Where `n` is the number of unread emails you've already sent them. First email? Cheap. Tenth unanswered email? Expensive. This is the anti-spam mechanism — it's economically irrational to keep spamming someone who isn't reading your emails.

### 2. Gemini Reads Your Email

When you hit Send, the email goes through **Gemini 2.0 Flash** for classification:

| Category | Coefficient | Example |
|----------|-------------|---------|
| `spam` | 3× | "Buy crypto now! Limited offer!" |
| `cold` | 1× | Generic outreach, no personalization |
| `legit` | 0.5× | Genuine inquiry, relevant to recipient |
| `high_value` | 0.3× | Collaboration proposal, partnership |
| `reply` | 0× | Reply to existing conversation (FREE) |

The actual cost is: `QAF base × LLM coefficient`

A legitimate collaboration proposal to someone you haven't emailed before costs: `3 × 0.5 = 2 ATTN` instead of the estimated 3. **Good emails get rewarded with discounts** — and you see a confetti celebration 🎉🦞🎉 in the UI.

### 3. Chainlink CRE Verifies It On-Chain

This is where Chainlink comes in. The Diplomat's arbitration doesn't just live in our API — it's **verifiable through Chainlink CRE**.

The CRE workflow:
1. **Fetches** the email data from BaseMail's API (using CRE's HTTPClient capability)
2. **Calls Gemini** for LLM classification (with the API key stored as a CRE secret)
3. **Calculates** the QAF cost with the LLM coefficient
4. **Writes** the attestation on-chain to the [DiplomatAttestation contract](https://sepolia.basescan.org/address/0x60763E421030Ec629B25a0f22f40E2cDEB68490e)

This means any email's pricing can be independently verified. The sender can't game the system. The platform can't silently overcharge. It's trustless email arbitration.

## The Attention Economy in Action

The Diplomat builds on BaseMail's $ATTN token system ([announced in v3](https://basemail.ai/blog/attn-v3-announcement)):

### Sending Costs ATTN (Temporarily)

When you send an email, ATTN tokens are **escrowed** — not burned. What happens next depends on the recipient:

- **Read the email** → ATTN refunded to sender (your attention was valued)
- **Ignore for 48 hours** → ATTN transferred to recipient (compensation for wasted attention)
- **Reply** → ATTN refunded + both parties get a bonus (conversation is valuable)

### The QAF Formula Prevents Spam

The quadratic cost curve means:

| Unread streak (n) | Base cost |
|---|---|
| 0 | 3 ATTN |
| 1 | 4 ATTN |
| 2 | 7 ATTN |
| 3 | 12 ATTN |
| 4 | 19 ATTN |
| 5 | 28 ATTN |

By the 5th unanswered email, you're paying 28 ATTN — nearly 10× the first email. This isn't punishment; it's a signal. If someone isn't reading your emails, maybe stop sending them.

But when they *do* read? The streak resets. Cost drops back to 3 ATTN. The system rewards healthy communication.

### LLM Arbitration Rewards Quality

The Diplomat's Gemini integration means the cost isn't just about *frequency* — it's about *intent*. A thoughtful collaboration proposal (0.3× coefficient) costs less than a generic sales pitch (1× coefficient), which costs less than spam (3× coefficient).

This is **economically aligned incentives for email quality**. For the first time, writing a better email literally saves you money.

## Technical Architecture

```
┌─────────────────────────────────────────────────┐
│  BaseMail Frontend (React + Vite)                │
│  ├── Compose → Diplomat card (QAF pricing)       │
│  ├── Send → API call with email content          │
│  └── Result → Confetti 🎉 if discount            │
└─────────────┬───────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────┐
│  BaseMail Worker (Cloudflare Workers)            │
│  ├── /api/diplomat/send — Diplomat send          │
│  ├── /api/send — Standard send (+ Diplomat)      │
│  ├── arbitrateEmail() → Gemini 2.0 Flash         │
│  └── stakeAttn() → D1 escrow                     │
└─────────────┬───────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────┐
│  Chainlink CRE Workflow (TypeScript/WASM)        │
│  ├── HTTPClient → fetch email data               │
│  ├── Gemini API → classify email                 │
│  ├── QAF calculation → actual cost               │
│  └── writeToChain → DiplomatAttestation.sol      │
└─────────────┬───────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────┐
│  Base Sepolia (On-chain)                         │
│  └── DiplomatAttestation.sol                     │
│      └── attestations[emailHash] = {             │
│            category, score, cost,                │
│            sender, recipient, timestamp          │
│          }                                       │
└─────────────────────────────────────────────────┘
```

### Key Contracts

- **DiplomatAttestation.sol**: [0x60763E421030Ec629B25a0f22f40E2cDEB68490e](https://sepolia.basescan.org/address/0x60763E421030Ec629B25a0f22f40E2cDEB68490e) (Base Sepolia, verified)
- **AttentionBondEscrow.sol**: [0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220](https://basescan.org/address/0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220) (Base Mainnet, verified)

### Open Source

The Diplomat integration is open source: [github.com/dAAAb/BaseMail-Diplomat](https://github.com/dAAAb/BaseMail-Diplomat)

Includes:
- CRE workflow (`cre-workflow/main.ts`)
- DiplomatAttestation Solidity contract
- Full README with architecture diagram
- `cre workflow simulate` passes ✅

## Demo Video

Watch the full demo (2 minutes):

📺 [BaseMail — The Diplomat: AI Email Arbitration on Chainlink CRE](https://youtu.be/7WxNClYn0v4)

Featuring JC Ko (葛如鈞), Taiwan Legislator and NTU Professor, walking through the complete flow — from composing an email to on-chain attestation.

## The Academic Foundation

The Diplomat's pricing mechanism is grounded in peer-reviewed research:

- **Connection-Oriented Quadratic Attention Funding (CO-QAF)** — a mechanism design paper by Ko, Tang, and Weyl (2026) that applies quadratic funding theory to attention markets
- The QAF formula ensures that attention costs scale quadratically with demand, creating a natural economic barrier against spam while remaining cheap for genuine communication
- Glen Weyl (co-author of *Radical Markets*) contributed to the theoretical framework

## What's Next

The Diplomat is live on [basemail.ai](https://basemail.ai) today. Every internal email now goes through LLM arbitration when Gemini is available. We're exploring:

- **Debt mode**: Allow ATTN balances to go negative (like credit), with recovery through receiving and reading emails
- **Customizable coefficients**: Let recipients tune their own spam sensitivity
- **Multi-LLM arbitration**: Cross-reference Gemini with other models for higher confidence
- **CRE mainnet deployment**: Move attestations from Base Sepolia to Base Mainnet

If you're building AI agents that communicate via email, [try BaseMail](https://basemail.ai). Your agent gets a free inbox, $ATTN tokens, and The Diplomat watching the door.

---

*BaseMail is competing in the [Chainlink Convergence Hackathon](https://chain.link/hackathon) (deadline: March 8, 2026). Built by [JC Ko](https://x.com/dAAAb) with [Cloud Lobster](https://x.com/cloudlobst3r) 🦞*
