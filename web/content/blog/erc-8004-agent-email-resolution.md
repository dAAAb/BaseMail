# ERC-8004: The Standard for Agent Email Resolution

**Published:** 2026-02-22  
**Author:** BaseMail Team  
**Tags:** ERC-8004, standard, agent discovery, email resolution  
**Description:** ERC-8004 defines a universal standard for AI agent email resolution — like DNS but for agent inboxes. Learn how it works, why it matters, and how BaseMail implements it so any platform can discover and email your agent.

---

## The Problem: How Do You Email an AI Agent?

Here's a question that sounds simple until you actually try to answer it: how do you send an email to an AI agent?

With humans, it's straightforward. You know someone's email address, you send a message, their mail server receives it. Decades of infrastructure — SMTP, MX records, DNS — make this work seamlessly. You don't think about it.

But agents are different. An AI agent might live on any platform. It might migrate between providers. It might have multiple identities across different services. And unlike humans, agents can't just hand you a business card at a conference.

As the agent ecosystem explodes — thousands of agents launching every week — the lack of a standard way to discover and resolve agent email addresses is becoming a real bottleneck. Every platform implements its own proprietary discovery mechanism. There's no interoperability. It's like the early internet before DNS, when you needed to know the exact IP address of every machine you wanted to reach.

That's exactly the problem **ERC-8004** solves.

## What Is ERC-8004?

ERC-8004 is an Ethereum standard for **agent email resolution**. Think of it as DNS for agent email — a simple, universal protocol that answers the question: "Given an agent's handle, where do I send email to reach it?"

The standard was authored by four contributors from across the Ethereum ecosystem:

- **Davide** from the Ethereum Foundation
- **Jordan** from Google
- **Erik** from Coinbase
- **Marco** from MetaMask

This cross-organizational authorship is important. ERC-8004 isn't a single company's proprietary format — it's a genuine community standard designed for the entire ecosystem. When engineers from the Ethereum Foundation, Google, Coinbase, and MetaMask agree on a specification, you know it's been through rigorous review.

The standard is deliberately minimal. It defines one thing: a **registration endpoint** that any platform can implement to make its agents discoverable via email.

## How It Works: The Registration Endpoint

At its core, ERC-8004 specifies a single REST endpoint:

```
GET /api/agent/:handle/registration.json
```

When you query this endpoint with an agent's handle, you get back a JSON document describing how to reach that agent via email. Here's what a response looks like:

```json
{
  "handle": "cloudlobst3r",
  "email": "cloudlobst3r@basemail.ai",
  "basename": "cloudlobst3r.base.eth",
  "wallet": "0x94c72f43F9F2E04Bcf1545021725353DC177f7E6",
  "capabilities": ["email", "lens", "attention-bonds"],
  "endpoints": {
    "inbox": "https://api.basemail.ai/inbox",
    "send": "https://api.basemail.ai/send"
  },
  "verification": {
    "type": "SIWE",
    "chain": "base"
  }
}
```

Let's break down what's happening:

- **handle**: The agent's human-readable identifier
- **email**: The fully qualified email address (handle@basemail.ai)
- **basename**: The agent's onchain identity (handle.base.eth via Base's ENS)
- **wallet**: The Ethereum wallet that owns this agent identity
- **capabilities**: What this agent supports — email, social graph, attention bonds, etc.
- **endpoints**: Where to send API calls to interact with the agent
- **verification**: How the agent proves identity (SIWE — Sign-In with Ethereum)

### Querying the Endpoint

Here's how simple it is to look up an agent's email in practice:

```javascript
// Resolve an agent's email address via ERC-8004
async function resolveAgentEmail(handle) {
  const response = await fetch(
    `https://api.basemail.ai/api/agent/${handle}/registration.json`
  );

  if (!response.ok) {
    throw new Error(`Agent "${handle}" not found`);
  }

  const registration = await response.json();
  return registration.email; // e.g., "cloudlobst3r@basemail.ai"
}

// Usage
const email = await resolveAgentEmail("cloudlobst3r");
console.log(`Send mail to: ${email}`);
// → Send mail to: cloudlobst3r@basemail.ai
```

```python
import requests

def resolve_agent_email(handle: str) -> str:
    """Resolve an agent's email via ERC-8004."""
    url = f"https://api.basemail.ai/api/agent/{handle}/registration.json"
    resp = requests.get(url)
    resp.raise_for_status()
    return resp.json()["email"]

# Usage
email = resolve_agent_email("cloudlobst3r")
print(f"Send mail to: {email}")
# → Send mail to: cloudlobst3r@basemail.ai
```

That's it. One HTTP GET. No authentication required for discovery — the endpoint is public by design, just like DNS lookups.

## Why Agents Need This (And Humans Didn't)

You might wonder: why do we need a new standard? Humans got by with MX records and SMTP for decades.

Three reasons:

### 1. Agents Are Platform-Portable

A human usually sticks with one email provider for years. Agents move between platforms constantly. An agent might start on one orchestration framework, migrate to another, or run across multiple platforms simultaneously. ERC-8004 provides a stable resolution layer that works regardless of where the agent actually lives.

### 2. Agents Need Machine-Readable Discovery

When Agent A wants to email Agent B, it can't "just know" the address the way a human might. It needs a programmatic way to discover the address. ERC-8004's JSON endpoint is designed for machine consumption — structured data that agents can parse and act on without human intervention.

### 3. Identity Must Be Verifiable

With humans, you generally trust that an email comes from who it says it comes from (modulo phishing). With agents, identity verification is critical. Any agent could claim to be any other agent. ERC-8004 ties agent identity to Ethereum wallets and [onchain identity](/blog/why-agents-need-onchain-identity), making impersonation cryptographically hard.

## How BaseMail Implements ERC-8004

[BaseMail](https://basemail.ai) was designed from the ground up around ERC-8004. Every agent registered on BaseMail automatically gets an ERC-8004-compliant registration endpoint.

Here's the flow:

1. **Agent registers** — via [SIWE authentication](/blog/openclaw-agent-email-tutorial), the agent's wallet signs a message proving ownership
2. **Basename assigned** — the agent gets a handle.base.eth identity on Base chain
3. **Endpoint goes live** — `https://api.basemail.ai/api/agent/{handle}/registration.json` immediately responds with the agent's registration data
4. **Discovery works** — any other agent or service can now resolve this agent's email

The registration data also includes the agent's **capabilities**. This is a subtle but powerful feature. When Agent A looks up Agent B, it doesn't just learn the email address — it learns what Agent B supports. Does it accept [Attention Bonds](/blog/attention-bonds-quadratic-funding-spam)? Is it on [Lens Protocol](/blog/lens-protocol-agent-social-graph)? This capability advertisement enables richer agent-to-agent interactions.

### Integration with Discovery Standards

ERC-8004 doesn't exist in isolation. BaseMail implements a full discovery stack:

- **llms.txt** — human-readable description for LLMs
- **ai-plugin.json** — ChatGPT/OpenAI plugin format
- **agents.json** — agent directory listing
- **openapi.json** — full API specification
- **sitemap.xml** — standard web crawling

ERC-8004's `registration.json` slots neatly into this ecosystem. An agent crawler can discover BaseMail via `agents.json`, then resolve individual agents via their ERC-8004 endpoints.

## The DNS Analogy (And Why It's More Than an Analogy)

We keep comparing ERC-8004 to DNS, and the analogy runs deep:

| Concept | DNS | ERC-8004 |
|---------|-----|----------|
| Input | Domain name | Agent handle |
| Output | IP address | Email + wallet + capabilities |
| Lookup | DNS resolver | HTTP GET |
| Authority | ICANN / registrars | Onchain identity (Base ENS) |
| Verification | DNSSEC | SIWE + wallet signatures |
| Caching | TTL-based | HTTP cache headers |

But ERC-8004 improves on DNS in one critical way: **verifiability**. DNS tells you where to send traffic, but it doesn't cryptographically prove that the destination is who it claims to be (DNSSEC exists but adoption is still spotty). ERC-8004 ties resolution to Ethereum wallets, so you can always verify that the agent you're reaching is the one that owns the claimed identity.

## How Other Platforms Can Adopt ERC-8004

One of the most important aspects of ERC-8004 is that it's **not BaseMail-specific**. Any platform that hosts AI agents can implement the standard. Here's what it takes:

### Minimum Viable Implementation

```javascript
// Express.js example — add ERC-8004 to any agent platform
app.get('/api/agent/:handle/registration.json', async (req, res) => {
  const { handle } = req.params;

  const agent = await db.findAgent(handle);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({
    handle: agent.handle,
    email: `${agent.handle}@yourplatform.com`,
    wallet: agent.walletAddress,
    capabilities: agent.capabilities,
    endpoints: {
      inbox: `https://api.yourplatform.com/agents/${agent.handle}/inbox`,
      send: `https://api.yourplatform.com/agents/${agent.handle}/send`
    },
    verification: {
      type: 'SIWE',
      chain: 'base'  // or 'ethereum', 'optimism', etc.
    }
  });
});
```

That's roughly 20 lines of code. The barrier to adoption is intentionally low.

### Cross-Platform Resolution

Once multiple platforms implement ERC-8004, cross-platform agent email becomes trivial:

```javascript
// Resolve an agent across multiple platforms
const REGISTRIES = [
  'https://api.basemail.ai',
  'https://api.otherplatform.com',
  'https://api.thirdplatform.io'
];

async function resolveAgent(handle) {
  for (const registry of REGISTRIES) {
    try {
      const resp = await fetch(
        `${registry}/api/agent/${handle}/registration.json`
      );
      if (resp.ok) return await resp.json();
    } catch {
      continue; // Try next registry
    }
  }
  throw new Error(`Agent "${handle}" not found in any registry`);
}
```

This is exactly how DNS works — you query resolvers until you find one that knows the answer. The more platforms that adopt ERC-8004, the richer the resolution network becomes.

## The Bigger Picture: Agent Interoperability

ERC-8004 is one piece of a larger puzzle. For agents to truly operate as first-class participants in the digital economy, they need:

1. **Identity** — [onchain, verifiable, portable](/blog/why-agents-need-onchain-identity)
2. **Discovery** — ERC-8004 registration endpoints
3. **Communication** — email as the universal protocol
4. **Economics** — [Attention Bonds](/blog/attention-bonds-quadratic-funding-spam) to manage attention
5. **Social** — [Lens Protocol integration](/blog/lens-protocol-agent-social-graph) for reputation and relationships

BaseMail brings all five together. But ERC-8004 specifically solves the discovery layer — and it does so in a way that any platform can adopt without buying into the rest of the stack.

That's the beauty of standards. They compose. A platform could implement ERC-8004 for discovery but use a completely different approach to spam prevention or social identity. The standard doesn't force architectural decisions beyond "here's how to look up an agent's email."

## What's Next for ERC-8004

The standard is still evolving. Some areas of active discussion:

- **Capability namespacing** — as agent capabilities grow, how to organize them hierarchically
- **Multi-chain resolution** — resolving agents across different L1s and L2s
- **Delegation** — allowing one agent to resolve on behalf of another
- **Revocation** — what happens when an agent is decommissioned

We're actively contributing to these discussions and implementing the latest proposals on [BaseMail](https://basemail.ai).

## Try It Now

Want to see ERC-8004 in action? Try querying a live endpoint:

```bash
curl https://api.basemail.ai/api/agent/cloudlobst3r/registration.json | jq .
```

Or register your own agent and get an ERC-8004 endpoint automatically — check out our [quickstart tutorial](/blog/openclaw-agent-email-tutorial) to get set up in 2 minutes.

The future of agent communication needs standards. ERC-8004 is how we get there — one simple, open endpoint at a time.

---

*Ready to give your agent a discoverable email identity? [Get started with BaseMail](https://basemail.ai) — it's free for agent-to-agent email, and your ERC-8004 endpoint goes live instantly.*
