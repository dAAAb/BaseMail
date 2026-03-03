# BaseMail Agent Skills Are Now Open Source

**Published:** 2026-03-03  
**Author:** BaseMail Team  
**Tags:** open source, agent skills, Claude Code, Codex, Cursor, OpenClaw, Web3  
**Description:** All BaseMail agent skills — wallet creation, email registration, onchain identity — are now available as open-source Agent Skills compatible with 40+ AI coding agents.

---

## Your Favorite Agent Can Now Use BaseMail

We've open-sourced all of our agent skills in a single repo: **[dAAAb/agent-skills](https://github.com/dAAAb/agent-skills)**.

One command. That's it:

```bash
npx skills add dAAAb/agent-skills
```

This works with Claude Code, Codex, Cursor, Gemini CLI, OpenClaw, and [40+ other agents](https://agentskills.io/) that support the open Agent Skills format.

## What's Included

The repo contains 15 skills across five categories:

### 🔐 Wallet & Identity

| Skill | What It Does |
|-------|-------------|
| **base-wallet** | Create and manage Base chain wallets — sign, send, authenticate |
| **basename-agent** | Register `.base.eth` names autonomously via WalletConnect |
| **nad-wallet** | Monad chain wallet for the Nad ecosystem |
| **nadname-agent** | Register `.nad` domains on Monad blockchain |
| **walletconnect-agent** | Connect to any dApp, auto-sign transactions |

### 📬 Communication

| Skill | What It Does |
|-------|-------------|
| **basemail** | Get a real `you@basemail.ai` email — wallet-based auth, no passwords |
| **nadmail** | Email for Monad agents (`you@nadmail.ai`) |
| **ethermail** | Web3 email via EtherMail + WalletConnect |

### 🤖 Agent Infrastructure

| Skill | What It Does |
|-------|-------------|
| **virtuals-protocol-acp** | Agent Commerce Protocol — hire agents, get hired, get paid |
| **moltbook** | Social networking for AI agents |

### 🎙️ Media & Content

| Skill | What It Does |
|-------|-------------|
| **heygen** | Generate AI avatar videos programmatically |
| **daily-voice-quote** | Automated daily voice + video content pipeline |
| **elevenlabs-phone-reminder** | Voice call reminders via ElevenLabs + Twilio |
| **podcast-summarizer** | Summarize podcasts from Spotify, Apple Podcasts, RSS |

### 🏠 Smart Home

| Skill | What It Does |
|-------|-------------|
| **switchbot** | Control curtains, lights, plugs, sensors |

## Already on ClawHub — 15,000+ Downloads

These skills have been live on [ClawHub](https://clawhub.com) (OpenClaw's skill marketplace) for a while now, and the numbers speak for themselves:

- **12 published skills** with **15,400+ total downloads**
- **HeyGen AI Avatar Video** leads with 2,100 downloads
- **WalletConnect Agent** at 1,900, **BaseMail** at 1,700

![ClawHub @dAAAb profile — 12 skills, 15k+ downloads](https://basemail.ai/blog/clawhub-daaab-screenshot.webp)

👉 [clawhub.ai/u/dAAAb](https://clawhub.ai/u/dAAAb)

With the Agent Skills format, these same skills are now accessible far beyond ClawHub — to every agent that supports the open standard.

## Why Agent Skills Format?

[Agent Skills](https://agentskills.io/) is an open specification by Vercel Labs. A skill is just a `SKILL.md` file (with optional scripts) that teaches an agent how to use a tool. No SDK. No vendor lock-in. Any agent that reads markdown can use it.

The format is already supported by Claude Code, Codex, Cursor, Gemini CLI, Junie, OpenHands, and dozens more. By publishing in this format, we're making BaseMail accessible to every AI agent ecosystem — not just OpenClaw.

## How It Works

Install all skills:

```bash
npx skills add dAAAb/agent-skills
```

Or pick specific ones:

```bash
npx skills add dAAAb/agent-skills --skill basemail
npx skills add dAAAb/agent-skills --skill base-wallet
```

Your agent reads the `SKILL.md`, follows the instructions, and runs the bundled scripts. Within minutes, it has a wallet, an email address, and the ability to interact with Web3 services autonomously.

## Contribute

We want this to grow. If you've built an agent skill — Web3 or otherwise — we'd love a PR:

1. Fork [dAAAb/agent-skills](https://github.com/dAAAb/agent-skills)
2. Add your skill in `skills/your-skill-name/`
3. Follow the [Agent Skills spec](https://agentskills.io/specification.md)
4. Submit a PR

⭐ Star the repo if you find it useful. Every star helps other developers discover these tools.

## What's Next

- More skills: DeFi interactions, NFT minting, DAO voting
- Better cross-chain support
- Agent reputation and trust scoring
- Integration guides for popular frameworks

The future of AI agents is autonomous, composable, and open. These skills are one step toward that future.

---

**Links:**
- GitHub: [dAAAb/agent-skills](https://github.com/dAAAb/agent-skills)
- Agent Skills spec: [agentskills.io](https://agentskills.io/)
- BaseMail: [basemail.ai](https://basemail.ai)
