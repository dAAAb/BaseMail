import { useState } from 'react';

const API_BASE = import.meta.env.PROD ? 'https://api.basemail.ai' : '';

export default function Landing() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<null | {
    handle: string;
    email: string;
    basename: string | null;
    source: string;
    registered: boolean;
  }>(null);
  const [checking, setChecking] = useState(false);

  function parseInput(val: string): { type: 'address' | 'basename' | 'invalid'; value: string } {
    const trimmed = val.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      return { type: 'address', value: trimmed };
    }
    // Accept basename with or without .base.eth suffix
    const name = trimmed.replace(/\.base\.eth$/i, '').toLowerCase();
    if (/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(name) && name.length >= 3) {
      return { type: 'basename', value: name };
    }
    // Single char basenames won't match above, but 0x prefix partial won't either
    return { type: 'invalid', value: trimmed };
  }

  async function handleCheck() {
    const parsed = parseInput(input);
    if (parsed.type === 'invalid') return;

    setChecking(true);
    try {
      if (parsed.type === 'address') {
        const res = await fetch(`${API_BASE}/api/register/check/${parsed.value}`);
        const data = await res.json();
        setResult(data);
      } else {
        // Basename: show preview directly (ownership verified during SIWE auth)
        setResult({
          handle: parsed.value,
          email: `${parsed.value}@basemail.ai`,
          basename: `${parsed.value}.base.eth`,
          source: 'basename',
          registered: false,
        });
      }
    } catch {
      setResult(null);
    } finally {
      setChecking(false);
    }
  }

  const isValid = parseInput(input).type !== 'invalid';

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
        <div className="flex gap-4">
          <a href="#how" className="text-gray-400 hover:text-white transition">How it works</a>
          <a href="#api" className="text-gray-400 hover:text-white transition">API</a>
          <a href="/dashboard" className="bg-base-blue text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
            Dashboard
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-20 pb-16 text-center">
        <div className="inline-block bg-base-gray text-base-blue text-sm font-mono px-3 py-1 rounded-full mb-6">
          Built on Base Chain
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Email Identity for<br />
          <span className="text-base-blue">AI Agents</span>
        </h1>
        <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
          Every Base wallet gets a verifiable <span className="text-white font-mono">@basemail.ai</span> email address.
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
            </div>
            {!result.registered && (
              <a
                href="/dashboard"
                className="inline-block bg-base-blue text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition text-sm"
              >
                Claim Now
              </a>
            )}
          </div>
        )}
      </section>

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
            <div className="text-gray-500">{'>'} # Wallet signs in, email auto-assigned</div>
            <div className="text-green-400">{'>'} basemail.verify({'{'} wallet: "0x4Bbd...9Fe" {'}'})</div>
            <div className="text-gray-400 pl-4">
              {'{'} suggested_email: "<span className="text-white">alice@basemail.ai</span>",
              source: "basename" {'}'}
            </div>
            <div className="mt-4 text-gray-500">{'>'} # One-click register</div>
            <div className="text-green-400">{'>'} basemail.register()</div>
            <div className="text-gray-400 pl-4">
              {'{'} email: "<span className="text-white">alice@basemail.ai</span>",
              pending_emails: 3 {'}'}
            </div>
            <div className="mt-4 text-gray-500">{'>'} # Agent sends email</div>
            <div className="text-green-400">{'>'} basemail.send({'{'} to: "team@example.com", subject: "Hello from AI" {'}'})</div>
            <div className="text-gray-400 pl-4">
              {'{'} success: true, from: "alice@basemail.ai" {'}'}
            </div>
            <div className="mt-2 cursor-blink text-green-400">{'>'}</div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-6xl mx-auto px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-12">How it Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-base-gray rounded-xl p-8 border border-gray-800">
            <div className="text-3xl font-bold text-base-blue mb-4">1</div>
            <h3 className="text-xl font-bold mb-2">Connect Wallet</h3>
            <p className="text-gray-400">
              Sign in with your Base wallet. BaseMail auto-detects your Basename.
              No CAPTCHA, no email verification loop.
            </p>
          </div>
          <div className="bg-base-gray rounded-xl p-8 border border-gray-800">
            <div className="text-3xl font-bold text-base-blue mb-4">2</div>
            <h3 className="text-xl font-bold mb-2">Claim Email</h3>
            <p className="text-gray-400">
              One click to claim your email.
              <span className="font-mono text-white"> alice.base.eth</span> gets
              <span className="font-mono text-base-blue"> alice@basemail.ai</span>.
              No Basename? You get your
              <span className="font-mono text-white"> 0x address</span>.
            </p>
          </div>
          <div className="bg-base-gray rounded-xl p-8 border border-gray-800">
            <div className="text-3xl font-bold text-base-blue mb-4">3</div>
            <h3 className="text-xl font-bold mb-2">Send & Receive</h3>
            <p className="text-gray-400">
              Full email capabilities via API. Register for any service, receive confirmations,
              send replies — all programmatically.
            </p>
          </div>
        </div>
      </section>

      {/* API Preview */}
      <section id="api" className="max-w-4xl mx-auto px-8 pb-20">
        <h2 className="text-3xl font-bold text-center mb-12">Simple API</h2>
        <div className="bg-base-gray rounded-xl overflow-hidden border border-gray-800">
          <div className="grid divide-y divide-gray-800">
            {[
              { method: 'POST', path: '/api/auth/verify', desc: 'Wallet signature auth + identity detection' },
              { method: 'POST', path: '/api/register', desc: 'Claim your @basemail.ai email' },
              { method: 'POST', path: '/api/send', desc: 'Send email (internal + external)' },
              { method: 'GET', path: '/api/inbox', desc: 'List received emails' },
              { method: 'GET', path: '/api/inbox/:id', desc: 'Read email content' },
              { method: 'GET', path: '/api/register/check/:address', desc: 'Preview email for any wallet' },
            ].map((endpoint) => (
              <div key={endpoint.path} className="flex items-center gap-4 px-6 py-4">
                <span className={`font-mono text-xs px-2 py-1 rounded ${
                  endpoint.method === 'GET' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'
                }`}>
                  {endpoint.method}
                </span>
                <span className="font-mono text-white flex-1">{endpoint.path}</span>
                <span className="text-gray-500 text-sm">{endpoint.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Basename CTA */}
      <section className="max-w-4xl mx-auto px-8 pb-20">
        <div className="bg-gradient-to-r from-base-blue/10 to-blue-900/10 rounded-xl p-8 border border-base-blue/20 text-center">
          <h3 className="text-2xl font-bold mb-2">Get a Human-Readable Email</h3>
          <p className="text-gray-400 mb-6 max-w-lg mx-auto">
            Register a Basename to get a clean email like <span className="font-mono text-base-blue">yourname@basemail.ai</span> instead
            of a long 0x address.
          </p>
          <a
            href="https://www.base.org/names"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-base-blue text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition"
          >
            Get a Basename
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-gray-500 text-sm">
        <p>BaseMail.ai — Built for the Anthropic Claude Code Hackathon 2026</p>
        <p className="mt-1">Powered by Cloudflare Workers + Base Chain</p>
      </footer>
    </div>
  );
}
