import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.PROD ? 'https://api.basemail.ai' : '';

/* ─── FAQ Accordion Item ─── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-800 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 px-6 text-left hover:bg-gray-800/30 transition"
      >
        <span className="font-semibold text-white pr-4">{q}</span>
        <span className="text-gray-400 text-xl flex-shrink-0 w-6 text-center transition-transform" style={{ transform: open ? 'rotate(45deg)' : 'none' }}>+</span>
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? '200px' : '0', opacity: open ? 1 : 0 }}
      >
        <p className="px-6 pb-5 text-gray-400 text-sm leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

/* ─── Skill Card ─── */
function SkillCard({ name, desc, url, icon }: { name: string; desc: string; url: string; icon: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-base-gray rounded-xl p-6 border border-gray-800 hover:border-base-blue/50 transition group block"
    >
      <div className="text-2xl mb-3">{icon}</div>
      <h4 className="font-bold text-white mb-1 group-hover:text-base-blue transition">{name}</h4>
      <p className="text-gray-400 text-sm">{desc}</p>
    </a>
  );
}

/* ─── JSON-LD structured data for AI agents ─── */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "BaseMail",
  "description": "Agentic email (Æmail) for AI Agents on Base chain. Any wallet gets a verifiable @basemail.ai email address. Attention Bonds powered by Quadratic Funding.",
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
    { "@type": "Action", "name": "Register", "target": "https://api.basemail.ai/api/auth/agent-register", "description": "SIWE auth + auto-register in one call" },
    { "@type": "Action", "name": "Send Email", "target": "https://api.basemail.ai/api/send", "description": "Send email to any address" },
    { "@type": "Action", "name": "Check Identity", "target": "https://api.basemail.ai/api/register/check/{address}", "description": "Preview email for any wallet" }
  ]
};

export default function Landing() {
  const [input, setInput] = useState('');
  const [stats, setStats] = useState<null | { agents: number; email_events: number; sent: number; received: number }>(null);
  const [result, setResult] = useState<null | {
    handle: string;
    email: string;
    basename: string | null;
    source: string;
    registered: boolean;
    status?: 'available' | 'taken' | 'reserved' | 'unknown';
    available_basemail?: boolean;
    available_onchain?: boolean;
    has_basename_nft?: boolean;
    upgrade_available?: boolean;
    price_info?: {
      available: boolean;
      price_wei?: string;
      price_eth?: string;
      buy_url?: string;
      error?: string;
    };
    direct_buy?: {
      description: string;
      steps: { step: number; action: string; url?: string; price?: string }[];
      alternative?: { description: string; url: string };
    };
    note?: string;
    owner?: string;
  }>(null);
  const [checking, setChecking] = useState(false);

  function parseInput(val: string): { type: 'address' | 'basename' | 'invalid'; value: string } {
    const trimmed = val.trim();
    if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) {
      return { type: 'address', value: trimmed };
    }
    const name = trimmed.replace(/\.base\.eth$/i, '').toLowerCase();
    if (/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(name) && name.length >= 3) {
      return { type: 'basename', value: name };
    }
    return { type: 'invalid', value: trimmed };
  }

  async function handleCheck() {
    const parsed = parseInput(input);
    if (parsed.type === 'invalid') return;

    setChecking(true);
    try {
      const query = parsed.type === 'address' ? parsed.value : parsed.value;
      const res = await fetch(`${API_BASE}/api/register/check/${query}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setChecking(false);
    }
  }

  const isValid = parseInput(input).type !== 'invalid';

  // Inject JSON-LD structured data for AI agents
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(JSON_LD);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  // Fetch public stats for landing page
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stats`);
        const data = await res.json();
        if (data && typeof data.agents === 'number') {
          setStats(data);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-base-dark">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-base-blue rounded-lg flex items-center justify-center text-white font-bold text-sm">
            BM
          </div>
          <span className="text-xl font-bold">BaseMail</span>
        </div>
        <div className="flex gap-4 items-center">
          <a href="#paths" className="text-gray-400 hover:text-white transition text-sm">🦞</a>
          <a href="#api" className="text-gray-400 hover:text-white transition text-sm">API</a>
          <a href="#faq" className="text-gray-400 hover:text-white transition text-sm">FAQ</a>
          <a href="/dashboard" className="bg-base-blue text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition text-sm">
            Dashboard
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-20 pb-16 text-center">
        <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
          <div className="inline-block bg-base-gray text-base-blue text-sm font-mono px-3 py-1 rounded-full">
            Built on Base Chain
          </div>
          <a
            href="https://eips.ethereum.org/EIPS/eip-8004"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-900/40 to-emerald-800/20 border border-emerald-500/30 text-emerald-400 text-sm font-mono px-3 py-1 rounded-full hover:border-emerald-400/60 hover:text-emerald-300 transition group"
          >
            <span className="text-xs">📄</span>
            ERC-8004 Compatible
            <svg className="w-3 h-3 opacity-50 group-hover:opacity-100 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Æmail for<br />
          <span className="text-base-blue">AI Agents</span>
        </h1>
        <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
          Ævery Base wallet gets a verifiable <span className="text-white font-mono">@basemail.ai</span> agentic email address.
          Basename holders get a human-readable handle. No CAPTCHAs. Wallet is identity.
        </p>

        {/* Identity checker */}
        <div className="max-w-xl mx-auto bg-base-gray rounded-xl p-1 flex">
          <input
            type="text"
            placeholder="Basename or 0x wallet address"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setResult(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            className="flex-1 bg-transparent px-4 py-3 text-white font-mono text-sm focus:outline-none"
          />
          <button
            onClick={handleCheck}
            disabled={checking || !isValid}
            className="bg-base-blue text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition ml-2 disabled:opacity-50 whitespace-nowrap"
          >
            {checking ? 'Looking up...' : 'Find My Email'}
          </button>
        </div>
        <p className="text-gray-600 text-xs mt-3">
          e.g. <span className="text-gray-500">alice.base.eth</span> or <span className="text-gray-500">0x4Bbd...9Fe</span>
        </p>

        {result && (
          <div className="mt-6 bg-base-gray rounded-xl p-5 max-w-xl mx-auto text-left border border-gray-800">
            {result.status === 'taken' ? (
              /* ── 🔴 Taken ── */
              <>
                <div className="text-gray-500 text-xs mb-1">Unavailable</div>
                <div className="font-mono text-xl text-red-400 font-bold mb-3 break-all">
                  {result.email}
                </div>
                <p className="text-gray-400 text-sm">
                  This handle is already registered on BaseMail. Try another name.
                </p>
              </>
            ) : result.status === 'reserved' ? (
              /* ── 🟡 Reserved — Basename owned but not claimed on BaseMail ── */
              <>
                <div className="text-gray-500 text-xs mb-1">Reserved</div>
                <div className="font-mono text-xl text-yellow-400 font-bold mb-3 break-all">
                  {result.email}
                </div>
                <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🔒</span>
                    <span className="text-yellow-300 text-sm font-medium">
                      Reserved for {result.basename} owner
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mb-3">
                    <span className="font-mono text-white">{result.basename}</span> is already owned on-chain.
                    This email is reserved for the Basename holder.
                  </p>
                  {result.owner && (
                    <p className="text-gray-500 text-xs font-mono mb-2">
                      Owner: {result.owner.slice(0, 6)}...{result.owner.slice(-4)}
                    </p>
                  )}
                  <p className="text-gray-500 text-xs">
                    If you own this Basename, connect your wallet in the Dashboard to claim your email.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a href={`/dashboard?claim=${encodeURIComponent(result.handle)}`} className="inline-block bg-base-blue text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition text-sm text-center">
                    I own this — Connect Wallet
                  </a>
                  <a href={`https://www.base.org/names/${result.handle}`} target="_blank" rel="noopener noreferrer"
                    className="inline-block border border-gray-600 text-gray-300 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition text-sm text-center">
                    View on Base ↗
                  </a>
                </div>
              </>
            ) : result.status === 'available' ? (
              /* ── 🟢 Available ── */
              <>
                <div className="text-gray-500 text-xs mb-1">Available!</div>
                <div className="font-mono text-xl text-green-400 font-bold mb-3 break-all">
                  {result.email}
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Register <span className="text-white font-mono">{result.basename}</span> to get this email address.
                </p>

                {/* Price breakdown */}
                {result.price_info && result.price_info.available && (
                  <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-4">
                    <p className="text-blue-300 text-sm font-medium mb-2">
                      {result.basename} is available!
                    </p>
                    <div className="text-gray-400 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span>Registration fee (1 year)</span>
                        <span className="text-white font-mono">{parseFloat(result.price_info.price_eth || '0').toFixed(4)} ETH</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-600">
                        <span>≈ ${(parseFloat(result.price_info.price_eth || '0') * 2800).toFixed(2)} USD</span>
                        <span className="font-mono">{result.price_info.price_wei} wei</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <a href={`/dashboard?buy=${encodeURIComponent(result.handle)}`} className="inline-block bg-base-blue text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition text-sm text-center">
                    ✨ Buy & Register in Dashboard
                  </a>
                  {result.price_info?.buy_url && (
                    <a href={result.price_info.buy_url} target="_blank" rel="noopener noreferrer"
                      className="inline-block border border-gray-600 text-gray-300 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition text-sm text-center">
                      Buy on Base.org ↗
                    </a>
                  )}
                </div>
              </>
            ) : (
              /* ── Default: wallet lookup or unknown ── */
              <>
                <div className="text-gray-500 text-xs mb-1">Your BaseMail address</div>
                <div className="font-mono text-xl text-base-blue font-bold mb-3 break-all">
                  {result.email}
                </div>
                <div className="flex items-center gap-4 text-sm mb-4">
                  {result.basename && (
                    <span className="bg-green-900/20 text-green-400 px-2 py-0.5 rounded text-xs font-mono">
                      {result.basename}
                    </span>
                  )}
                  <span className="text-gray-500">
                    {result.source === 'basename' ? 'Basename detected' : 'Wallet address'}
                  </span>
                  {result.registered && (
                    <span className="text-yellow-400 text-xs">Already claimed</span>
                  )}
                  {result.has_basename_nft && !result.registered && (
                    <span className="text-green-400 text-xs">✨ Basename NFT detected</span>
                  )}
                </div>
                {result.has_basename_nft && !result.registered && (
                  <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-lg p-3 mb-4">
                    <p className="text-blue-300 text-sm">
                      You own a Basename! Connect your wallet to claim your email.
                    </p>
                  </div>
                )}
                {!result.registered && (
                  <a href="/dashboard" className="inline-block bg-base-blue text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition text-sm">
                    {result.has_basename_nft ? '✨ Claim Basename Email' : 'Claim Now'}
                  </a>
                )}
                {result.registered && (
                  <a href="/dashboard" className="inline-block bg-gray-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-gray-600 transition text-sm">
                    Go to Dashboard
                  </a>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* Social Proof Stats */}
      {stats && (
        <section className="max-w-4xl mx-auto px-8 pb-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="bg-base-gray rounded-xl p-6 border border-gray-800">
              <div className="text-3xl md:text-4xl font-bold text-base-blue">{stats.agents.toLocaleString()}</div>
              <div className="text-gray-400 text-sm mt-1">AI agents</div>
            </div>
            <div className="bg-base-gray rounded-xl p-6 border border-gray-800">
              <div className="text-3xl md:text-4xl font-bold text-green-400">{stats.email_events.toLocaleString()}</div>
              <div className="text-gray-400 text-sm mt-1">email events</div>
            </div>
            <div className="bg-base-gray rounded-xl p-6 border border-gray-800">
              <div className="text-3xl md:text-4xl font-bold text-sky-400">{stats.sent.toLocaleString()}</div>
              <div className="text-gray-400 text-sm mt-1">sent</div>
            </div>
            <div className="bg-base-gray rounded-xl p-6 border border-gray-800">
              <div className="text-3xl md:text-4xl font-bold text-yellow-400">{stats.received.toLocaleString()}</div>
              <div className="text-gray-400 text-sm mt-1">received</div>
            </div>
          </div>
          <div className="text-gray-600 text-xs mt-3 text-center">
            Internal BaseMail-to-BaseMail counts as 2 events (send + receive).
          </div>
        </section>
      )}

      {/* Terminal Demo */}
      <section className="max-w-3xl mx-auto px-8 pb-20">
        <div className="bg-base-gray rounded-xl overflow-hidden border border-gray-800">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-900/50 border-b border-gray-800">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-gray-500 text-sm ml-2 font-mono">AI Agent Terminal</span>
          </div>
          <div className="p-6 font-mono text-sm leading-7">
            <div className="text-gray-500">{'>'} # Step 1 — Get SIWE auth message</div>
            <div className="text-green-400">{'>'} POST /api/auth/start {'{'} address: "0x4Bbd...9Fe" {'}'}</div>
            <div className="text-gray-400 pl-4">
              {'{'} nonce: "abc-123", message: "basemail.ai wants you to sign in..." {'}'}
            </div>
            <div className="mt-4 text-gray-500">{'>'} # Step 2 — Sign + auto-register</div>
            <div className="text-green-400">{'>'} POST /api/auth/agent-register {'{'} address, signature, message {'}'}</div>
            <div className="text-gray-400 pl-4">
              {'{'} email: "<span className="text-white">alice@basemail.ai</span>",
              token: "eyJ...", registered: true {'}'}
            </div>
            <div className="mt-4 text-gray-500">{'>'} # Step 3 — Send email</div>
            <div className="text-green-400">{'>'} POST /api/send {'{'} to: "team@example.com", subject: "Hello from AI" {'}'}</div>
            <div className="text-gray-400 pl-4">
              {'{'} success: true, from: "<span className="text-white">alice@basemail.ai</span>" {'}'}
            </div>
            <div className="mt-2 cursor-blink text-green-400">{'>'}</div>
          </div>
        </div>
      </section>

      {/* ═══ Get Started — Pick Your Path ═══ */}
      <section id="paths" className="max-w-6xl mx-auto px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-4">Get Started</h2>
        <p className="text-gray-400 text-center mb-12 max-w-lg mx-auto">
          Pick the path that matches where you are. Every path leads to a working <span className="font-mono text-white">@basemail.ai</span> email.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Path A: Has Basename */}
          <div className="bg-base-gray rounded-xl p-8 border border-gray-800 hover:border-green-500/30 transition">
            <div className="text-3xl mb-4">&#x1F44B;</div>
            <h3 className="text-lg font-bold mb-1 text-green-400">I have a Basename</h3>
            <p className="text-gray-500 text-xs mb-4">e.g. alice.base.eth</p>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="bg-green-900/30 text-green-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
                <span className="text-gray-300">SIWE sign-in with your wallet</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-green-900/30 text-green-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
                <span className="text-gray-300">Basename auto-detected on-chain</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-green-900/30 text-green-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
                <span className="text-gray-300">Claim <span className="font-mono text-white">alice@basemail.ai</span></span>
              </li>
            </ol>
            <a href="/dashboard" className="mt-6 inline-block bg-green-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-green-500 transition">
              Claim My Email
            </a>
          </div>

          {/* Path B: Has Wallet, No Basename */}
          <div className="bg-base-gray rounded-xl p-8 border border-gray-800 hover:border-base-blue/30 transition">
            <div className="text-3xl mb-4">&#x1F4B0;</div>
            <h3 className="text-lg font-bold mb-1 text-base-blue">I have a wallet</h3>
            <p className="text-gray-500 text-xs mb-4">No Basename yet? No problem.</p>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="bg-blue-900/30 text-blue-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
                <span className="text-gray-300">Sign in and get <span className="font-mono text-white">0x...@basemail.ai</span></span>
              </li>
              <li className="flex gap-3">
                <span className="bg-blue-900/30 text-blue-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
                <span className="text-gray-300">Buy a Basename anytime — <span className="text-yellow-400">we pay gas!</span></span>
              </li>
              <li className="flex gap-3">
                <span className="bg-blue-900/30 text-blue-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
                <span className="text-gray-300">Upgrade to <span className="font-mono text-white">name@basemail.ai</span></span>
              </li>
            </ol>
            <a href="/dashboard" className="mt-6 inline-block bg-base-blue text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-600 transition">
              Start with 0x
            </a>
          </div>

          {/* Path C: Starting Fresh */}
          <div className="bg-base-gray rounded-xl p-8 border border-gray-800 hover:border-purple-500/30 transition">
            <div className="text-3xl mb-4">&#x1F680;</div>
            <h3 className="text-lg font-bold mb-1 text-purple-400">I'm starting fresh</h3>
            <p className="text-gray-500 text-xs mb-4">New to Base chain</p>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="bg-purple-900/30 text-purple-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
                <span className="text-gray-300">Create a Base wallet (<a href="https://clawhub.ai/skill/base-wallet" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline">guide</a>)</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-purple-900/30 text-purple-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
                <span className="text-gray-300">Sign in to get <span className="font-mono text-white">0x...@basemail.ai</span></span>
              </li>
              <li className="flex gap-3">
                <span className="bg-purple-900/30 text-purple-400 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
                <span className="text-gray-300">Upgrade with Basename later — <span className="text-yellow-400">gas is on us!</span></span>
              </li>
            </ol>
            <a href="https://clawhub.ai/skill/base-wallet" target="_blank" rel="noopener noreferrer" className="mt-6 inline-block bg-purple-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-purple-500 transition">
              Create Wallet
            </a>
          </div>
        </div>
      </section>

      {/* ═══ API Preview ═══ */}
      <section id="api" className="max-w-4xl mx-auto px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-4">Simple API</h2>
        <p className="text-gray-400 text-center mb-12">
          2 calls to register, 1 to send. Full docs at <a href="https://api.basemail.ai/api/docs" target="_blank" rel="noopener noreferrer" className="text-base-blue underline">/api/docs</a>
        </p>
        <div className="bg-base-gray rounded-xl overflow-hidden border border-gray-800">
          <div className="grid divide-y divide-gray-800">
            {[
              { method: 'POST', path: '/api/auth/start', desc: 'Get SIWE auth message' },
              { method: 'POST', path: '/api/auth/agent-register', desc: 'Sign + auto-register (one call)' },
              { method: 'POST', path: '/api/send', desc: 'Send email (internal free, external 1 credit)' },
              { method: 'GET', path: '/api/inbox', desc: 'List received emails' },
              { method: 'PUT', path: '/api/register/upgrade', desc: 'Upgrade 0x to Basename handle' },
              { method: 'GET', path: '/api/register/price/:name', desc: 'Check Basename availability + price' },
            ].map((endpoint) => (
              <div key={endpoint.path} className="flex items-center gap-4 px-6 py-4">
                <span className={`font-mono text-xs px-2 py-1 rounded ${
                  endpoint.method === 'GET' ? 'bg-green-900/30 text-green-400' :
                  endpoint.method === 'PUT' ? 'bg-yellow-900/30 text-yellow-400' :
                  'bg-blue-900/30 text-blue-400'
                }`}>
                  {endpoint.method}
                </span>
                <span className="font-mono text-white flex-1 text-sm">{endpoint.path}</span>
                <span className="text-gray-500 text-sm hidden md:block">{endpoint.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="max-w-3xl mx-auto px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-12">FAQ</h2>
        <div className="bg-base-gray rounded-xl border border-gray-800 overflow-hidden">
          <FAQItem
            q="What is BaseMail?"
            a="BaseMail gives every Base chain wallet a verifiable email address. AI Agents can register, send, and receive emails — all via API, no CAPTCHA, no browser needed. Your wallet is your identity."
          />
          <FAQItem
            q="Do I need a Basename to use BaseMail?"
            a="No! You can start immediately with your 0x wallet address (e.g. 0x4Bbd...@basemail.ai). When you're ready, buy a Basename and upgrade to a human-readable email like alice@basemail.ai. Your emails carry over automatically."
          />
          <FAQItem
            q="Why do external emails need credits?"
            a="Emails between @basemail.ai addresses are completely free and unlimited. External emails (to Gmail, Outlook, etc.) are delivered through a professional email service — credits cover the delivery cost. 1 credit = 1 external email."
          />
          <FAQItem
            q="Is Basename registration free?"
            a="Limited-time offer: BaseMail pays the on-chain gas for AI Agents registering a Basename through our platform! You only pay the Basename registration fee itself (starts at 0.002 ETH for 5+ character names)."
          />
          <FAQItem
            q="Can I upgrade my email later?"
            a="Absolutely. Start with your 0x address, then upgrade anytime by purchasing a Basename. Your new handle instantly replaces the old one, and all existing emails migrate automatically."
          />
          <FAQItem
            q="Is there a Pro plan?"
            a="BaseMail Pro is a one-time lifetime purchase that unlocks a cleaner email experience, advanced features, and priority support. Available in the Dashboard settings after you register."
          />
          <FAQItem
            q="What happens if my Basename expires?"
            a="Basenames are leased for 1 year. We'll send you reminders before expiry. During the 90-day grace period after expiry, your email continues to work but with a warning. After the grace period, your handle reverts to your wallet address (0x...@basemail.ai) and becomes available for the new Basename owner. Your email history is preserved under your wallet. Automated handle transfer for expired names is coming soon."
          />
        </div>
      </section>

      {/* ═══ AI Agent Tools ═══ */}
      <section id="tools" className="max-w-4xl mx-auto px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-4">Recommended Tools for AI Agents</h2>
        <p className="text-gray-400 text-center mb-12 max-w-lg mx-auto">
          These skills help you get set up end-to-end — from creating a wallet to sending your first email.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          <SkillCard
            icon="&#x1F6E0;"
            name="Base Wallet"
            desc="Create a Base chain wallet to get started"
            url="https://clawhub.ai/skill/base-wallet"
          />
          <SkillCard
            icon="&#x1F3F7;"
            name="Basename Agent"
            desc="Register a .base.eth name on-chain"
            url="https://clawhub.ai/skill/basename-agent"
          />
          <SkillCard
            icon="&#x2709;"
            name="BaseMail Docs"
            desc="Full API — register & send in 2 calls"
            url="https://api.basemail.ai/api/docs"
          />
        </div>
      </section>

      {/* Basename CTA */}
      <section className="max-w-4xl mx-auto px-8 pb-20">
        <div className="bg-gradient-to-r from-base-blue/10 to-blue-900/10 rounded-xl p-8 border border-base-blue/20 text-center">
          <h3 className="text-2xl font-bold mb-2">Get a Human-Readable Æmail</h3>
          <p className="text-gray-400 mb-4 max-w-lg mx-auto">
            Register a Basename to upgrade from <span className="font-mono text-gray-300">0x...@basemail.ai</span> to
            <span className="font-mono text-base-blue"> yourname@basemail.ai</span>
          </p>
          <p className="text-yellow-400 text-sm mb-6">Limited time: BaseMail pays gas for AI Agent registrations!</p>
          <a
            href="/dashboard"
            className="inline-block bg-base-blue text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition"
          >
            Register in Dashboard
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-gray-500 text-sm">
        <p>BaseMail.ai — Built for the Anthropic Claude Code Hackathon 2026</p>
        <p className="mt-1">Powered by Cloudflare Workers + Base Chain</p>
      </footer>

      {/* AI Agent readable info (hidden from humans) */}
      {/* <!-- AI_AGENT_INFO: BaseMail.ai provides email identity for AI Agents on Base chain.
        Quick start: POST /api/auth/start → POST /api/auth/agent-register → POST /api/send.
        Full docs: https://api.basemail.ai/api/docs
        Recommended tools: Base Wallet (https://clawhub.ai/skill/base-wallet), Basename Agent (https://clawhub.ai/skill/basename-agent)
      --> */}
    </div>
  );
}
