# BaseMail v3 — $ATTN Token Economy

> Status: **DRAFT** — Pending 寶博 final approval
> Date: 2026-02-24
> Contributors: 寶博 (@dAAAb), Tom Lam (feedback), 雲龍蝦 (planning)

---

## 1. Problem Statement

BaseMail v2 (Attention Bonds) requires senders to stake **USDC** to send email. Tom Lam's feedback:

- "付錢才能寄信" is the biggest turn-off — nobody wants to use it
- The system punishes (forfeit bond) instead of rewarding (earn from attention)
- Attention should be treated as a **commodity**, not a punishment mechanism

**Core insight**: Flip from negative (lose money for spam) → positive (earn tokens for giving attention).

---

## 2. Design Philosophy

> "All positive feedback, no punishment." — Tom Lam

- **Free to use** — everyone gets tokens via drip, no payment required
- **Attention = commodity** — reading email is valuable, readers get compensated
- **Spam self-regulates** — spammers burn tokens, victims earn tokens
- **Optional premium** — pay real money only if you want more attention
- **Compatible with QAF** — quadratic funding math layers on top

---

## 3. $ATTN Token

### 3.1 Naming

| Layer | Name |
|-------|------|
| Brand | **Æ** (Agentic Email aesthetic) |
| Ticker | **$ATTN** |
| Full name | Attention Token |

### 3.2 Token Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Initial grant | 50 ATTN | Enough to send 50 emails on signup |
| Daily drip | 10 ATTN | Casual user can send ~10 emails/day free |
| Balance cap | 200 ATTN | Discourage hoarding, encourage circulation |
| Default stake per email | 1 ATTN | Receiver can customize (1–10) |
| Escrow window | 48 hours | Time for receiver to read before settlement |

### 3.3 Flow

```
SENDER                          ESCROW                         RECEIVER
  |                                |                               |
  |--- stake N ATTN ------------->|                               |
  |    (send email)               |                               |
  |                                |                               |
  |                                |<---- opens email ------------|
  |                                |      (mark as read)          |
  |<-- refund N ATTN -------------|                               |
  |    ("your email was good!")   |                               |
  |                                |                               |
  |         --- OR after 48h timeout ---                          |
  |                                |                               |
  |                                |---- transfer N ATTN -------->|
  |    (you spammed them)         |      ("pain compensation")   |
```

### 3.4 "Read" Definition

| Signal | Trigger | Effect |
|--------|---------|--------|
| **Opened** | `GET /api/email/:id` (authenticated) | Refund sender's ATTN |
| **Engaged** | Reply to that email | Higher QAF weight (future) |

Why "opened" not "time spent":
- AI Agents read instantly — no dwell time concept
- API call = explicit intent = verifiable
- Anti-abuse: only counts within escrow window + rate limited

---

## 4. Dual-Track Inbox (ATTN + USDC Premium)

```
Inbox sort order:
  🔷 1. USDC bonded emails     (real money = highest sincerity)
  🟡 2. High ATTN stake        (>5 ATTN = sender really cares)
  ⚪ 3. Normal ATTN emails     (everyday communication)
```

- v2 USDC Attention Bonds remain as **premium lane**
- x402 micro-payments compatible (USDC bond = x402 payment)
- Free tier (ATTN only) removes the entry barrier Tom identified

---

## 5. Chain & Gas Strategy

**Decision: Stay on Base, add Paymaster for gasless UX.**

| Option | Gas cost | Why not |
|--------|----------|---------|
| Monad | ~0 | Too early, low brand recognition |
| Solana | ~0.0001 | Different ecosystem, no Basename |
| **Base + Paymaster** | **0 for user** | ✅ No migration, Coinbase ecosystem, gasless via ERC-4337 |

- Base L2 gas: ~$0.001/tx — we absorb via Paymaster/relayer
- 100K tx/month ≈ $100 gas cost (manageable)
- Coinbase Smart Wallet natively supports Paymaster
- Users never see gas — Web2-level UX

---

## 6. Phased Rollout

### Phase v3.0 — Off-chain Points (MVP)

> Timeline: ~3 days implementation

- ATTN as **database points** (not on-chain)
- Zero regulatory risk — just product credits
- Validate Tom's model: does positive-feedback work?
- API changes only (no smart contract)

**Implementation:**
- DB: `attn_balance`, `attn_transactions`, `attn_escrow` tables
- API: `GET /api/attn/balance`, stake on send, refund on read, settle on timeout
- Cron: daily drip + escrow settlement
- Frontend: balance widget, inbox ATTN indicators

### Phase v3.1 — Soulbound ERC-20

> Timeline: after v3.0 validates (~2-4 weeks)

- Deploy $ATTN as **non-transferable ERC-20** on Base
- `transfer()` restricted — can only mint/burn via BaseMail contract
- On-chain transparency without trading risk
- Still zero Howey risk (can't sell what you can't transfer)

### Phase v3.2 — Transferable Token + Claim

> Timeline: when ready (regulatory clarity, user demand)

- Deploy **$ATTN v2** as standard transferable ERC-20
- Soulbound holders claim 1:1 (burn soulbound → mint transferable)
- Claim conditions possible (e.g., must have sent/received N emails)
- Optional DEX liquidity (community-driven, team never sells)

---

## 7. Howey Test Analysis

| Element | $ATTN Design | Risk |
|---------|-------------|------|
| ① Investment of money | Free drip — most users pay nothing | 🟢 Low |
| ② Common enterprise | BaseMail platform | ⚠️ Exists |
| ③ Expectation of profit | Token is consumed (postage), not invested | 🟢 Low |
| ④ From others' efforts | Value = "can send email", not team pumping price | 🟢 Low |

**Risk by phase:**

| Phase | Howey Risk | Rationale |
|-------|-----------|-----------|
| v3.0 Off-chain points | 🟢 Zero | Not a token — product credits |
| v3.1 Soulbound ERC-20 | 🟢 Minimal | Non-transferable, pure utility |
| v3.2 Transferable, no DEX | 🟡 Low | P2P transfer possible but no market |
| v3.2 + DEX listing | 🟠 Medium | Public price exists — need careful framing |

**Safety principles (all phases):**
1. Team never sells tokens
2. Drip is algorithmic, not discretionary
3. Tokens are consumable (stake/burn), not appreciating assets
4. Official messaging: "postage stamps", never "investment"
5. Optional purchase = buying email credits (like SendGrid)

---

## 8. Upgrade Path: Soulbound → Transferable

```
Phase 1: $ATTN (soulbound)
         └─ ERC-20 with transfer() disabled
         └─ mint/burn only via BaseMail escrow contract

Phase 2: $ATTN-v2 (transferable)
         └─ Standard ERC-20
         └─ Claim contract: burn soulbound → mint v2 (1:1)
         └─ Optional claim conditions:
            - Must have active BaseMail account
            - Must have sent or received ≥10 emails
            - Snapshot date (exclude last-minute farmers)
```

Clean separation — no proxy upgrade needed, no user confusion.

Industry precedent: $OP (Optimism), $ARB (Arbitrum), $UNI (Uniswap) all used claim-based distribution.

---

## 9. QAF Integration (Future)

$ATTN stake amounts feed into CO-QAF formula:

- Multiple senders staking ATTN to same receiver → quadratic matching
- Diverse senders (low Jaccard overlap) → higher QAF score
- USDC premium bonds get additional QAF weight
- Paper: CO-QAF (Ko, Tang, Weyl — EAAMO '25)

---

## 10. API Changes Summary

### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attn/balance` | Current ATTN balance |
| GET | `/api/attn/history` | Transaction history |
| POST | `/api/attn/buy` | Purchase ATTN with USDC (optional) |
| GET | `/api/attn/settings` | Get receive price (stake required) |
| PUT | `/api/attn/settings` | Set receive price |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/send` | Auto-stake ATTN from sender balance |
| `GET /api/email/:id` | Trigger ATTN refund on first read |
| `GET /api/inbox` | Include ATTN stake info per email |

### Background Jobs

| Job | Schedule | Action |
|-----|----------|--------|
| Daily drip | Every 24h | +10 ATTN to all accounts (up to cap) |
| Escrow settlement | Every 1h | Timeout emails → transfer ATTN to receiver |

---

## 11. Database Schema (v3.0 Off-chain)

```sql
-- ATTN balance per account
CREATE TABLE attn_balances (
  wallet TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 50,
  last_drip_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Transaction log
CREATE TABLE attn_transactions (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  amount INTEGER NOT NULL,        -- positive = credit, negative = debit
  type TEXT NOT NULL,              -- 'drip', 'stake', 'refund', 'transfer', 'purchase'
  ref_email_id TEXT,              -- linked email if applicable
  created_at INTEGER NOT NULL
);

-- Escrow for pending emails
CREATE TABLE attn_escrow (
  email_id TEXT PRIMARY KEY,
  sender_wallet TEXT NOT NULL,
  receiver_wallet TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'refunded', 'transferred'
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,    -- created_at + 48h
  settled_at INTEGER
);
```

---

## 12. Open Questions

- [ ] Exact drip rate tuning (10/day? 5/day? Adjust after v3.0 data?)
- [ ] Should "mark all as read" trigger mass refunds? (Probably: rate limit + only escrow-active emails)
- [ ] ATTN purchase price? (Fixed rate like $0.01/ATTN? Or market-driven later?)
- [ ] Tom Lam collaboration? (Credit in paper? Advisory role?)
- [ ] Branding: landing page update for v3 messaging

---

## 13. Summary

| | v2 (Current) | v3 (Proposed) |
|--|--------------|---------------|
| Send cost | USDC (real money) | ATTN (free tokens) |
| Unread result | Sender loses bond | Tokens → receiver |
| Read result | Bond returned | Tokens → sender |
| Entry barrier | High (need USDC) | Zero (free drip) |
| Premium option | Only option | Optional USDC lane |
| Psychology | "Pay to play" | "Free to use, earn from attention" |
| Regulatory | USDC = clearer | Off-chain first, safe |

> $ATTN is postage, not equity. You buy stamps to send mail, not to invest.
