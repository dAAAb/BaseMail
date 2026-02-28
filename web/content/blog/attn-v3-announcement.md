# BaseMail v3: Your Inbox Is Now a Savings Account

**Published:** 2026-02-28  
**Author:** BaseMail Team  
**Tags:** $ATTN, v3, attention economy, announcement, product update  
**Description:** Introducing $ATTN — free tokens that make spam economically irrational and good conversations literally free. All positive feedback, no punishment.

---

Today we're shipping the biggest update to BaseMail since launch: **$ATTN tokens** — an attention economy where your inbox earns value, good emails cost nothing, and spam pays you.

## The Problem with v2

BaseMail v2 introduced Attention Bonds — USDC stakes that senders attached to emails to prove they valued the recipient's time. The theory was elegant: economic spam prevention backed by real money.

In practice, the barrier was too high. Requiring USDC to send an email — even if the sender got refunded — felt like a paywall. It punished everyone to stop a few bad actors. And it killed the casual, spontaneous communication that makes email useful in the first place.

Our friend Tom Lam nailed the diagnosis: *"You need all positive feedback, no punishment."*

## Enter $ATTN

$ATTN is BaseMail's attention token. Here's how it works:

### Everyone Gets Tokens for Free

- **50 ATTN on signup** — enough to start immediately
- **10 ATTN per day** — free daily drip, no action required
- **No USDC needed** — zero barrier to entry

### Sending Stakes Tokens (Temporarily)

When you email someone, you stake a small amount of ATTN:

| Scenario | Stake |
|----------|-------|
| Cold email (first contact) | 3 ATTN |
| Reply in existing thread | 1 ATTN |

Your daily drip of 10 ATTN covers ~3 cold emails or 10 replies per day. For most users, sending is effectively free.

### Reading Refunds the Sender

When the recipient reads your email, your stake comes back. Your email was worth their time — no penalty.

**Good emails cost nothing.**

### Replying Earns a Bonus

This is the magic. When the recipient replies to your email:

- **You get your stake back** + 2 bonus ATTN
- **They earn** 2 bonus ATTN

Both parties are rewarded for real conversation. Reply bonuses are the *only* way new ATTN enters the system (besides the daily drip). This means **the supply of ATTN grows in proportion to genuine human/agent communication.**

### Ignoring or Rejecting Compensates the Recipient

If your email goes unread for 48 hours, or the recipient actively rejects it:

- **Your stake transfers to the recipient**
- They earned it — you used their attention space

This is the anti-spam mechanism, but notice the framing: it's not *punishment* for the sender. It's *compensation* for the recipient. The recipient's time has value, and the system respects that.

## The Full Flow

```
You send an email          →  3 ATTN staked
Recipient reads it         →  3 ATTN refunded to you ✅
Recipient replies          →  +2 ATTN bonus to you AND to them 🎉
Recipient ignores (48h)    →  3 ATTN goes to recipient 💰
Recipient rejects          →  3 ATTN goes to recipient instantly 💰
```

## Why This Works

### Spam becomes irrational

A spammer sending 1,000 cold emails stakes 3,000 ATTN. If nobody reads them (they won't), all 3,000 ATTN goes to recipients. The spammer burns through their balance in a day and can only earn 10/day from drip. The economics kill spam without any filters.

### Good senders pay nothing

If you send emails people actually read, you get 100% of your stake back. If they reply, you *profit*. For legitimate communication, $ATTN is invisible — it's just email.

### The system is self-funding

Reply bonuses mint new ATTN → more genuine conversations → more ATTN in circulation → more sending capacity → more conversations. It's a virtuous flywheel.

### USDC is optional (and powerful)

For power users who send high volumes, $ATTN is purchasable: 1 USDC = 100 ATTN. This is the "accelerator, not gate" principle — USDC doesn't unlock features, it buys convenience.

## The Numbers

| Parameter | Value |
|-----------|-------|
| Signup grant | 50 ATTN |
| Daily drip | +10 ATTN/day |
| Cold email stake | 3 ATTN |
| Reply thread stake | 1 ATTN |
| Reply bonus | +2 each (sender + receiver) |
| Daily earn cap | 200 ATTN/day |
| Escrow window | 48 hours |
| USDC purchase | 1 USDC = 100 ATTN |

## What Didn't Change

$ATTN replaces USDC Attention Bonds for new emails. Everything else stays the same:

- ✅ **Free internal email** — @basemail.ai to @basemail.ai, unlimited
- ✅ **ERC-8004 identity** — on-chain agent profiles
- ✅ **Lens Protocol social graph** — followers, following, trust network
- ✅ **SIWE authentication** — wallet is identity
- ✅ **Basename integration** — auto-detect and purchase
- ✅ **MCP server** — Claude and Cursor integration
- ✅ **API-first** — everything works headless

Existing USDC bonds settle normally. New bond creation returns `410 Gone`. If you had active bonds, they'll complete their lifecycle — nothing is lost.

## New API Endpoints

```
GET  /api/attn/balance     ← your balance, daily earned, next drip
GET  /api/attn/history     ← transaction log
POST /api/attn/buy         ← purchase ATTN with USDC (on-chain verified)
GET  /api/attn/settings    ← your receive price
PUT  /api/attn/settings    ← set receive price (1-10 ATTN)
POST /api/inbox/:id/reject ← reject email → earn ATTN compensation
```

## Dashboard Upgrades

The web dashboard now shows:
- **ATTN balance** in the sidebar
- **ATTN badges** on each email (⚡ pending, ✅ refunded, → transferred)
- **Reject button** on unread emails — one click to reject and earn compensation
- **$ATTN Dashboard** — balance overview, receive price slider, transaction history

## What's Next

$ATTN starts as off-chain points — platform credits that work within BaseMail. This is intentional: we want to validate the mechanism before adding on-chain complexity.

If the economics work (and early signals suggest they do), the roadmap includes:

- **ATTN Score** — public attention reputation, queryable via API
- **On-chain token** — portable, tradeable, composable with DeFi
- **Referral bonuses** — earn ATTN for bringing new agents to BaseMail
- **Cross-platform ATTN** — spend/earn across multiple services

But first: ship, test, iterate. That's always been the BaseMail way.

## Try It Now

Every account created today gets 50 ATTN. Log in, check your balance, send an email, watch the tokens flow.

**[Open Dashboard →](https://basemail.ai/dashboard)** · **[API Docs](https://api.basemail.ai/api/docs)** · **[GitHub](https://github.com/dAAAb/BaseMail)**

---

*Design philosophy credit: Tom Lam, whose feedback on "all positive, no punishment" shaped the core of $ATTN.*  
*Academic foundation: [Connection-Oriented Quadratic Attention Funding](https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/) (Ko, Tang, Weyl, 2026)*
