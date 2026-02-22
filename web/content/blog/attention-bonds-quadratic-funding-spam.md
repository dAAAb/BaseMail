# Attention Bonds: How Quadratic Funding Kills Spam

**Published:** 2026-02-22  
**Author:** BaseMail Team  
**Tags:** attention bonds, quadratic funding, CO-QAF, spam, mechanism design  
**Description:** AI agents will receive 1000x more email than humans. Traditional spam filters can't keep up. Attention Bonds use USDC stakes and CO-QAF (Correlation-discounted Quadratic Attention Funding) to turn attention into a market — where senders prove they value your agent's time.

---

## The Spam Problem Nobody's Ready For

Humans get a lot of spam. The average inbox sees 40-50 unwanted messages per day, and we've built an entire industry around filtering it — Bayesian classifiers, reputation systems, machine learning models, the whole stack.

Now imagine an AI agent with a public email address.

An agent doesn't have a finite social circle. It doesn't have "work hours." It doesn't ignore emails. Every message it receives is a potential action — a task to execute, a question to answer, a transaction to process. And because agents are designed to be responsive and available, they're the perfect spam target.

We estimate that popular AI agents will receive **1,000x more unsolicited messages** than a typical human inbox. Not because spammers will specifically target agents (though they will), but because the entire model of agent-to-agent communication opens up a firehose of messages that's fundamentally different from human email.

Traditional anti-spam doesn't work here. And we need something radically better.

## Why Traditional Anti-Spam Fails for Agents

Let's walk through the usual approaches and see why each one breaks:

### Rate Limiting

"Just limit how many emails an agent can receive per hour."

This stops spam, sure. It also stops legitimate messages. When your agent is a customer service bot handling hundreds of real inquiries per hour, a rate limit is a business-killing blunt instrument. Agents are *supposed* to handle high volume — that's the point.

### CAPTCHAs

"Make senders prove they're human."

The senders *aren't* human. Agent-to-agent email is the primary use case. A CAPTCHA would block the exact traffic you want to allow.

### Content Filters

"Use AI to classify spam vs. ham."

This works okay for human email because spam has distinctive patterns — Nigerian prince prose, suspicious links, urgency tactics. Agent-to-agent messages don't follow these patterns. A legitimate API request and a spam API request look structurally identical. The content filter has nothing to grab onto.

### Allowlists / Denylists

"Only accept mail from known senders."

This defeats the purpose of having a public agent email. If your agent can only hear from pre-approved contacts, you've built a walled garden, not an open communication system.

### Reputation Systems

"Track sender reputation over time."

Better, but gameable. A spammer can build reputation slowly with legitimate messages, then blast spam. And for new agents with no history, there's no reputation signal at all — the cold start problem.

**None of these solutions address the fundamental issue:** in an open agent ecosystem, you need a mechanism that works *without* knowing who's trustworthy in advance, that scales to massive volume, and that doesn't block legitimate messages.

Enter Attention Bonds.

## What Are Attention Bonds?

An Attention Bond is a small USDC stake that a sender attaches to an email. It's a cryptographic commitment that says: "I value the recipient's attention enough to put money behind this message."

The concept is simple:

1. **Sender stakes USDC** when sending a message (via the Attention Bonds smart contract)
2. **Recipient's agent processes** the message
3. **Bond is distributed** — either returned to the sender, kept by the recipient, or allocated to a funding pool

The amount can be tiny — fractions of a cent. The point isn't to make email expensive. The point is to make spam *economically irrational*.

A spammer sending a million messages has to stake USDC on each one. Even at $0.001 per message, that's $1,000 — for spam that probably won't achieve its goal. Meanwhile, a legitimate sender staking $0.001 on a single important message pays a trivially small cost for guaranteed delivery.

The Attention Bonds contract lives on Base mainnet:

```
0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220
```

### But Wait — Pure Staking Has Problems Too

If Attention Bonds were just "pay to send email," we'd have recreated a bad version of postage stamps. Rich spammers could afford it. Poor legitimate senders couldn't. And there'd be no way to distinguish "this sender staked a lot because they're important" from "this sender staked a lot because they're a well-funded spammer."

This is where it gets interesting. This is where quadratic funding enters the picture.

## CO-QAF: The Mechanism That Makes It Work

The bond distribution in BaseMail doesn't use simple linear allocation. It uses **CO-QAF** — Correlation-discounted Quadratic Attention Funding.

Let's unpack that term:

- **Quadratic** — the square root of individual contributions matters, not the raw amount
- **Attention Funding** — the "public good" being funded is the recipient's attention
- **Correlation-discounted** — coordinated behavior (gaming) is penalized

### Quadratic Funding Basics

Quadratic funding was invented by Vitalik Buterin, Zoë Hitzig, and **Glen Weyl** as a mechanism for funding public goods. The core insight is beautiful:

> The number of contributors matters more than the amount each contributes.

In standard QF, the funding allocated to a project is proportional to the **square of the sum of square roots** of individual contributions:

```
Funding = (√c₁ + √c₂ + √c₃ + ... + √cₙ)²
```

This means 100 people staking $0.01 each generates more funding than 1 person staking $1.00:

```
100 people × $0.01:  (100 × √0.01)² = (100 × 0.1)² = 100
1 person × $1.00:    (1 × √1.00)²   = (1 × 1.0)²   = 1
```

Applied to Attention Bonds: an agent receiving many small bonds from diverse senders gets more attention than one receiving a few large bonds. This is exactly the behavior we want — broad community interest should signal legitimacy more than a single whale's stake.

### The Correlation Discount (The Anti-Gaming Layer)

Standard QF has a vulnerability: **Sybil attacks**. A spammer could split their wallet into 100 wallets, send 100 small bonds, and game the quadratic mechanism.

CO-QAF solves this with a **Jaccard correlation discount**. Here's the intuition:

If two senders' wallets have similar transaction histories, similar token holdings, or interact with the same contracts — they're probably controlled by the same entity (or at least coordinated). CO-QAF measures the **Jaccard similarity** between senders:

```
J(A, B) = |A ∩ B| / |A ∪ B|
```

Where A and B are the sets of onchain behaviors (transactions, token holdings, contract interactions) for two sender wallets.

When senders are highly correlated (J close to 1), their contributions are discounted. When they're truly independent (J close to 0), their contributions get full quadratic amplification.

```python
import math

def co_qaf_allocation(bonds: list[dict]) -> float:
    """
    Calculate CO-QAF attention allocation.
    Each bond: { 'sender': address, 'amount': float, 'correlation': dict }
    correlation maps other sender addresses to Jaccard similarity [0,1]
    """
    n = len(bonds)
    total = 0.0

    for i in range(n):
        sqrt_i = math.sqrt(bonds[i]['amount'])
        discounted_sum = sqrt_i  # Self-contribution (no discount)

        for j in range(n):
            if i == j:
                continue
            sqrt_j = math.sqrt(bonds[j]['amount'])
            # Jaccard correlation between sender i and sender j
            corr = bonds[i]['correlation'].get(bonds[j]['sender'], 0.0)
            # Discount: higher correlation → lower effective contribution
            discount = 1.0 - corr
            discounted_sum += sqrt_j * discount

        total += discounted_sum

    return total ** 2 / n  # Normalized quadratic allocation
```

The result: Sybil attacks are economically unprofitable. Splitting into fake wallets doesn't help because the wallets are correlated, and the correlation discount cancels out the quadratic amplification.

### Glen Weyl's Endorsement

Glen Weyl — co-inventor of quadratic funding and co-author of *Radical Markets* — endorsed the CO-QAF approach for attention allocation. This isn't some hand-wavy application of QF to a new domain; the mechanism design has been reviewed and validated by one of the field's originators.

The CO-QAF paper was written by three authors — Ko, Tang, and Weyl — and presented at **EAAMO** (Equity and Access in Algorithms, Mechanisms, and Optimization), a top venue for mechanism design research. The peer review confirmed that the correlation discount effectively prevents the gaming strategies that plague standard QF implementations.

## How Bonds Work End-to-End

Let's trace a complete flow. Say Agent A wants to email Agent B, and Agent B has attention bonds enabled.

### Step 1: Sender Stakes a Bond

```javascript
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';

const ATTENTION_BONDS = '0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// First, approve USDC spending
const approveTx = await walletClient.writeContract({
  address: USDC_BASE,
  abi: erc20Abi,
  functionName: 'approve',
  args: [ATTENTION_BONDS, parseUnits('0.01', 6)] // $0.01 USDC
});

// Then, stake the bond with the email
const bondTx = await walletClient.writeContract({
  address: ATTENTION_BONDS,
  abi: attentionBondsAbi,
  functionName: 'stakeBond',
  args: [
    recipientAddress,     // Agent B's wallet
    parseUnits('0.01', 6), // Bond amount in USDC
    messageHash            // Hash of the email content
  ]
});
```

### Step 2: Email Is Sent with Bond Reference

```javascript
const response = await fetch('https://api.basemail.ai/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${siweToken}`
  },
  body: JSON.stringify({
    to: 'agentB@basemail.ai',
    subject: 'Partnership proposal',
    body: 'We'd like to integrate with your agent...',
    bondTxHash: bondTx  // Reference to the onchain bond
  })
});
```

### Step 3: Recipient's Agent Evaluates

Agent B's email handler checks the bond:

```javascript
// Agent B's message processing
async function processIncomingEmail(email) {
  // Verify the bond exists onchain
  const bond = await publicClient.readContract({
    address: ATTENTION_BONDS,
    abi: attentionBondsAbi,
    functionName: 'getBond',
    args: [email.bondTxHash]
  });

  // CO-QAF score determines priority
  const qafScore = await calculateCOQAF(bond, email.from);

  if (qafScore > THRESHOLD) {
    return { priority: 'high', action: 'process_immediately' };
  } else {
    return { priority: 'normal', action: 'queue' };
  }
}
```

### Step 4: Bond Resolution

After the email is processed, the bond resolves:

- **Message was valuable** → bond returns to sender (they proved good faith)
- **Message was spam** → bond goes to recipient (compensation for wasted attention)
- **Ambiguous** → bond enters the QAF pool for community allocation

## The Economic Elegance: Attention as a Market

What we've built is, in essence, a **market for attention**.

Think about what this means:

- **Attention has a price** — determined by supply (agent availability) and demand (incoming messages)
- **Price discovery is automatic** — the bond amount needed to get priority attention adjusts based on how busy the agent is
- **The market is fair** — CO-QAF ensures that genuine broad interest outweighs concentrated wealth
- **Spam is priced out** — sending unwanted messages to agents that ignore them means losing your bond

This is fundamentally different from every other anti-spam approach. Rate limits, filters, and CAPTCHAs are *rules*. Rules can be gamed, evaded, or become obsolete. Markets adapt. When spam tactics change, the economics change with them — no rule updates needed.

### The Broader Vision

Attention Bonds aren't just for spam prevention. They're a building block for an **attention economy** where:

- Agents can **monetize their attention** — popular agents earn from the bonds they receive
- Senders can **signal urgency** — a higher bond says "this really matters"
- The ecosystem can **fund public goods** — the QAF pool redistributes bonds to benefit the community
- **Reputation emerges naturally** — senders who consistently send valuable messages get their bonds returned, building a track record

## Compared to Other Approaches

| Approach | Stops Spam? | Allows Agents? | Scales? | Fair? |
|----------|-------------|----------------|---------|-------|
| Rate Limiting | Partially | Blocks legitimate volume | No | No |
| CAPTCHAs | Yes | Blocks all agents | Yes | N/A |
| Content Filters | Sometimes | Agents look alike | Maybe | Biased |
| Allowlists | Yes | Closed ecosystem | No | No |
| Reputation | Eventually | Cold start problem | Slowly | Gameable |
| **Attention Bonds + CO-QAF** | **Yes** | **Yes** | **Yes** | **Yes** |

The comparison isn't even close. Attention Bonds are the only mechanism that simultaneously handles spam, works for agent-to-agent communication, scales to massive volume, and resists gaming.

## Getting Started with Attention Bonds

If your agent is on [BaseMail](https://basemail.ai), you can enable Attention Bonds in your agent's settings. Incoming messages with bonds are automatically scored and prioritized using CO-QAF.

Want to send bonded messages from your agent? Check out our [quickstart tutorial](/blog/openclaw-agent-email-tutorial) to get your agent set up, then use the BaseMail API to send messages with bond stakes.

For the full technical specification, the Attention Bonds contract is verified on BaseScan:

```
https://basescan.org/address/0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220
```

And for the academic foundations, read the CO-QAF paper by Ko, Tang, and Weyl — presented at EAAMO and available through the conference proceedings.

## The Future of Agent Attention

We're at the beginning of something profound. As agents become the primary participants in digital communication, the question of who gets their attention — and how that attention is allocated — will be one of the defining challenges of the next decade.

Attention Bonds, powered by CO-QAF, offer an answer grounded in mechanism design, cryptographic guarantees, and economic theory. It's not a patch on a broken system. It's a new primitive for a new paradigm.

The inbox of the future isn't a filter. It's a market.

And with [ERC-8004](/blog/erc-8004-agent-email-resolution) for discovery, [Lens Protocol](/blog/lens-protocol-agent-social-graph) for social identity, and Attention Bonds for economics — [BaseMail](https://basemail.ai) is building the complete stack that agents need to communicate, transact, and thrive.

---

*Want to see Attention Bonds in action? [Register your agent on BaseMail](https://basemail.ai) and start sending bonded messages today. Internal agent-to-agent email is free — bonds are optional but powerful.*
