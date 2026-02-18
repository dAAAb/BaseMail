# BaseMail v2: Attention Bond Implementation Plan

## Overview
Add the Attention Bond layer to BaseMail: "from agents have email → email has a price."

## Architecture

### 1. Smart Contract: `AttentionBondEscrow.sol`
- USDC escrow for attention bonds (Base Mainnet)
- Sender deposits bond → 7-day window → recipient replies (refund) or ignores (forfeit)
- Whitelist: exempted senders (zero bond)
- Protocol fee τ = 10%

### 2. DB Schema Changes
- `attention_config` table: per-account attention price settings
- `attention_bonds` table: bond escrow tracking
- `whitelist` table: sender whitelist per account
- `reputation` table: sender reputation scores (reply rates)
- `qaf_scores` table: per-account QAF attention value cache

### 3. API Changes

#### New Endpoints
- `GET /api/attention/:handle` — Get attention price for a recipient
- `PUT /api/attention/config` — Set your attention price (p₀, α, β, γ)
- `GET /api/attention/qaf/:handle` — Get QAF score for a recipient
- `POST /api/attention/bond` — Submit bond tx_hash when sending
- `POST /api/attention/reply/:email_id` — Mark reply → trigger refund
- `GET /api/attention/whitelist` — List whitelist
- `POST /api/attention/whitelist` — Add to whitelist
- `DELETE /api/attention/whitelist/:address` — Remove from whitelist
- `GET /api/attention/stats` — Dashboard: bonds received/refunded/forfeited, QAF score

#### Modified Endpoints
- `POST /api/send` — Add optional `attention_bond: { tx_hash, amount }` field
- `GET /api/inbox` — Include bond status per email (bonded/refunded/forfeited)

### 4. Smart Contract Design

```solidity
AttentionBondEscrow {
  // Core
  deposit(recipient, emailId, amount) → escrow USDC
  reply(emailId) → refund (1-τ) to sender, τ to protocol
  forfeit(emailId) → after 7 days, transfer to recipient
  
  // Config
  setAttentionPrice(basePrice) → set p₀
  setWhitelist(sender, status) → exempt/unexempt
  
  // View
  getBond(emailId) → bond details
  getAttentionPrice(recipient) → current price
}
```

### 5. QAF Calculation (off-chain, worker)
- On each bond deposit, recalculate recipient's QAF: AV = (Σ√bᵢ)²
- Store in `qaf_scores` table
- CO-QAF: when sender graph data available, apply α_ij discount

### 6. Dynamic Pricing (worker)
- p(t,s) = p₀ · (1 + α·D(t))^β · (1 - γ·R̄ₛ(t))
- D(t): message count in rolling 7-day window
- R̄ₛ(t): sender's historical reply rate with this recipient

## Implementation Order
1. ✅ Smart contract (`AttentionBondEscrow.sol`)
2. ✅ DB schema migration
3. ✅ Attention config & whitelist APIs
4. ✅ Bond deposit verification in send flow
5. ✅ Reply/forfeit flow
6. ✅ QAF calculation
7. ✅ Dynamic pricing
8. ✅ Stats dashboard API
