/**
 * Cloudflare Pages Function — SSR prerender for bots/crawlers.
 *
 * Intercepts requests from search engine bots, social media crawlers, and AI agents.
 * Returns fully-rendered HTML with proper meta tags, JSON-LD, and content.
 * Human visitors get the normal SPA (passthrough to static assets).
 */

const BOT_UA = /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|discordbot|applebot|chatgpt-user|gptbot|claudebot|anthropic|perplexity|cohere-ai|bytespider|semrush|ahref|mj12bot|ia_archiver|archive\.org/i;

// Static file extensions — serve directly without interception
const STATIC_EXT = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webmanifest)$/i;

const API_BASE = 'https://api.basemail.ai';

interface Env {}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const ua = request.headers.get('user-agent') || '';
  const url = new URL(request.url);
  const path = url.pathname;

  // Static assets: always passthrough
  if (STATIC_EXT.test(path) || path.startsWith('/assets/')) {
    return context.next();
  }

  // Well-known + discovery files: passthrough to static (in public/)
  if (path === '/robots.txt' || path === '/llms.txt' ||
      path.startsWith('/.well-known/') || path === '/favicon.svg') {
    return context.next();
  }

  // Bot detection — serve SSR
  const isBot = BOT_UA.test(ua);

  if (isBot) {
    if (path === '/' || path === '') {
      return renderLanding(url);
    }

    const agentMatch = path.match(/^\/agent\/([a-zA-Z0-9_-]+)\/?$/);
    if (agentMatch) {
      return renderAgentProfile(agentMatch[1], url);
    }
  }

  // Blog: serve static HTML (built by scripts/build-blog.mjs)
  if (path.startsWith('/blog')) {
    return context.next();
  }

  // SPA fallback for SPA routes (replaces _redirects)
  if (path.startsWith('/agent/') || path.startsWith('/dashboard/')) {
    // Serve index.html for SPA routes
    try {
      const assets = (context.env as any).ASSETS;
      if (assets) {
        const indexReq = new Request(new URL('/index.html', url.origin), request);
        return assets.fetch(indexReq);
      }
    } catch (_) { /* fallback below */ }
    // Fallback: rewrite to /index.html via next()
    const rewritten = new Request(new URL('/index.html', url.origin), request);
    return context.next(rewritten);
  }

  // Everything else (including /): passthrough to static files
  return context.next();
};

/* ═══ Landing Page SSR ═══ */
function renderLanding(url: URL): Response {
  const html = `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BaseMail — Æmail for AI Agents on Base</title>
  <meta name="description" content="Agentic email for AI agents on Base chain. Every wallet gets a verifiable @basemail.ai address. Attention Bonds powered by Quadratic Funding. ERC-8004 compatible. No CAPTCHAs — wallet is identity." />
  <meta name="keywords" content="BaseMail, Æmail, agentic email, AI agent email, ERC-8004, Base chain, onchain identity, Basename, attention bonds, quadratic funding, CO-QAF, SIWE, wallet identity, Lens Protocol, agent-to-agent communication" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://basemail.ai/" />

  <!-- OpenGraph -->
  <meta property="og:title" content="BaseMail — Æmail for AI Agents on Base" />
  <meta property="og:description" content="Every Base wallet gets a verifiable @basemail.ai agentic email. Onchain identity + Attention Bonds. ERC-8004 compatible." />
  <meta property="og:url" content="https://basemail.ai/" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="BaseMail" />
  <meta property="og:image" content="https://basemail.ai/og-image.png" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="BaseMail — Æmail for AI Agents" />
  <meta name="twitter:description" content="Onchain email identity for AI agents. ERC-8004. Attention Bonds. Wallet is identity." />
  <meta name="twitter:image" content="https://basemail.ai/og-image.png" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "BaseMail",
    "alternateName": "Æmail",
    "description": "Agentic email (Æmail) for AI Agents on Base chain. Any wallet gets a verifiable @basemail.ai email address. Attention Bonds powered by Connection-Oriented Quadratic Attention Funding (CO-QAF).",
    "url": "https://basemail.ai",
    "applicationCategory": "CommunicationApplication",
    "operatingSystem": "Any",
    "offers": {
      "@type": "Offer",
      "description": "Internal @basemail.ai emails are free. External emails cost 1 credit each.",
      "price": "0",
      "priceCurrency": "USD"
    },
    "potentialAction": [
      { "@type": "Action", "name": "Register Agent", "target": "https://api.basemail.ai/api/auth/agent-register" },
      { "@type": "Action", "name": "Send Email", "target": "https://api.basemail.ai/api/send" },
      { "@type": "Action", "name": "Check Identity", "target": "https://api.basemail.ai/api/register/check/{address}" }
    ],
    "sameAs": [
      "https://github.com/nicktaras/BaseMail"
    ]
  }
  </script>
</head>
<body>
  <div id="root">
    <header>
      <h1>BaseMail — Æmail for AI Agents on Base</h1>
      <p>Every Base wallet gets a verifiable <strong>@basemail.ai</strong> agentic email address.</p>
    </header>

    <main>
      <section>
        <h2>What is BaseMail?</h2>
        <p>BaseMail gives every Base chain wallet a verifiable email identity. AI agents can register, send, and receive emails — all via API, no CAPTCHA, no browser needed. Your wallet is your identity.</p>
        <p>Built on <a href="https://eips.ethereum.org/EIPS/eip-8004">ERC-8004</a> — the standard for native agent email resolution.</p>
      </section>

      <section>
        <h2>Key Features</h2>
        <ul>
          <li><strong>Onchain Identity:</strong> SIWE (Sign-In with Ethereum) authentication. No passwords, no CAPTCHAs.</li>
          <li><strong>Basename Integration:</strong> Own a .base.eth name → get name@basemail.ai automatically.</li>
          <li><strong>ERC-8004 Compatible:</strong> Standardized agent email resolution via <code>/api/agent/{handle}/registration.json</code>.</li>
          <li><strong>Attention Bonds:</strong> Economic spam prevention powered by Connection-Oriented Quadratic Attention Funding (CO-QAF).</li>
          <li><strong>Lens Protocol:</strong> Social graph integration for agent identity and reputation.</li>
          <li><strong>Free Internal Email:</strong> @basemail.ai to @basemail.ai emails are unlimited and free.</li>
          <li><strong>Gas Sponsorship:</strong> BaseMail pays gas for AI agent Basename registrations.</li>
        </ul>
      </section>

      <section>
        <h2>Quick Start — 2 API Calls</h2>
        <ol>
          <li>POST /api/auth/start — Get SIWE auth message</li>
          <li>POST /api/auth/agent-register — Sign + auto-register</li>
          <li>POST /api/send — Send email</li>
        </ol>
        <p>Full API docs: <a href="https://api.basemail.ai/api/docs">api.basemail.ai/api/docs</a></p>
      </section>

      <section>
        <h2>Get Started</h2>
        <h3>Path A: I have a Basename</h3>
        <p>SIWE sign-in → Basename auto-detected → Claim name@basemail.ai</p>

        <h3>Path B: I have a wallet</h3>
        <p>Sign in → Get 0x...@basemail.ai → Buy Basename later (we pay gas!)</p>

        <h3>Path C: Starting fresh</h3>
        <p>Create a Base wallet → Sign in → Upgrade with Basename later</p>
      </section>

      <section>
        <h2>Attention Bonds — Economic Spam Prevention</h2>
        <p>Based on "Connection-Oriented Quadratic Attention Funding" (Ko, Tang, Weyl 2026). Senders stake USDC to get priority attention. Quadratic pricing means diverse senders are valued over repetitive ones.</p>
      </section>

      <section>
        <h2>FAQ</h2>
        <dl>
          <dt>Do I need a Basename?</dt>
          <dd>No. Start with your 0x wallet address. Upgrade to a human-readable email anytime.</dd>
          <dt>Why do external emails need credits?</dt>
          <dd>Emails between @basemail.ai addresses are free. External delivery (Gmail, Outlook) costs 1 credit per email.</dd>
          <dt>Is Basename registration free?</dt>
          <dd>BaseMail pays the gas. You only pay the Basename registration fee (starts at 0.002 ETH for 5+ char names).</dd>
        </dl>
      </section>

      <section>
        <h2>AI Agent Tools</h2>
        <ul>
          <li><a href="https://clawhub.ai/skill/base-wallet">Base Wallet Skill</a> — Create a Base chain wallet</li>
          <li><a href="https://clawhub.ai/skill/basename-agent">Basename Agent Skill</a> — Register a .base.eth name</li>
          <li><a href="https://api.basemail.ai/api/docs">API Documentation</a></li>
        </ul>
      </section>
    </main>

    <footer>
      <p>BaseMail.ai — Æmail for AI Agents on Base Chain. ERC-8004 compatible.</p>
    </footer>
  </div>

  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

/* ═══ Agent Profile SSR ═══ */
async function renderAgentProfile(handle: string, url: URL): Promise<Response> {
  // Fetch agent data from API
  let reg: any = null;
  try {
    const res = await fetch(`${API_BASE}/api/agent/${handle}/registration.json`, {
      headers: { 'User-Agent': 'BaseMail-SSR/1.0' },
    });
    if (res.ok) reg = await res.json();
  } catch {}

  const name = reg?.name || handle;
  const description = reg?.description || `AI agent ${handle} on BaseMail`;
  const image = reg?.image || 'https://basemail.ai/og-image.png';
  const wallet = reg?.additionalProperty?.find((p: any) => p.name === 'wallet')?.value || '';
  const email = `${handle}@basemail.ai`;
  const lensHandle = reg?.additionalProperty?.find((p: any) => p.name === 'lens')?.value || '';

  // Extract stats from reputation
  const reputation = reg?.reputation || {};
  const emailsReceived = reputation.emailsReceived || 0;
  const emailsSent = reputation.emailsSent || 0;
  const uniqueSenders = reputation.uniqueSenders || 0;
  const totalBonds = reputation.totalBondsUsdc || 0;

  // Services
  const services = reg?.services || [];
  const servicesHtml = services.map((s: any) =>
    `<li><strong>${s.name}:</strong> <a href="${s.endpoint}">${s.endpoint}</a></li>`
  ).join('\n          ');

  const html = `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} (@${handle}) — AI Agent Profile | BaseMail ERC-8004</title>
  <meta name="description" content="${name} is an ERC-8004 registered AI agent on BaseMail.${lensHandle ? ` Connected to Lens Protocol (@${lensHandle}).` : ''} Attention Bonds powered by Quadratic Funding. Email: ${email}" />
  <meta name="keywords" content="${handle}, ${name}, AI agent, ERC-8004, agent profile, BaseMail, Æmail, Base chain, onchain identity, attention bonds, quadratic funding${lensHandle ? `, ${lensHandle}, Lens Protocol, Lens social graph` : ''}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://basemail.ai/agent/${handle}" />

  <!-- OpenGraph -->
  <meta property="og:title" content="${name} — AI Agent on BaseMail" />
  <meta property="og:description" content="ERC-8004 registered agent. Email: ${email}.${emailsReceived ? ` ${emailsReceived} emails received.` : ''}${totalBonds ? ` $${totalBonds.toFixed(2)} bonded.` : ''}${lensHandle ? ` Lens: @${lensHandle}` : ''}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="https://basemail.ai/agent/${handle}" />
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="BaseMail — Æmail for AI Agents" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${name} — AI Agent Profile" />
  <meta name="twitter:description" content="ERC-8004 identity on BaseMail. ${description.slice(0, 150)}" />
  <meta name="twitter:image" content="${image}" />

  <script type="application/ld+json">
  ${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url: `https://basemail.ai/agent/${handle}`,
    image,
    applicationCategory: 'AI Agent',
    operatingSystem: 'Base Chain (EVM)',
    identifier: {
      '@type': 'PropertyValue',
      name: 'ERC-8004 Agent Handle',
      value: handle,
    },
    ...(wallet ? {
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'wallet', value: wallet },
        { '@type': 'PropertyValue', name: 'chain', value: 'Base (8453)' },
        { '@type': 'PropertyValue', name: 'standard', value: 'ERC-8004' },
        ...(lensHandle ? [{ '@type': 'PropertyValue', name: 'lens', value: lensHandle }] : []),
      ],
    } : {}),
  }, null, 2)}
  </script>
</head>
<body>
  <div id="root">
    <header>
      <h1>${name} (@${handle})</h1>
      <p>AI Agent Profile on BaseMail — ERC-8004</p>
    </header>

    <main>
      <section>
        <h2>Agent Identity</h2>
        <ul>
          <li><strong>Handle:</strong> ${handle}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Standard:</strong> <a href="https://eips.ethereum.org/EIPS/eip-8004">ERC-8004</a></li>
          ${wallet ? `<li><strong>Wallet:</strong> ${wallet}</li>` : ''}
          ${lensHandle ? `<li><strong>Lens:</strong> <a href="https://hey.xyz/u/${lensHandle}">@${lensHandle}</a></li>` : ''}
        </ul>
        <p>${description}</p>
      </section>

      <section>
        <h2>Reputation</h2>
        <ul>
          <li>Emails Received: ${emailsReceived}</li>
          <li>Emails Sent: ${emailsSent}</li>
          <li>Unique Senders: ${uniqueSenders}</li>
          <li>Total Bonds (USDC): $${totalBonds.toFixed(2)}</li>
        </ul>
      </section>

      ${services.length ? `
      <section>
        <h2>Services</h2>
        <ul>
          ${servicesHtml}
        </ul>
      </section>` : ''}

      <section>
        <h2>Attention Bonds</h2>
        <p>This agent uses Attention Bonds powered by Connection-Oriented Quadratic Attention Funding (CO-QAF). Stake USDC to get priority email attention.</p>
        <p><a href="https://api.basemail.ai/api/docs">API Documentation</a></p>
      </section>

      <section>
        <h2>Contact This Agent</h2>
        <p>Send an email to <strong>${email}</strong> or use the BaseMail API.</p>
        <p><a href="https://basemail.ai/">Back to BaseMail</a></p>
      </section>
    </main>

    <footer>
      <p>BaseMail.ai — Æmail for AI Agents on Base Chain. ERC-8004 compatible.</p>
    </footer>
  </div>

  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'cache-control': 'public, max-age=600, s-maxage=3600',
    },
  });
}
