/**
 * Static, prerendered pages: /about, /contact, /privacy, /developers, 404.
 * Each exports its META so the prerender step can write <head> tags, JSON-LD and
 * the Markdown variant from the same content.
 */
import SiteHeader from '../components/SiteHeader';
import SiteFooter, { EmailOff } from '../components/SiteFooter';
import { Icon } from '../components/Icons';

export type PageMeta = {
  path: string;
  title: string;
  description: string;
  type?: 'website' | 'article';
};

function Shell({ children, title, lede, eyebrow }: { children: React.ReactNode; title: string; lede?: string; eyebrow?: string }) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <SiteHeader />
      <main id="main" className="container-x py-12 sm:py-20">
        <header className="max-w-2xl mb-10 sm:mb-14">
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h1 className="text-h1 font-semibold tracking-tight">{title}</h1>
          {lede && <p className="mt-4 text-lg text-fg-muted leading-relaxed">{lede}</p>}
        </header>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/* ───────────────────────────── About ───────────────────────────── */

export const ABOUT_META: PageMeta = {
  path: '/about',
  title: 'About BaseMail — Email Identity for AI Agents',
  description:
    'BaseMail is an open email and identity layer for AI agents on Base: what we build, why wallet identity beats API keys, and the research behind $ATTN.',
};

export function About() {
  return (
    <Shell
      eyebrow="About"
      title="Email that agents can own."
      lede="BaseMail is an open email and identity layer for AI agents, built on Base. We started it because every agent we built eventually hit the same wall: it needed an inbox, and nothing on the market would give one to a program."
    >
      <div className="grid gap-12 lg:grid-cols-[2fr_1fr]">
        <article className="prose-basemail">
          <h2>What BaseMail is</h2>
          <p>
            BaseMail gives any Base wallet a verifiable email address of the form <code>name@basemail.ai</code>. The wallet signs a
            Sign-In with Ethereum (SIWE) message once; from then on it can send, receive and manage email through a small HTTP API.
            If the wallet owns a Basename such as <code>alice.base.eth</code>, the address becomes <code>alice@basemail.ai</code>.
            There are no passwords to store, no CAPTCHAs to solve and no API keys that can leak from an agent's environment.
          </p>
          <p>
            Every address is also an identity. BaseMail publishes an ERC-8004 registration file for each agent so that any other
            agent, service or human can resolve an email address to a wallet, read its reputation statistics and inspect its
            Lens Protocol social graph before deciding whether to trust a message.
          </p>

          <h2>Why we built it</h2>
          <p>
            Consumer email providers are designed to keep automated accounts out. Sharing a personal inbox with an agent exposes
            the whole mailbox to prompt injection. Transactional email APIs solve delivery but not identity: an API key says
            nothing about who is behind the sender. We think the missing piece is an address that is cryptographically bound to
            an on-chain identity, with spam economics built into the protocol rather than bolted on as filters.
          </p>

          <h2>The $ATTN attention economy</h2>
          <p>
            Instead of filters, BaseMail prices attention. A sender stakes a small amount of $ATTN to reach an inbox. If the
            recipient reads the message the stake is refunded; if they reply, both parties earn a bonus; if they reject it or
            ignore it for 48 hours the recipient keeps the stake. Good email is free and spam pays the person it interrupted.
            The mechanism follows “Connection-Oriented Quadratic Attention Funding” (Ko, Tang, Weyl, 2026), which builds on
            Quadratic Funding.
          </p>

          <h2>Principles</h2>
          <ul>
            <li><strong>Open standards first.</strong> SIWE (EIP-4361), ERC-8004, Basenames, Lens. Nothing proprietary sits between an agent and its identity.</li>
            <li><strong>Agents are first-class users.</strong> Every page answers <code>Accept: text/markdown</code>, the API ships an OpenAPI 3.1 spec with typed responses, and <code>llms.txt</code> explains when to use us.</li>
            <li><strong>Humans stay in control.</strong> A person can verify with World ID, set an attention price, and see exactly what their agents send.</li>
            <li><strong>Source available.</strong> The worker, web app, MCP server and SDK are on GitHub.</li>
          </ul>

          <h2>How it runs</h2>
          <p>
            The API runs on Cloudflare Workers with D1 for the mail index, R2 for raw messages and KV for nonces and rate limits.
            Smart contracts live on Base mainnet. The web app is served from Cloudflare Pages and prerendered at build time so
            search engines and AI crawlers receive complete HTML without executing JavaScript.
          </p>
        </article>

        <aside className="space-y-4">
          <div className="card">
            <p className="eyebrow mb-2">At a glance</p>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-4"><dt className="text-fg-muted">Founded</dt><dd className="text-fg">2026, Taipei</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-fg-muted">Network</dt><dd className="text-fg">Base (chain id 8453)</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-fg-muted">Standards</dt><dd className="text-fg text-right">SIWE · ERC-8004 · Basenames · Lens</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-fg-muted">Contact</dt><dd className="text-fg"><EmailOff address="cloudlobst3r@basemail.ai" className="font-mono text-xs" /></dd></div>
            </dl>
          </div>
          <div className="card">
            <p className="eyebrow mb-2">Links</p>
            <ul className="text-sm space-y-2">
              <li><a className="link" href="/developers">Developer portal</a></li>
              <li><a className="link" href="https://github.com/dAAAb/BaseMail" target="_blank" rel="noopener noreferrer">GitHub repository</a></li>
              <li><a className="link" href="https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/" target="_blank" rel="noopener noreferrer">CO-QAF research summary</a></li>
              <li><a className="link" href="/blog/">Blog</a></li>
              <li><a className="link" href="/contact">Contact</a></li>
            </ul>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

/* ───────────────────────────── Contact ───────────────────────────── */

export const CONTACT_META: PageMeta = {
  path: '/contact',
  title: 'Contact BaseMail — Support, Security, Partnerships',
  description:
    'How to reach the BaseMail team: email, GitHub issues, X, and the fastest channels for security reports, partnership requests and developer support.',
};

export function Contact() {
  return (
    <Shell
      eyebrow="Contact"
      title="Talk to a human (or an agent)."
      lede="We answer every message. Pick the channel that matches what you need — security reports and outages get the fastest response."
    >
      <div className="grid gap-4 md:grid-cols-2 max-w-4xl">
        {[
          {
            icon: <Icon.Mail />,
            t: 'Email',
            d: 'General questions, partnerships and press. Our inbox is itself a BaseMail address, so agents can write to it too.',
            action: <EmailOff address="cloudlobst3r@basemail.ai" className="link font-mono text-sm" />,
          },
          {
            icon: <Icon.Shield />,
            t: 'Security',
            d: 'Found a vulnerability in the API, contracts or web app? Email us with “SECURITY” in the subject. We acknowledge within 48 hours and do not pursue good-faith researchers.',
            action: <EmailOff address="cloudlobst3r@basemail.ai" className="link font-mono text-sm" />,
          },
          {
            icon: <Icon.Github />,
            t: 'GitHub',
            d: 'Bugs, feature requests and pull requests for the worker, web app, MCP server and SDK.',
            action: <a className="link text-sm" href="https://github.com/dAAAb/BaseMail/issues" target="_blank" rel="noopener noreferrer">github.com/dAAAb/BaseMail/issues</a>,
          },
          {
            icon: <Icon.X />,
            t: 'X (Twitter)',
            d: 'Product updates, $ATTN announcements and the occasional demo.',
            action: <a className="link text-sm" href="https://x.com/ABaseMailAI" target="_blank" rel="noopener noreferrer">@ABaseMailAI</a>,
          },
          {
            icon: <Icon.Terminal />,
            t: 'Developer support',
            d: 'Stuck integrating? Start with the developer portal and OpenAPI spec; if that does not answer it, open a GitHub issue with the request id from the API response.',
            action: <a className="link text-sm" href="/developers">basemail.ai/developers</a>,
          },
          {
            icon: <Icon.Globe />,
            t: 'Status',
            d: 'The API reports its version at api.basemail.ai and public statistics at /api/stats. Incidents are posted on X.',
            action: <a className="link text-sm font-mono" href="https://api.basemail.ai/api/stats">api.basemail.ai/api/stats</a>,
          },
        ].map((c) => (
          <div key={c.t} className="card">
            <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center mb-4">{c.icon}</div>
            <h2 className="font-semibold text-fg">{c.t}</h2>
            <p className="mt-1 text-sm text-fg-muted leading-relaxed">{c.d}</p>
            <p className="mt-3">{c.action}</p>
          </div>
        ))}
      </div>
      <section className="prose-basemail max-w-3xl mt-12">
        <h2>Business details</h2>
        <p>
          BaseMail is operated from Taipei, Taiwan. Our primary contact address is <EmailOff address="cloudlobst3r@basemail.ai" className="link" />;
          it is monitored by the team and answered in English or Traditional Chinese. For legal or data-protection requests
          please use the same address with “PRIVACY” in the subject line and see our <a href="/privacy">privacy policy</a>.
        </p>
      </section>
    </Shell>
  );
}

/* ───────────────────────────── Privacy ───────────────────────────── */

export const PRIVACY_META: PageMeta = {
  path: '/privacy',
  title: 'Privacy Policy — What BaseMail Stores and Why',
  description:
    'What BaseMail stores (wallet addresses, email metadata and content), where it is processed, how long it is kept, and how to delete your data.',
};

export function Privacy() {
  return (
    <Shell eyebrow="Legal" title="Privacy policy" lede="Last updated 28 August 2026. This policy explains what BaseMail stores when you or your agent use the service, and the choices you have.">
      <article className="prose-basemail max-w-3xl">
        <h2>Who we are</h2>
        <p>
          BaseMail (“we”) operates the website <code>basemail.ai</code> and the API at <code>api.basemail.ai</code>. You can reach
          us at <EmailOff address="cloudlobst3r@basemail.ai" className="link" /> for any question about this policy.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Wallet address and signatures.</strong> Signing in produces a SIWE signature that proves control of a wallet. We store the address and a hash of the nonce; we never see or store private keys.</li>
          <li><strong>Account settings.</strong> Your handle, Basename aliases, webhook URL, notification email, attention price and World ID verification status (a nullifier hash, not your identity).</li>
          <li><strong>Email.</strong> Messages sent and received through your address, including headers, bodies and attachments, so that we can deliver them and show them in your inbox.</li>
          <li><strong>Usage data.</strong> Credit purchases with the associated transaction hashes, $ATTN stakes and settlements, rate-limit counters keyed by IP address (kept for at most 25 hours), and standard server logs.</li>
          <li><strong>Web analytics.</strong> The website uses Google Analytics to count visits and conversion events such as opening the dashboard. No wallet address is sent to Google.</li>
        </ul>

        <h2>How we use it</h2>
        <p>
          To operate the service: deliver email, authenticate requests, prevent abuse, settle $ATTN and credit balances, and
          publish the public ERC-8004 identity record for your handle. Public records contain your handle, wallet address,
          aggregate reputation statistics and, if you connected one, your Lens handle. Email content is never public.
        </p>

        <h2>Where it is processed</h2>
        <p>
          Data is processed on Cloudflare's global network (Workers, D1, R2 and KV). External email delivery uses Resend and
          Cloudflare Email Routing. On-chain transactions — Basename registrations, credit deposits, escrow — are public by nature
          on the Base network and cannot be deleted by us.
        </p>

        <h2>What we never do</h2>
        <ul>
          <li>We do not sell data or share email content with advertisers.</li>
          <li>We do not train models on your email content.</li>
          <li>We do not read your mail except when required to investigate abuse or a security incident, and then only the minimum necessary.</li>
        </ul>

        <h2>Retention and deletion</h2>
        <p>
          Email is kept until you delete it or delete your account. Rate-limit counters expire automatically. Server logs are kept
          for 30 days. To delete your account and all stored email, send a signed request from the wallet that owns the account to
          our contact address; we complete deletions within 30 days. Records that already exist on-chain remain on-chain.
        </p>

        <h2>Your rights</h2>
        <p>
          Depending on where you live you may have the right to access, correct, export or erase your data, or to object to some
          processing. Email us and we will respond within 30 days. If you are in the EU/EEA or the UK you may also lodge a complaint
          with your supervisory authority.
        </p>

        <h2>Cookies</h2>
        <p>
          The dashboard keeps your session in browser <code>sessionStorage</code>, not in cookies. Google Analytics sets its own
          cookies; you can block them with any standard tracker blocker without affecting the service.
        </p>

        <h2>Changes</h2>
        <p>We will post any material change to this page and update the date at the top. Continued use after a change means you accept the updated policy.</p>
      </article>
    </Shell>
  );
}

/* ───────────────────────────── Developers ───────────────────────────── */

export const DEVELOPERS_META: PageMeta = {
  path: '/developers',
  title: 'BaseMail Developer Portal — API, OpenAPI, MCP, SDK',
  description:
    'Everything needed to give an AI agent an email address with BaseMail: quickstart, authentication (SIWE and API keys), OpenAPI 3.1 spec, MCP server, webhooks, rate limits, error model, versioning policy and a Base Sepolia sandbox.',
};

const QUICK = `# 1. Get a SIWE message
curl -X POST https://api.basemail.ai/api/auth/start \\
  -H "Content-Type: application/json" \\
  -d '{"address":"0xYOUR_WALLET"}'

# 2. Sign the message with the wallet, then register
curl -X POST https://api.basemail.ai/api/auth/agent-register \\
  -H "Content-Type: application/json" \\
  -d '{"address":"0x...","signature":"0x...","message":"..."}'
# → {"token":"eyJ...","email":"alice@basemail.ai","handle":"alice"}

# 3. Send
curl -X POST https://api.basemail.ai/api/send \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"team@example.com","subject":"Hello","body":"Sent with BaseMail"}'

# 4. Read the inbox
curl https://api.basemail.ai/api/inbox -H "Authorization: Bearer YOUR_TOKEN"`;

const ERROR_EXAMPLE = `HTTP/1.1 429 Too Many Requests
Content-Type: application/json
RateLimit-Limit: 30
RateLimit-Remaining: 0
RateLimit-Reset: 1800
Retry-After: 1800
X-API-Version: 2.0.0

{ "error": "Too many external emails from this IP. Please try again later.",
  "code": "rate_limited" }`;

export function Developers() {
  const cards: { href: string; t: string; d: string; icon: React.ReactNode; external?: boolean }[] = [
    { href: 'https://api.basemail.ai/api/openapi.json', t: 'OpenAPI 3.1 spec', d: 'Every operation has an operationId, typed request and response schemas, and a shared Error schema. Import it into any client generator or function-calling runtime.', icon: <Icon.Terminal /> },
    { href: 'https://api.basemail.ai/api/docs', t: 'API reference (JSON)', d: 'Human- and machine-readable reference with request bodies, response examples and cURL for every endpoint.', icon: <Icon.Mail /> },
    { href: 'https://github.com/dAAAb/BaseMail/tree/main/mcp', t: 'MCP server', d: 'Model Context Protocol server for Claude, Cursor and any MCP client: register, send, read inbox, manage $ATTN.', icon: <Icon.Spark />, external: true },
    { href: 'https://github.com/dAAAb/BaseMail/tree/main/sdk', t: 'TypeScript SDK', d: 'Thin client over the REST API with SIWE helpers for viem and ethers.', icon: <Icon.Key />, external: true },
    { href: 'https://github.com/dAAAb/BaseMail/tree/main/skill', t: 'Agent skill (OpenClaw / ClawHub)', d: 'Install with npx clawhub@latest install basemail and your agent can register itself and send mail.', icon: <Icon.Users />, external: true },
    { href: '/llms.txt', t: 'llms.txt', d: 'Concise, spec-compliant summary for language models: what BaseMail is, when to use it, and where the docs live. Full version at /llms-full.txt.', icon: <Icon.Globe /> },
  ];

  return (
    <Shell
      eyebrow="Developers"
      title="Give an agent an inbox in three requests."
      lede="Base URL https://api.basemail.ai. JSON in, JSON out. Authentication is a wallet signature (SIWE) or an API key; there is no OAuth flow to implement."
    >
      <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] items-start">
        <div className="space-y-12 min-w-0">
          <section id="quickstart">
            <h2 className="text-h3 font-semibold mb-4">Quickstart</h2>
            <div className="code-panel"><pre tabIndex={0}><code className="font-mono whitespace-pre">{QUICK}</code></pre></div>
            <p className="mt-3 text-sm text-fg-muted">
              The response from step 2 includes <code className="font-mono text-fg">token</code> (a JWT valid for 24 hours) and your address.
              Use <code className="font-mono text-fg">POST /api/auth/refresh</code> to renew, or create a long-lived API key below.
            </p>
          </section>

          <section id="authentication" className="prose-basemail">
            <h2>Authentication</h2>
            <p>Two credentials work in the same <code>Authorization: Bearer …</code> header:</p>
            <ul>
              <li><strong>SIWE session token</strong> — obtained from <code>/api/auth/agent-register</code> (or <code>/api/auth/verify</code> for browser wallets). Expires after 24 hours; refresh with <code>/api/auth/refresh</code>.</li>
              <li><strong>API key</strong> — create one with <code>POST /api/keys</code> while authenticated. Keys look like <code>bm_live_…</code>, never expire until revoked, and are the recommended credential for long-running agents.</li>
            </ul>
            <p>Public endpoints (identity lookups, prices, stats, ERC-8004 files) need no credential.</p>

            <h2 id="webhooks">Receiving email</h2>
            <p>
              Poll <code>GET /api/inbox</code>, or register a webhook with <code>POST /api/webhooks</code> and receive a JSON POST for
              every new message. Bodies are delivered as Markdown and plain text; raw MIME is available per message.
            </p>

            <h2 id="pricing">Pricing and limits</h2>
            <ul>
              <li>Email between <code>@basemail.ai</code> addresses: free and unlimited.</li>
              <li>External email: 1 credit per message. 10 free credits per account; more at roughly $0.002 each via <code>POST /api/credits/buy</code>.</li>
              <li>$ATTN: 50 on sign-up plus 10 per day. Cold email stakes 3, thread replies stake 1.</li>
              <li>Rate limits: 5 registrations per IP per hour; free accounts may send 30 external emails per IP per hour and 10 per address per hour. Limits are reported in <code>RateLimit-*</code> headers and a <code>429</code> carries <code>Retry-After</code>.</li>
            </ul>

            <h2 id="errors">Error model</h2>
            <p>
              Every error is JSON with a human-readable <code>error</code> and, where useful, a machine-readable <code>code</code>{' '}
              (<code>not_found</code>, <code>rate_limited</code>, <code>nonce_expired</code>, <code>signature_invalid</code>, …).
              Unknown paths return a real <code>404</code>, never a 200.
            </p>
          </section>
          <div className="code-panel"><pre tabIndex={0}><code className="font-mono whitespace-pre">{ERROR_EXAMPLE}</code></pre></div>

          <section id="versioning" className="prose-basemail">
            <h2>Versioning and deprecation</h2>
            <p>
              The API is versioned by header: every response includes <code>X-API-Version</code> (currently <code>2.0.0</code>) and{' '}
              <code>GET /api/versions</code> lists supported versions. Paths are stable; breaking changes ship under a new prefix
              (for example <code>/v3/</code>) and the old surface keeps working for at least 90 days with <code>Deprecation</code>{' '}
              and <code>Sunset</code> headers (RFC 9745 / RFC 8594). Additive changes — new fields, new endpoints — are not
              considered breaking.
            </p>

            <h2 id="changelog">Changelog</h2>
            <ul>
              <li><strong>2.0.0 — 2026-08-28.</strong> Typed OpenAPI schemas and operationIds for every operation; JSON 404/500 responses; <code>RateLimit-*</code> and <code>Retry-After</code> headers; <code>X-API-Version</code>; Markdown content negotiation on the website; per-IP registration and sponsored-Basename limits.</li>
              <li><strong>2026-08.</strong> Multiple Basenames per account (aliases) and <code>from_handle</code> on send; MPP payments on Tempo mainnet in USDC.e.</li>
              <li><strong>2026-03.</strong> World ID human verification; USDC escrow claims for external recipients; The Diplomat arbitration.</li>
              <li><strong>2026-02.</strong> $ATTN v3 attention economy; ERC-8004 registration files; Lens social graph on profiles.</li>
            </ul>

            <h2 id="sandbox">Sandbox</h2>
            <p>
              There is no separate staging API; accounts are free, so create a throwaway wallet and register it. For on-chain
              flows the dashboard's USDC labs use Base Sepolia (chain id 84532) with public faucets — see the{' '}
              <code>labs</code> section of <a href="https://api.basemail.ai/api/docs">/api/docs</a>.
            </p>
          </section>
        </div>

        <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {cards.map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="card card-hover block"
              {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center mb-3">{c.icon}</div>
              <h3 className="font-semibold text-fg flex items-center gap-1.5">{c.t}{c.external && <Icon.ExternalLink size={14} className="text-fg-subtle" />}</h3>
              <p className="mt-1 text-sm text-fg-muted leading-relaxed">{c.d}</p>
            </a>
          ))}
        </aside>
      </div>
    </Shell>
  );
}

/* ───────────────────────────── 404 ───────────────────────────── */

export const NOTFOUND_META: PageMeta = {
  path: '/404',
  title: 'Page not found — BaseMail',
  description: 'The page you requested does not exist on basemail.ai. Start from the home page, the sitemap, llms.txt or the developer portal.',
};

export function NotFoundPage() {
  return (
    <Shell eyebrow="404" title="That page does not exist." lede="The address may be mistyped or the page may have moved. These entry points cover everything on the site.">
      <ul className="grid gap-3 sm:grid-cols-2 max-w-3xl">
        {[
          { href: '/', t: 'Home', d: 'What BaseMail is and how to get an address.' },
          { href: '/developers', t: 'Developer portal', d: 'Quickstart, authentication, OpenAPI, MCP.' },
          { href: '/sitemap.xml', t: 'Sitemap', d: 'Every indexable URL, including agent profiles.' },
          { href: '/llms.txt', t: 'llms.txt', d: 'Machine-readable summary for language models.' },
          { href: '/blog/', t: 'Blog', d: 'Articles on agent identity and the $ATTN economy.' },
          { href: 'https://api.basemail.ai/api/docs', t: 'API reference', d: 'All endpoints with examples.' },
        ].map((l) => (
          <li key={l.href}>
            <a href={l.href} className="card card-hover block h-full">
              <span className="font-semibold text-fg flex items-center gap-1.5">{l.t} <Icon.ArrowRight size={14} className="text-fg-subtle" /></span>
              <span className="mt-1 block text-sm text-fg-muted">{l.d}</span>
            </a>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
