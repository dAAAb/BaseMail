# Send USDC to Anyone — Even Without a Wallet

**Published:** 2026-03-02  
**Author:** BaseMail Team  
**Tags:** USDC, escrow, payments, external email, claim link  
**Description:** BaseMail now lets you send USDC to any email address — Gmail, Outlook, anything. The recipient gets a claim link and doesn't need a crypto wallet to get started.

---

## The Problem: Crypto Can't Email Money

You want to send $10 USDC to a friend. They're on Gmail. They've never touched a wallet.

In traditional crypto, this is a dead end. You need their wallet address. They need to set up MetaMask, write down a seed phrase, understand gas fees — all before they can receive ten dollars.

Email fixed this problem for information decades ago. Anyone can email anyone. No setup on the recipient's side. Why can't we do the same for money?

## The Solution: USDC Escrow + Claim Links

BaseMail now supports **escrowed USDC payments to any email address** — Gmail, Outlook, corporate emails, whatever. Here's how it works:

### For the Sender

1. Open the **Send USDC** modal in your BaseMail dashboard
2. Enter any email address (e.g., `student@university.edu`)
3. Choose the amount and claim expiry (1 hour to 30 days)
4. Two wallet confirmations: **Approve** USDC spending → **Deposit** to escrow
5. Done. The recipient gets an email with a claim link.

The USDC sits in an [auditable on-chain escrow contract](https://basescan.org/address/0xaf41b976978ac981d79c1008dd71681355c71bf6) — not in BaseMail's bank account. Nobody can touch it except the claim flow.

### For the Recipient

1. Open the claim link from the email
2. Connect any wallet (or create one — takes 30 seconds)
3. Click **Claim** — one signature, zero gas fees
4. USDC arrives in your wallet. A BaseMail account is auto-created.

That's it. No seed phrases. No gas. No prior crypto experience required.

## Why Escrow Matters

### Trust Without Intermediaries

The [PaymentEscrow smart contract](https://basescan.org/address/0xaf41b976978ac981d79c1008dd71681355c71bf6) is verified and immutable. When you deposit USDC:

- Only the **authenticated claimer** can receive it (via BaseMail's worker)
- Only the **original sender** can refund it (after expiry)
- **Nobody else** can touch the funds — not BaseMail, not us, nobody

### Automatic Onboarding

The claim flow doubles as onboarding. When someone claims USDC for the first time, BaseMail automatically creates an account linked to their wallet. They go from "no crypto" to "has a wallet + an AI-ready email address" in one click.

This is how you bring the next billion users onchain — not by asking them to install MetaMask, but by sending them money they actually want to claim.

### Refund Safety

Set a claim window — 1 hour, 24 hours, 7 days, or 30 days. If the recipient doesn't claim in time, you can refund the full amount back to your wallet. No funds lost, no intermediary involved.

## How It Works Under the Hood

```
Sender                    PaymentEscrow (Base)           Recipient
  │                              │                           │
  │── approve(USDC, amount) ────>│                           │
  │── deposit(claimId, amount) ─>│                           │
  │                              │── USDC locked ──┐         │
  │                              │                 │         │
  │── POST /api/send ──> Worker ─│── email with ───│────────>│
  │   (escrow_claim)             │   claim link    │         │
  │                              │                 │         │
  │                              │<── POST /claim ─│─────────│
  │                              │── release() ────│────────>│
  │                              │   USDC sent     │         │
```

The smart contract guarantees atomicity. The worker just facilitates the claim by calling `release()` after verifying the claimer's identity.

## Use Cases

### 💸 Pay Anyone via Email
Send USDC to your freelancer's Gmail. They don't need Coinbase.

### 🎓 Student Bounties
Professor sends USDC to students for completing assignments. Claim link in the email. Instant micropayment without bank infrastructure.

### 🤖 Agent-to-Human Payments
Your AI agent earned revenue and needs to pay a human contractor. Send USDC to their regular email — they claim when ready.

### 🌍 Cross-Border Payments
Send dollars to anyone with an email address. No SWIFT. No 3-day settlement. No 5% foreign exchange fee.

## Try It Now

1. Log in to [basemail.ai](https://basemail.ai)
2. Click **✉ Send USDC** in the sidebar
3. Enter any email address
4. The modal automatically switches to **📦 Escrow Mode**
5. Choose amount + expiry → Send

The recipient gets an email. They click. They claim. That's the future of payments.

---

*Technical details: PaymentEscrow contract at [0xaf41...bf6](https://basescan.org/address/0xaf41b976978ac981d79c1008dd71681355c71bf6) on Base Mainnet. Minimum deposit: 0.10 USDC. Gas paid by sender on deposit; zero gas for claimer (worker pays release gas).*
