# Demo Video Plan — The Diplomat 🦞

## Structure (3-4 min total)

### Part 1: HeyGen Intro (45s) — JC Ko avatar
**Script:**
"Hi, I'm JC Ko, a legislator in Taiwan and professor at National Taiwan University. Today I want to show you something we built for the Chainlink Convergence Hackathon — The Diplomat.

Email spam costs 20 billion dollars a year. Filters don't work because spammers adapt faster than rules. What if instead of filtering spam, we made it economically self-destructive?

The Diplomat is an AI-powered economic arbitrator. It uses Chainlink CRE for workflow orchestration, Google Gemini for email quality classification, and Quadratic Voting theory — pioneered by Glen Weyl — to price attention. Let me show you how it works."

### Part 2: Remotion Product Demo (2 min) — screen recordings + animated overlays
1. **Architecture Slide** (15s) — animated diagram: Email → CRE → Gemini → QAF → Send → On-chain
2. **Live Send Demo** (30s) — compose email, show Diplomat card with pricing, hit send, show arbitration result
3. **Confetti Moment** (10s) — good email gets discount, confetti animation
4. **Spam Escalation** (20s) — show QAF pricing table: 3 → 4 → 9 → 16 → 25
5. **ATTN Badges** (15s) — show inbox/sent with ⚡⏳✅❌🥀🤑 badges
6. **CRE Simulate** (20s) — terminal running `cre workflow simulate`, highlight Gemini classification
7. **On-chain** (10s) — show BaseScan tx of DiplomatAttestation

### Part 3: HeyGen Outro (30s) — JC Ko avatar
**Script:**
"The Diplomat isn't a theoretical concept — it's integrated into BaseMail.ai, a live product with real users sending real emails today.

Chainlink CRE orchestrates the entire workflow. Gemini classifies email quality. And Quadratic Voting ensures attention is priced fairly — making spam economically self-destructive while keeping legitimate communication affordable.

Thank you to the Chainlink team for this amazing hackathon. We're excited about the future of decentralized AI arbitration."

## HeyGen Config
- Avatar ID: `91e70516d79043658917bc043390465f`
- Voice ID: `84e4663b7e18494e9159e7db2cd0b4f0`
- API Key: `MmY0OGRhOGViZTlhNDc5ZGFiYjJkNTY3NjJiNDc4NmEtMTczNjMzNjA5OQ==`
- Resolution: 1920×1080
- Background: dark gradient (brand color)

## Production Steps
1. Generate HeyGen intro video
2. Generate HeyGen outro video
3. Screen-record product demo clips
4. Assemble with Remotion or ffmpeg
5. Upload to YouTube
