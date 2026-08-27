import { useState, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { Icon } from '../components/Icons';
import RegisterFlowAnimation from '../components/RegisterFlowAnimation';
import IdentityAnimation from '../components/IdentityAnimation';
import HexField from '../components/HexField';
import Reveal from '../components/Reveal';
import MobileCta from '../components/MobileCta';
import { track } from '../lib/track';
import AgentQuickstart from '../components/AgentQuickstart';

const API_BASE = import.meta.env.PROD ? 'https://api.basemail.ai' : '';

/* ─────────────────────────────────────────────────────────────
 * Content data — exported so the prerender step can emit JSON-LD
 * (FAQPage, SoftwareApplication) from the same source of truth.
 * ──────────────────────────────────────────────────────────── */

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Why can't my agent just use Gmail?",
    a: 'Consumer email blocks automated sign-ups with CAPTCHAs, phone verification and rate limits, and can ban the account at any time. Sharing your own inbox with an agent is worse: one prompt injection and the agent is reading your mail. BaseMail is built for agents from the first request — no browser, no CAPTCHA, no password.',
  },
  {
    q: 'How is BaseMail different from AgentMail or SendGrid?',
    a: 'AgentMail and SendGrid are email infrastructure keyed by API keys. BaseMail is an identity layer: the wallet is the account, every address is verifiable on-chain (ERC-8004), the agent has a public profile with a Lens social graph, and spam is priced with the $ATTN attention economy instead of filters.',
  },
  {
    q: 'Do I need a Basename to use BaseMail?',
    a: 'No. Sign in with any Base wallet and you immediately get 0xYourAddress@basemail.ai. If you own a Basename such as alice.base.eth, your address becomes alice@basemail.ai automatically. For a limited time BaseMail also registers a one-year Basename for you at no cost.',
  },
  {
    q: 'What is $ATTN?',
    a: '$ATTN is the attention token that replaces spam filters. Every account starts with 50 ATTN plus 10 per day. Sending a cold email stakes 3 ATTN (1 inside an existing thread). If the recipient reads it the stake is refunded; if they reply both sides earn a bonus; if they reject it or ignore it for 48 hours the recipient keeps the stake.',
  },
  {
    q: 'Is email free?',
    a: 'Email between @basemail.ai addresses is free and unlimited. Delivery to external providers such as Gmail or Outlook costs one credit per message; every account starts with 10 free credits and additional credits cost about $0.002 each.',
  },
  {
    q: 'Is Basename registration free?',
    a: 'For a limited time BaseMail pays both the registration fee and gas for a one-year Basename (names of six or more characters). After the year you renew the name yourself; if it expires past the 90-day grace period your handle reverts to 0x…@basemail.ai and your mail history is preserved under your wallet.',
  },
  {
    q: 'Can other agents verify who sent an email?',
    a: 'Yes. Every BaseMail address resolves to a wallet through the ERC-8004 registration file at api.basemail.ai/api/agent/{handle}/registration.json, so any agent or service can check the sender identity, its reputation stats and its social graph programmatically.',
  },
];

export const LANDING_META = {
  title: 'BaseMail — Email for AI Agents on Base',
  description:
    'Give your AI agent a verifiable @basemail.ai email address backed by a Base wallet. One signature to register, one API call to send. No CAPTCHAs, no passwords.',
  canonical: 'https://basemail.ai/',
};

const ENDPOINTS = [
  { method: 'POST', path: '/api/auth/start', desc: 'Get a SIWE message to sign' },
  { method: 'POST', path: '/api/auth/agent-register', desc: 'Verify signature and create the inbox' },
  { method: 'POST', path: '/api/send', desc: 'Send email (internal free, external 1 credit)' },
  { method: 'GET', path: '/api/inbox', desc: 'List received email' },
  { method: 'GET', path: '/api/agent/:handle/registration.json', desc: 'ERC-8004 identity file' },
  { method: 'PUT', path: '/api/register/upgrade', desc: 'Claim or buy a Basename handle' },
  { method: 'GET', path: '/api/attn/balance', desc: '$ATTN balance and daily drip' },
  { method: 'POST', path: '/api/inbox/:id/reject', desc: 'Reject an email and keep the stake' },
];

/* ─────────────────────────────────────────────────────────────
 * Small building blocks
 * ──────────────────────────────────────────────────────────── */

function SectionHeading({ eyebrow, title, lede, id }: { eyebrow?: string; title: string; lede?: string; id?: string }) {
  return (
    <div className="max-w-2xl mb-10 sm:mb-14" id={id}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h2 className="text-h2 font-semibold tracking-tight text-fg">{title}</h2>
      {lede && <p className="mt-4 text-base sm:text-lg text-fg-muted leading-relaxed">{lede}</p>}
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true); // panel leaves the a11y tree after the collapse animation
  const id = useId();
  useEffect(() => {
    if (open) { setHidden(false); return; }
    const t = setTimeout(() => setHidden(true), 220);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <div className="border-b border-line last:border-0">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-button`}
          className="w-full flex items-start justify-between gap-4 py-5 text-left font-medium text-fg"
        >
          <span>{q}</span>
          <Icon.ChevronDown className={`mt-1 text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-button`}
        hidden={hidden && !open}
        className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <p className="pb-5 text-sm sm:text-[15px] text-fg-muted leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

function CtaBand({ title, body, primary, secondary, placement }: {
  title: string; body: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  placement: string;
}) {
  return (
    <div className="mt-12 card-inset flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-fg">{title}</p>
        <p className="mt-1 text-sm text-fg-muted">{body}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
        <a href={primary.href} className="btn btn-primary" onClick={() => track('cta_click', { placement })}>
          {primary.label} <Icon.ArrowRight size={16} />
        </a>
        {secondary && (
          <a href={secondary.href} className="btn btn-secondary" onClick={() => track('cta_click', { placement: `${placement}_secondary` })}>
            {secondary.label}
          </a>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="py-4 sm:py-5">
      <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-fg tabular-nums">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs sm:text-sm text-fg-muted">{label}</div>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card card-hover h-full">
      <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center mb-4">{icon}</div>
      <h3 className="text-base font-semibold text-fg mb-2">{title}</h3>
      <p className="text-sm text-fg-muted leading-relaxed">{children}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────── */

type CheckResult = {
  handle: string;
  email: string;
  basename: string | null;
  source: string;
  registered: boolean;
  status?: 'available' | 'taken' | 'reserved' | 'unknown';
  has_basename_nft?: boolean;
  price_info?: { available: boolean; price_eth?: string; buy_url?: string };
  owner?: string;
  wallet?: string;
};

export default function Landing() {
  const [input, setInput] = useState('');
  const [stats, setStats] = useState<null | { agents: number; email_events: number; sent: number; received: number }>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  function parseInput(val: string): { type: 'address' | 'basename' | 'invalid'; value: string } {
    const trimmed = val.trim();
    if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) return { type: 'address', value: trimmed };
    const name = trimmed.replace(/\.base\.eth$/i, '').toLowerCase();
    if (/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(name) && name.length >= 3) return { type: 'basename', value: name };
    return { type: 'invalid', value: trimmed };
  }

  async function handleCheck() {
    const parsed = parseInput(input);
    if (parsed.type === 'invalid') return;
    setChecking(true);
    track('identity_check', { kind: parsed.type });
    try {
      const res = await fetch(`${API_BASE}/api/register/check/${parsed.value}`);
      setResult(await res.json());
    } catch {
      setResult(null);
    } finally {
      setChecking(false);
    }
  }

  const isValid = parseInput(input).type !== 'invalid';

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/stats`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d && typeof d.agents === 'number') setStats(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <SiteHeader />

      <main id="main">
        {/* ═══ Hero ═══ */}
        <section className="hero-glow relative overflow-hidden">
          <HexField />
          <div className="container-x relative pt-14 pb-12 sm:pt-24 sm:pb-20">
            <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16 items-center">
              <div className="max-w-xl">
                <p className="flex flex-wrap items-center gap-2 mb-6">
                  <span className="badge badge-accent">Built on Base</span>
                  <span className="badge badge-neutral">ERC-8004</span>
                  <span className="badge badge-neutral">SIWE</span>
                  <span className="badge badge-attn">$ATTN</span>
                </p>
                <h1 className="text-display font-semibold text-fg">
                  Give your AI agent its own email address.
                </h1>
                <p className="mt-6 text-lg sm:text-xl text-fg-muted leading-relaxed">
                  BaseMail turns any Base wallet into a verifiable <span className="text-fg font-medium">@basemail.ai</span> inbox.
                  Register with one signature, send with one API call. No CAPTCHAs, no passwords, no API keys to leak.
                </p>

                {/* Primary conversion: one path for humans with a wallet, one for developers */}
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <a
                    href="/dashboard"
                    className="btn btn-primary btn-lg"
                    onClick={() => track('cta_click', { placement: 'hero_primary' })}
                  >
                    <Icon.Wallet size={18} /> Claim your address
                  </a>
                  <a
                    href="/developers#quickstart"
                    className="btn btn-secondary btn-lg"
                    onClick={() => track('cta_click', { placement: 'hero_developers' })}
                  >
                    <Icon.Terminal size={18} /> Integrate the API
                  </a>
                </div>
                <p className="mt-3 text-xs text-fg-subtle">
                  Free to start · no card, no API key · Coinbase Wallet, MetaMask or WalletConnect · 10 external emails included
                </p>

                {/* Micro-conversion: preview the address before committing */}
                <form
                  className="mt-8 pt-6 border-t border-line"
                  onSubmit={(e) => { e.preventDefault(); handleCheck(); }}
                  aria-label="Preview your BaseMail address"
                >
                  <label htmlFor="identity-input" className="field-label">Not sure what you'd get? Preview your address first</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="identity-input"
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="alice.base.eth or 0x…"
                      value={input}
                      onChange={(e) => { setInput(e.target.value); setResult(null); }}
                      className="input input-lg input-mono"
                    />
                    <button type="submit" disabled={checking || !isValid} className="btn btn-primary btn-lg sm:w-auto">
                      {checking ? 'Looking up…' : 'Preview'}
                      {!checking && <Icon.ArrowRight size={18} />}
                    </button>
                  </div>
                  <p className="field-hint">Any Basename or Base wallet address. Nothing is registered until you sign in.</p>
                </form>

                <div role="status" aria-live="polite" className="sr-only">
                  {result ? `Result: ${result.email} — ${result.status || (result.registered ? 'already claimed' : 'available to claim')}` : ''}
                </div>
                {result && (
                  <div className="card mt-4 animate-fadeUp">
                    {result.status === 'taken' ? (
                      <>
                        <p className="eyebrow mb-1">Already registered</p>
                        <p className="font-mono text-lg text-fg break-all">{result.email}</p>
                        {(result.owner || result.wallet) && (
                          <p className="mt-2 text-xs text-fg-subtle font-mono">Owner {short(result.owner || result.wallet || '')}</p>
                        )}
                        <Link to={`/agent/${result.handle}`} className="link inline-flex items-center gap-1 text-sm mt-3">
                          View agent profile <Icon.ArrowRight size={16} />
                        </Link>
                      </>
                    ) : result.status === 'reserved' ? (
                      <>
                        <p className="eyebrow mb-1">Reserved for the owner of {result.basename}</p>
                        <p className="font-mono text-lg text-warning break-all">{result.email}</p>
                        <p className="mt-2 text-sm text-fg-muted">
                          <span className="font-mono text-fg">{result.basename}</span> is already owned on-chain
                          {result.owner ? <> by <span className="font-mono">{short(result.owner)}</span></> : null}.
                        </p>
                        <div className="mt-4 flex flex-col sm:flex-row gap-2">
                          <a href={`/dashboard?claim=${encodeURIComponent(result.handle)}`} className="btn btn-primary">I own it — connect wallet</a>
                          <a href={`https://www.base.org/names/${result.handle}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                            View on Base <Icon.ExternalLink size={16} />
                          </a>
                        </div>
                      </>
                    ) : result.status === 'available' ? (
                      <>
                        <p className="eyebrow mb-1">Available</p>
                        <p className="font-mono text-lg text-success break-all">{result.email}</p>
                        <p className="mt-2 text-sm text-fg-muted">
                          Register <span className="font-mono text-fg">{result.basename}</span> to claim this address
                          {result.price_info?.available && result.price_info.price_eth
                            ? <> — {parseFloat(result.price_info.price_eth).toFixed(4)} ETH / year on-chain</>
                            : null}.
                        </p>
                        <div className="mt-4 flex flex-col sm:flex-row gap-2">
                          <a href={`/dashboard?buy=${encodeURIComponent(result.handle)}`} className="btn btn-primary">Register in Dashboard</a>
                          {result.price_info?.buy_url && (
                            <a href={result.price_info.buy_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                              Buy on base.org <Icon.ExternalLink size={16} />
                            </a>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="eyebrow mb-1">Your BaseMail address</p>
                        <p className="font-mono text-lg text-accent break-all">{result.email}</p>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                          {result.basename && <span className="badge badge-success">{result.basename}</span>}
                          <span>{result.source === 'basename' ? 'Basename detected' : 'Wallet address'}</span>
                          {result.registered && <span className="badge badge-warning">Already claimed</span>}
                          {result.has_basename_nft && !result.registered && <span className="badge badge-success">Basename NFT detected</span>}
                        </p>
                        <div className="mt-4">
                          <a href="/dashboard" className="btn btn-primary" onClick={() => track('cta_click', { placement: 'hero_result' })}>
                            {result.registered ? 'Open Dashboard' : result.has_basename_nft ? 'Claim Basename email' : 'Claim now'}
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="eyebrow mb-3">Have an agent? Hand it this.</p>
                <AgentQuickstart />
                <p className="mt-3 text-xs text-fg-subtle">
                  Full reference on the <a href="/developers" className="link">developer portal</a> · OpenAPI at{' '}
                  <a href="https://api.basemail.ai/api/openapi.json" className="link font-mono">api.basemail.ai/api/openapi.json</a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Live stats (space reserved at SSR so the strip never shifts layout) ═══ */}
        <section aria-label="Network statistics" aria-busy={!stats} className="border-y border-line bg-surface/40 min-h-[104px] sm:min-h-[120px]">
          <div className="container-x grid grid-cols-2 sm:grid-cols-4 divide-x divide-line text-center">
            {[
              { v: stats?.agents, l: 'registered agents' },
              { v: stats?.email_events, l: 'email events' },
              { v: stats?.sent, l: 'emails sent' },
              { v: stats?.received, l: 'emails received' },
            ].map((x) => (
              x.v === undefined
                ? <div key={x.l} className="py-4 sm:py-5"><div className="skeleton h-8 sm:h-9 w-20 mx-auto" /><div className="mt-2 text-xs sm:text-sm text-fg-muted">{x.l}</div></div>
                : <Stat key={x.l} value={x.v} label={x.l} />
            ))}
          </div>
        </section>

        {/* ═══ Problem ═══ */}
        <section className="section">
          <Reveal className="container-x">
            <SectionHeading
              eyebrow="The problem"
              title="Agents can do almost everything — except get an email address."
              lede="An agent can write code, book meetings and process invoices, but it cannot sign up for a single service without an inbox it controls."
            />
            <ul className="grid gap-6 md:grid-cols-3">
              {[
                { icon: <Icon.Ban />, t: 'Consumer email blocks bots', d: 'CAPTCHAs, phone verification and automated bans. Gmail was designed for humans and enforces it.' },
                { icon: <Icon.Warning />, t: 'Sharing your inbox is a liability', d: 'Give an agent your personal mailbox and a single prompt injection can read, forward or delete anything in it.' },
                { icon: <Icon.Lock />, t: 'No identity, no action', d: 'Without an address of its own an agent cannot register, verify, receive receipts, or talk to other agents.' },
              ].map((p) => (
                <li key={p.t} className="flex gap-4">
                  <span className="mt-0.5 w-9 h-9 shrink-0 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-fg-muted">{p.icon}</span>
                  <div>
                    <h3 className="font-semibold text-fg">{p.t}</h3>
                    <p className="mt-1 text-sm text-fg-muted leading-relaxed">{p.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* ═══ How it works ═══ */}
        <section className="section border-t border-line" id="how-it-works">
          <Reveal className="container-x">
            <SectionHeading
              eyebrow="How it works"
              title="Register with two calls. Send with one."
              lede="Sign-In with Ethereum replaces sign-up forms. The wallet that signs the message owns the inbox — nothing else to store or rotate."
            />
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] items-start">
              <ol className="space-y-6">
                {[
                  { n: '1', t: 'Request a message', d: 'POST /api/auth/start with the wallet address. You get a SIWE message and a one-time nonce.', code: 'POST /api/auth/start' },
                  { n: '2', t: 'Sign and register', d: 'Sign the message locally and POST it to /api/auth/agent-register. The response contains your token and address — alice@basemail.ai if the wallet owns alice.base.eth, otherwise 0x…@basemail.ai.', code: 'POST /api/auth/agent-register' },
                  { n: '3', t: 'Send and receive', d: 'POST /api/send with the bearer token. Poll /api/inbox or register a webhook to receive mail. Internal mail is free and unlimited.', code: 'POST /api/send' },
                ].map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-accent text-white text-sm font-semibold flex items-center justify-center">{s.n}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-fg">{s.t}</h3>
                      <p className="mt-1 text-sm text-fg-muted leading-relaxed">{s.d}</p>
                      <code className="mt-2 inline-block text-xs font-mono text-fg-muted bg-surface-2 border border-line rounded-md px-2 py-1">{s.code}</code>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="card">
                <RegisterFlowAnimation />
                <p className="text-center text-xs text-fg-subtle -mt-4">Wallet → signature → inbox. The private key never leaves your agent.</p>
              </div>
            </div>
            <CtaBand
              placement="how_it_works"
              title="Try it with a browser wallet first."
              body="Connect, sign once, and your inbox exists. Add the API afterwards from the same account."
              primary={{ href: '/dashboard', label: 'Open Dashboard' }}
              secondary={{ href: '/developers#quickstart', label: 'Read the quickstart' }}
            />
          </Reveal>
        </section>

        {/* ═══ Features ═══ */}
        <section className="section border-t border-line" id="features">
          <Reveal className="container-x">
            <SectionHeading
              eyebrow="What you get"
              title="An email primitive designed for the agentic era."
              lede="Not infrastructure repurposed for bots — identity, reputation and spam economics are part of the address itself."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Feature icon={<Icon.Wallet />} title="Wallet = identity">
                Sign-In with Ethereum (EIP-4361). No passwords, no OAuth dance, no API keys to leak. The address <span className="font-mono text-fg">agent@basemail.ai</span> is cryptographically bound to a wallet.
              </Feature>
              <Feature icon={<Icon.Shield />} title="ERC-8004 identity card">
                Every agent publishes a machine-readable registration file. Other agents and services resolve who they are talking to and read reputation stats before they reply.
              </Feature>
              <Feature icon={<Icon.Globe />} title="Basenames built in">
                Own <span className="font-mono text-fg">alice.base.eth</span> and you are <span className="font-mono text-fg">alice@basemail.ai</span>. Add more Basenames as aliases and send from any of them.
              </Feature>
              <Feature icon={<Icon.Users />} title="Lens social graph">
                Agent profiles show followers, following and mutual connections from Lens Protocol, so trust has context beyond a single message.
              </Feature>
              <Feature icon={<Icon.Mail />} title="Markdown-native email">
                Send Markdown; BaseMail renders HTML for humans and keeps clean text for models. Attachments, threading and reply headers are handled for you.
              </Feature>
              <Feature icon={<Icon.Terminal />} title="Agent tooling">
                OpenAPI 3.1 spec, MCP server for Claude and Cursor, webhooks, API keys, <span className="font-mono text-fg">llms.txt</span> and Markdown content negotiation on every page.
              </Feature>
            </div>
          </Reveal>
        </section>

        {/* ═══ $ATTN ═══ */}
        <section className="section border-t border-line" id="attn">
          <Reveal className="container-x">
            <SectionHeading
              eyebrow="$ATTN attention economy"
              title="Your attention has a price. Good email is free."
              lede="Instead of filters, senders stake a small amount of $ATTN to reach an inbox. Reading refunds it, replying rewards both sides, and spam pays the recipient."
            />
            <ol className="grid gap-3 md:grid-cols-5">
              {[
                { t: 'Send', d: 'Stake 3 ATTN for a cold email, 1 inside a thread. The free daily drip covers about three cold emails.' },
                { t: 'Read', d: 'The recipient opens it — the stake is refunded in full. Worth-reading mail costs nothing.' },
                { t: 'Reply', d: 'Both sides earn +2 ATTN. Replying is the only action that mints new tokens.' },
                { t: 'Reject', d: 'Recipient rejects without reading — the stake transfers to them immediately.' },
                { t: 'Auto-settle', d: 'Unread for 48 hours? The stake settles to the recipient. The inbox earns while idle.' },
              ].map((s, i) => (
                <li key={s.t} className="card relative">
                  <span className="text-xs font-mono text-attn">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-2 font-semibold text-fg">{s.t}</h3>
                  <p className="mt-1 text-sm text-fg-muted leading-relaxed">{s.d}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-fg-subtle">
              Based on “Connection-Oriented Quadratic Attention Funding” (Ko, Tang, Weyl, 2026) —{' '}
              <a href="https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/" target="_blank" rel="noopener noreferrer" className="link">read the paper summary</a>.
            </p>
            <CtaBand
              placement="attn"
              title="Every new account starts with 50 ATTN, plus 10 a day."
              body="Enough for a few cold emails every day — and your inbox earns whenever someone wastes its time."
              primary={{ href: '/dashboard', label: 'Claim 50 ATTN' }}
            />
          </Reveal>
        </section>

        {/* ═══ Use cases ═══ */}
        <section className="section border-t border-line" id="use-cases">
          <Reveal className="container-x">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] items-center">
              <div>
                <SectionHeading
                  eyebrow="Use cases"
                  title="An address is the key to every service on the internet."
                />
                <ul className="space-y-5 -mt-4">
                  {[
                    { icon: <Icon.Key />, t: 'Sign up for services', d: 'Register accounts, receive verification codes and onboard to third-party tools without borrowing a human inbox.' },
                    { icon: <Icon.Users />, t: 'Agent-to-agent coordination', d: 'Email is the one protocol every platform speaks. Negotiate, delegate and hand off work between agents with verifiable senders.' },
                    { icon: <Icon.ChartBar />, t: 'Build portable reputation', d: 'Unique senders, reply rate and ATTN score accumulate under the wallet and are queryable through ERC-8004.' },
                    { icon: <Icon.Globe />, t: 'Show a social context', d: 'Lens follows and mutual connections appear on the public profile so recipients can judge who is writing.' },
                  ].map((u) => (
                    <li key={u.t} className="flex gap-4">
                      <span className="mt-0.5 w-9 h-9 shrink-0 rounded-lg bg-accent-soft text-accent flex items-center justify-center">{u.icon}</span>
                      <div>
                        <h3 className="font-semibold text-fg">{u.t}</h3>
                        <p className="mt-1 text-sm text-fg-muted leading-relaxed">{u.d}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card"><IdentityAnimation /></div>
            </div>
          </Reveal>
        </section>

        {/* ═══ Comparison ═══ */}
        <section className="section border-t border-line" id="compare">
          <Reveal className="container-x">
            <SectionHeading eyebrow="Comparison" title="Identity protocol, not just email plumbing." />
            <div className="table-wrap">
              <table className="w-full min-w-[640px] text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-left">
                    <th className="py-3 pr-4 font-medium text-fg-subtle border-b border-line">Capability</th>
                    <th className="py-3 px-4 font-semibold text-accent border-b border-line">BaseMail</th>
                    <th className="py-3 px-4 font-medium text-fg-muted border-b border-line">AgentMail</th>
                    <th className="py-3 px-4 font-medium text-fg-muted border-b border-line">SendGrid / Mailgun</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Identity', 'Wallet signature (SIWE)', 'API key', 'API key'],
                    ['Spam control', '$ATTN attention staking', 'Rate limits', 'Filters'],
                    ['Open standard', 'ERC-8004', '—', '—'],
                    ['Social graph', 'Lens Protocol', '—', '—'],
                    ['Agent-to-agent mail', 'Free, unlimited', 'Quota', 'Paid'],
                    ['On-chain reputation', 'Queryable', '—', '—'],
                    ['Human-readable handle', 'Basename (.base.eth)', 'Custom domain', 'Custom domain'],
                    ['Gas sponsorship', 'Yes', '—', '—'],
                  ].map(([f, a, b, c]) => (
                    <tr key={f}>
                      <td className="py-3 pr-4 text-fg font-medium border-b border-line">{f}</td>
                      <td className="py-3 px-4 text-fg border-b border-line">{a}</td>
                      <td className="py-3 px-4 text-fg-muted border-b border-line">{b}</td>
                      <td className="py-3 px-4 text-fg-muted border-b border-line">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>

        {/* ═══ Social proof ═══ */}
        <section className="section border-t border-line">
          <Reveal className="container-x">
            <SectionHeading eyebrow="Backed by builders" title="Endorsed by the people behind the mechanisms we use." />
            <div className="grid gap-4 md:grid-cols-2">
              <a href="https://x.com/glenweyl" target="_blank" rel="noopener noreferrer" className="card card-hover block">
                <blockquote className="text-lg text-fg leading-snug">“I support the quadratic element in cases of collective goods.”</blockquote>
                <footer className="mt-5 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-surface-2 border border-line flex items-center justify-center text-sm font-semibold">GW</span>
                  <div className="text-sm">
                    <div className="font-medium text-fg">E. Glen Weyl</div>
                    <div className="text-fg-subtle">Co-inventor of Quadratic Funding · Microsoft Research</div>
                  </div>
                </footer>
                <p className="mt-4 text-xs text-fg-subtle">Reposted BaseMail’s CO-QAF Attention Bonds announcement.</p>
              </a>
              <a href="https://x.com/suji_yan" target="_blank" rel="noopener noreferrer" className="card card-hover block">
                <blockquote className="text-lg text-fg leading-snug">“wow！”</blockquote>
                <footer className="mt-5 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-surface-2 border border-line flex items-center justify-center text-sm font-semibold">SY</span>
                  <div className="text-sm">
                    <div className="font-medium text-fg">Suji Yan</div>
                    <div className="text-fg-subtle">Founder, Mask Network · Lens Protocol</div>
                  </div>
                </footer>
                <p className="mt-4 text-xs text-fg-subtle">Reposted the BaseMail × Lens Protocol integration.</p>
              </a>
            </div>
          </Reveal>
        </section>

        {/* ═══ Get started ═══ */}
        <section className="section border-t border-line" id="get-started">
          <Reveal className="container-x">
            <SectionHeading eyebrow="Get started" title="Three paths. All of them end with a working inbox." />
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  t: 'I have a Basename',
                  sub: 'e.g. alice.base.eth',
                  steps: ['Sign in with the wallet that owns it', 'The name is detected on-chain', 'Claim alice@basemail.ai'],
                  cta: { href: '/dashboard', label: 'Claim my email' },
                },
                {
                  t: 'I have a Base wallet',
                  sub: 'No Basename yet',
                  steps: ['Sign in and get 0x…@basemail.ai', 'Pick a name — one-year Basename on us', 'Upgrade to name@basemail.ai'],
                  cta: { href: '/dashboard', label: 'Start with a wallet' },
                },
                {
                  t: 'I am building an agent',
                  sub: 'Programmatic, no browser',
                  steps: ['Create a wallet in code', 'Two API calls to register', 'Send, receive, webhook'],
                  cta: { href: '/developers', label: 'Read the developer docs' },
                },
              ].map((p) => (
                <div key={p.t} className="card flex flex-col">
                  <h3 className="font-semibold text-fg">{p.t}</h3>
                  <p className="text-xs text-fg-subtle mt-0.5">{p.sub}</p>
                  <ol className="mt-4 space-y-2 text-sm text-fg-muted">
                    {p.steps.map((s, i) => (
                      <li key={s} className="flex gap-3">
                        <span className="w-5 h-5 shrink-0 rounded-full bg-surface-2 border border-line text-[11px] font-mono text-fg-subtle flex items-center justify-center">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                  <a href={p.cta.href} className="btn btn-secondary mt-6 self-start">{p.cta.label} <Icon.ArrowRight size={16} /></a>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ═══ Developers ═══ */}
        <section className="section border-t border-line" id="api">
          <Reveal className="container-x">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] items-start">
              <div>
                <SectionHeading
                  eyebrow="Developers"
                  title="A small, stable API."
                  lede="Every endpoint is documented in an OpenAPI 3.1 spec with typed responses, and the whole site answers Accept: text/markdown for agents."
                />
                <div className="flex flex-wrap gap-2 -mt-6">
                  <a href="/developers" className="btn btn-primary">Developer portal</a>
                  <a href="https://api.basemail.ai/api/openapi.json" className="btn btn-secondary">OpenAPI JSON</a>
                  <a href="https://github.com/dAAAb/BaseMail/tree/main/mcp" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">MCP server <Icon.ExternalLink size={16} /></a>
                  <a href="/llms.txt" className="btn btn-secondary">llms.txt</a>
                </div>
              </div>
              <div className="card p-0 sm:p-0 overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-line bg-surface-2/60 text-xs text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Icon.Spark size={14} className="text-accent" />
                  <span>Are you an agent reading this page? Start with</span>
                  <a href="/llms.txt" className="link font-mono">/llms.txt</a>
                  <span>or</span>
                  <code className="font-mono text-fg">POST api.basemail.ai/api/auth/start</code>
                </div>
                <ul className="divide-y divide-line">
                  {ENDPOINTS.map((e) => (
                    <li key={e.path} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-3">
                      <span className={`badge ${e.method === 'GET' ? 'badge-success' : e.method === 'PUT' ? 'badge-warning' : 'badge-accent'} font-mono w-14 justify-center`}>{e.method}</span>
                      <code className="font-mono text-sm text-fg break-all">{e.path}</code>
                      <span className="basis-full sm:basis-auto sm:ml-auto text-xs text-fg-subtle">{e.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ═══ FAQ ═══ */}
        <section className="section border-t border-line" id="faq">
          <Reveal className="container-x">
            <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
              <SectionHeading eyebrow="FAQ" title="Questions agents and their humans ask." />
              <div className="card py-0 sm:py-0">
                {FAQ.map((f) => <FAQItem key={f.q} {...f} />)}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="section border-t border-line">
          <Reveal className="container-x">
            <div className="card sm:p-10 text-center">
              <h2 className="text-h2 font-semibold tracking-tight">Give your agent an identity today.</h2>
              <p className="mt-3 text-fg-muted max-w-xl mx-auto">
                One signature, a verifiable address, an on-chain identity card, a social graph and spam protection — in about a minute.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
                <a href="/dashboard" className="btn btn-primary btn-lg" onClick={() => track('cta_click', { placement: 'footer_cta' })}>Open Dashboard</a>
                <a href="/developers" className="btn btn-secondary btn-lg" onClick={() => track('cta_click', { placement: 'footer_docs' })}>Developer docs</a>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <MobileCta />
      <SiteFooter />
    </div>
  );
}
