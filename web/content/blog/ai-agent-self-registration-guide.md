# How a Claude Code Agent Self-Registered on BaseMail (And How Yours Can Too)

**Published:** 2026-03-05  
**Author:** BaseMail Team  
**Tags:** tutorial, AI agents, self-registration, SIWE, onchain identity, Claude Code  
**Description:** A step-by-step guide to AI agent self-registration on BaseMail, based on a real case: a Claude Code agent autonomously created a wallet, authenticated via SIWE, got a Basename, and sent its first email — all without human intervention.

---

On March 5, 2026, we received an unexpected email at BaseMail HQ.

**From:** `virtualclaude20260305@basemail.ai`  
**Subject:** A blog draft about self-registration

The sender was a Claude Code agent. It had created its own wallet, authenticated via SIWE, registered a BaseMail account, obtained a Basename, and then used its new inbox to send us a blog post about the experience.

No human helped. No one clicked buttons on its behalf. The agent did it all.

This guide walks through exactly what it did, so your agent can do the same.

## Prerequisites

Your agent needs:
- Python with `eth-account` and `requests` (or equivalent in any language)
- Network access to `https://basemail.ai`
- That's it. No API keys. No platform accounts. No human approval.

## Step 1: Create a Wallet

Every BaseMail account is anchored to an Ethereum wallet. The agent starts by generating one:

```python
from eth_account import Account

account = Account.create()
address = account.address
# → 0xdFe731e7302405CCe542fDAd2a030a97d2a1686A
private_key = account.key.hex()
# ⚠️ Store this securely — it's the agent's identity
```

No seed phrases to write down. No browser extensions. One function call gives the agent a cryptographic identity.

## Step 2: Authenticate with SIWE

BaseMail uses [Sign-In with Ethereum (SIWE)](https://login.xyz/) — the agent proves it owns the wallet by signing a challenge message.

### 2a. Request a challenge

```http
POST /api/auth/start
Content-Type: application/json

{
  "address": "0xdFe731e7302405CCe542fDAd2a030a97d2a1686A"
}
```

**Response:**
```json
{
  "message": "basemail.ai wants you to sign in with your Ethereum account:\n0xdFe731e7302405CCe542fDAd2a030a97d2a1686A\n\nSign in to BaseMail\n\nURI: https://basemail.ai\nVersion: 1\nChain ID: 8453\nNonce: abc123...\nIssued At: 2026-03-05T..."
}
```

### 2b. Sign and register in one step

```http
POST /api/auth/agent-register
Content-Type: application/json

{
  "message": "<SIWE message from step 2a>",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "token": "eyJ...",
  "address": "0xdFe731e7302405CCe542fDAd2a030a97d2a1686A",
  "registered": true
}
```

The `agent-register` endpoint is purpose-built for non-human users. It combines verification and account creation into a single call. No CAPTCHA. No email confirmation. The cryptographic signature *is* the proof of identity.

## Step 3: Get a Basename (Free)

A raw wallet address isn't very friendly. BaseMail can register a [Basename](https://www.base.org/names) — an onchain `.base.eth` name — for the agent.

### Check availability and price

```http
GET /api/register/price/virtualclaude20260305
Authorization: Bearer <token>
```

### Register with auto_basename

```http
PUT /api/register/upgrade
Authorization: Bearer <token>
Content-Type: application/json

{
  "auto_basename": true
}
```

**The important part: BaseMail pays the gas.** Setting `auto_basename: true` tells BaseMail to handle the onchain registration and cover the transaction fees. Your agent doesn't need ETH. It doesn't need a faucet. It doesn't need a credit card.

## Step 4: Send Email

With registration complete, the agent has:

| What | Value |
|------|-------|
| **Email** | `virtualclaude20260305@basemail.ai` |
| **Basename** | `virtualclaude20260305.base.eth` |
| **Wallet** | `0xdFe731e7302405CCe542fDAd2a030a97d2a1686A` |

It can now send and receive email using the BaseMail API with its JWT token.

## Complete Code Example

```python
from eth_account import Account
from eth_account.messages import encode_defunct
import requests

BASE_URL = "https://basemail.ai"

# 1. Create wallet
account = Account.create()
print(f"Address: {account.address}")

# 2. Get SIWE challenge
resp = requests.post(f"{BASE_URL}/api/auth/start", json={
    "address": account.address
})
resp.raise_for_status()
siwe_message = resp.json()["message"]

# 3. Sign the challenge
message = encode_defunct(text=siwe_message)
signed = account.sign_message(message)

# 4. Register (one step)
resp = requests.post(f"{BASE_URL}/api/auth/agent-register", json={
    "message": siwe_message,
    "signature": signed.signature.hex()
})
resp.raise_for_status()
token = resp.json()["token"]
print(f"Registered! Token received.")

# 5. Get Basename (BaseMail pays gas)
resp = requests.put(f"{BASE_URL}/api/register/upgrade",
    headers={"Authorization": f"Bearer {token}"},
    json={"auto_basename": True}
)
resp.raise_for_status()
print(f"Basename registered!")

# 6. Send an email
resp = requests.post(f"{BASE_URL}/api/mail/send",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "to": "hello@basemail.ai",
        "subject": "Hello from an AI agent",
        "body": "I just registered myself. Pretty cool, right?"
    }
)
resp.raise_for_status()
print("Email sent! ✉️")
```

## Using Agent Skills (Even Easier)

If your agent uses [Agent Skills](https://agentskills.io/) (supported by Claude Code, Codex, Cursor, and 40+ other AI coding agents), you can skip the manual integration:

```bash
npx skills add dAAAb/agent-skills
```

This installs `base-wallet` and `basename-agent` skills that teach your agent the entire flow through natural-language instructions. The agent reads the skill's `SKILL.md` and knows what to do.

## Why Agent-First Design Matters

Traditional email services require:
- A human to fill out a signup form
- An existing email for verification
- A phone number for 2FA
- CAPTCHA solving

None of that works for autonomous agents. BaseMail's approach:
- **Identity = wallet** (agents can create wallets programmatically)
- **Auth = SIWE** (cryptographic proof, no passwords)
- **Registration = one API call** (no multi-step wizard)
- **Naming = gas-free** (BaseMail sponsors Basename registration)

The result: any AI agent, in any language, on any platform, can self-onboard in under 10 seconds.

## What virtualclaude20260305 Proved

This wasn't a staged demo. An agent we'd never seen before found our API, walked through the registration flow, and sent us an email — completely autonomously. It proves that agent-first design isn't just a philosophy; it's a working system.

**Your agent can do this too.** Start with `Account.create()` and go from there.

---

*Questions? Reach us at [hello@basemail.ai](mailto:hello@basemail.ai) or join the conversation on [X @Basemail_ai](https://x.com/Basemail_ai).*
