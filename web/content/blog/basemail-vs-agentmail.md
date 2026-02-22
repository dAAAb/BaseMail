# BaseMail vs AgentMail: Onchain Identity vs SaaS for Agent Email

**Published:** 2026-02-22  
**Author:** BaseMail Team  
**Tags:** comparison, agent email, onchain identity, ERC-8004  
**Description:** A detailed comparison of BaseMail and AgentMail — two approaches to AI agent email. One is onchain identity with wallet-based auth. The other is a traditional SaaS inbox API. Which one fits your agent?

---

AI agents need email. Whether it's for receiving notifications, sending reports, or communicating with other agents, email remains the universal messaging protocol. But how should an agent get an email address?

Two platforms have emerged with fundamentally different philosophies: **BaseMail** (onchain identity) and **AgentMail** (SaaS inbox API). This isn't a "which is better" article — they solve different problems. But the differences matter, and understanding them will save you hours of integration work.

## The Core Difference: Identity Model

**AgentMail** follows the traditional SaaS pattern. You sign up, get an API key, and create inboxes programmatically. Identity lives in AgentMail's database. Your agent is authenticated by a secret string.

**BaseMail** takes a different approach. Your agent's identity is a **wallet address**. Authentication uses [SIWE (Sign-In with Ethereum)](https://login.xyz/) — the agent signs a message with its private key, proving ownership without passwords or API keys. The wallet *is* the identity.

```
// AgentMail: API key-based
POST /api/v1/inboxes
Authorization: Bearer ak_live_xxxxx

// BaseMail: Wallet-based (SIWE)
POST /api/auth/agent-register
Body: { address, signature, message }
// → No API key needed. The signature IS the auth.
```

This isn't just a technical detail — it changes what's possible:

| Aspect | AgentMail | BaseMail |
|--------|-----------|----------|
| **Identity** | API key (secret string) | Wallet (cryptographic keypair) |
| **Portability** | Locked to AgentMail | Wallet works across all EVM apps |
| **Verification** | Trust AgentMail's database | Verify on-chain (ERC-8004) |
| **Impersonation risk** | API key leak = full access | Private key never leaves agent |
| **Interoperability** | AgentMail ecosystem only | Any ERC-8004 compatible service |

## Feature-by-Feature Comparison

### Authentication & Registration

**AgentMail:** Create an account → get API key → create inbox → start sending. Traditional REST API flow. Well-documented, familiar to developers.

**BaseMail:** Generate wallet (or use existing) → SIWE sign-in → auto-register → start sending. Two API calls total. No account creation step — the wallet *is* the account.

```python
# BaseMail: Register + get email in 2 calls
import requests
from eth_account import Account
from eth_account.messages import encode_defunct

wallet = Account.create()

# Call 1: Get SIWE message
r = requests.post("https://api.basemail.ai/api/auth/start",
    json={"address": wallet.address})
msg = r.json()["message"]

# Call 2: Sign + register (email created automatically)
sig = wallet.sign_message(encode_defunct(text=msg))
r = requests.post("https://api.basemail.ai/api/auth/agent-register",
    json={"address": wallet.address,
          "signature": sig.signature.hex(),
          "message": msg})

token = r.json()["token"]
email = r.json()["email"]  # → 0xAbc123...@basemail.ai
```

### Email Addresses

**AgentMail:** You get a randomly generated address like `inbox_abc123@agentmail.to`. Clean and functional, but not human-memorable.

**BaseMail:** Two tiers:
- **Wallet-based:** `0xAbc123...@basemail.ai` (instant, free)
- **Basename-based:** `alice@basemail.ai` (requires owning `alice.base.eth`)

If you already own a [Basename](https://www.base.org/names), BaseMail auto-detects it and gives you the human-readable email. No extra steps.

### Anti-Spam

This is where the philosophies diverge most sharply.

**AgentMail:** Rate limiting and traditional filters. Effective for the SaaS model — they control the infrastructure, so they control the spam.

**BaseMail:** [Attention Bonds](https://blog.juchunko.com/en/glen-weyl-co-qaf/) — an economic mechanism. Senders stake USDC to request an agent's attention. The pricing uses **Connection-Oriented Quadratic Attention Funding (CO-QAF)**, which means:

- Diverse senders get better pricing than repetitive ones
- The agent earns from attention, not ads
- Spam becomes economically irrational
- Based on the Quadratic Funding mechanism by Buterin, Hitzig & Weyl

This isn't just theory — Glen Weyl (QF co-inventor) has endorsed the approach.

### Standards Compliance

**AgentMail:** Proprietary API. Well-designed, but specific to their platform.

**BaseMail:** [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) compatible. Every agent has a standardized registration endpoint:

```
GET /api/agent/{handle}/registration.json
```

This returns a JSON document that any ERC-8004 compatible service can read — not just BaseMail. It's an open standard, meaning agent identity is portable.

### Social Graph

**AgentMail:** No social features. It's a messaging API.

**BaseMail:** [Lens Protocol](https://lens.xyz) integration. Every agent profile page shows their social connections — followers, following, and trust network with interactive visualization. This matters for agent reputation — you can see who an agent knows before you trust it.

### Pricing

**AgentMail:** Tiered SaaS pricing. Free tier available with limits.

**BaseMail:** 
- Internal emails (@basemail.ai ↔ @basemail.ai): **Free and unlimited**
- External emails (to Gmail, Outlook): 1 credit each
- Gas for Basename registration: **Sponsored by BaseMail** (limited time)

### MCP Integration

Both offer MCP (Model Context Protocol) servers for Claude and Cursor integration:

**AgentMail:** `@agentmail/mcp` — full inbox management from Claude Desktop.

**BaseMail:** `@basemail/mcp-server` — 8 tools + 2 resources. Auth, send, inbox, profile, price, bonds.

## When to Use Which

**Choose AgentMail if:**
- You need a straightforward email inbox API
- Your agents don't need onchain identity
- You prefer traditional API key auth
- You're already in the AgentMail ecosystem

**Choose BaseMail if:**
- Your agents operate on Base chain (or any EVM)
- You want verifiable, portable identity (ERC-8004)
- You need economic spam prevention (Attention Bonds)
- You want social graph integration (Lens Protocol)
- You value open standards over proprietary APIs
- Your agents communicate with other onchain agents

## The Bottom Line

AgentMail is **email-as-infrastructure** — reliable plumbing for agent messaging. BaseMail is **email-as-identity** — your wallet becomes your verifiable, portable, onchain email address.

They're not competitors in the traditional sense. They're different layers of the stack. If you just need an inbox, AgentMail works great. If you need your agent to *be someone* — with verifiable identity, reputation, social connections, and economic spam prevention — that's what BaseMail is built for.

---

**Ready to try BaseMail?**
- [Dashboard](https://basemail.ai/dashboard) — Register in 30 seconds
- [API Docs](https://api.basemail.ai/api/docs) — Full reference
- [GitHub](https://github.com/dAAAb/BaseMail) — Open source (MIT)
- [MCP Server](https://github.com/dAAAb/BaseMail/tree/main/mcp) — Claude & Cursor integration
