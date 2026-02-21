import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLensAccount, useLensProfileOnDemand } from '../hooks/useLensProfile';
import LensBadge from '../components/LensBadge';
import AgentSEO from '../components/AgentSEO';

const LensSocialGraph = lazy(() => import('../components/LensSocialGraph'));
const LensTreeView = lazy(() => import('../components/LensTreeView'));

const API_BASE = import.meta.env.PROD ? 'https://api.basemail.ai' : '';

/* ─── Types ─── */
interface Service {
  name: string;
  endpoint: string;
  version?: string;
}

interface AttentionBonds {
  enabled: boolean;
  basePriceUsdc: number;
  escrowContract: string;
  chain: string;
  token: string;
  tokenContract: string;
  mechanism: string;
  paper?: string;
  priceEndpoint?: string;
  coqafEndpoint?: string;
}

interface Reputation {
  source: string;
  uniqueSenders: number;
  totalBondsUsdc: number;
  emailsReceived: number;
  emailsSent: number;
}

interface Registration {
  type: string;
  name: string;
  description: string;
  image: string;
  services: Service[];
  x402Support: boolean;
  active: boolean;
  supportedTrust: string[];
  attentionBonds: AttentionBonds;
  reputation: Reputation;
}

/* ─── Helpers ─── */
function truncAddr(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getWalletFromServices(services: Service[]): string | null {
  const walletSvc = services.find(s => s.name === 'wallet');
  if (!walletSvc) return null;
  // format: eip155:8453:0x...
  const parts = walletSvc.endpoint.split(':');
  return parts.length === 3 ? parts[2] : walletSvc.endpoint;
}

function getBasename(services: Service[]): string | null {
  const ens = services.find(s => s.name === 'ENS');
  return ens?.endpoint || null;
}

/* ─── Stat Card ─── */
function Stat({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-base-gray rounded-xl p-5 border border-gray-800">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-gray-400 text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white font-mono">{value}</div>
    </div>
  );
}

/* ─── Service Badge ─── */
function ServiceBadge({ service }: { service: Service }) {
  const icons: Record<string, string> = {
    email: '📧',
    wallet: '💰',
    ENS: '🏷️',
    web: '🌐',
    'BaseMail API': '⚡',
  };

  const isLink = service.endpoint.startsWith('http');
  const isWallet = service.name === 'wallet';
  const walletAddr = isWallet ? service.endpoint.split(':').pop() : null;
  const displayEndpoint = isWallet
    ? truncAddr(walletAddr || service.endpoint)
    : service.endpoint;

  const href = isLink
    ? service.endpoint
    : isWallet && walletAddr
    ? `https://basescan.org/address/${walletAddr}`
    : service.name === 'ENS'
    ? `https://www.base.org/name/${service.endpoint}`
    : service.name === 'email'
    ? `mailto:${service.endpoint}`
    : undefined;

  const inner = (
    <div className="flex items-center gap-3 bg-base-gray rounded-lg px-4 py-3 border border-gray-800 hover:border-base-blue/50 transition group">
      <span className="text-lg">{icons[service.name] || '🔗'}</span>
      <div className="min-w-0">
        <div className="text-xs text-gray-400 uppercase tracking-wider">{service.name}</div>
        <div className="text-sm text-white font-mono truncate group-hover:text-base-blue transition">
          {displayEndpoint}
        </div>
      </div>
      {service.version && (
        <span className="ml-auto text-xs bg-base-blue/20 text-base-blue px-2 py-0.5 rounded-full">
          {service.version}
        </span>
      )}
    </div>
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
  ) : (
    inner
  );
}

/* ─── Trust Badge ─── */
function TrustBadge({ trust }: { trust: string }) {
  const config: Record<string, { icon: string; color: string }> = {
    'reputation': { icon: '⭐', color: 'text-yellow-400' },
    'crypto-economic': { icon: '🔐', color: 'text-green-400' },
  };
  const c = config[trust] || { icon: '✓', color: 'text-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-gray-800 ${c.color}`}>
      {c.icon} {trust}
    </span>
  );
}

/* ─── Main Component ─── */
export default function AgentProfile() {
  const { handle } = useParams<{ handle: string }>();
  const [data, setData] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceData, setPriceData] = useState<{ current_price_usdc?: number; demand_7d?: number } | null>(null);
  const [coqafData, setCoqafData] = useState<{ qaf_value?: number; coqaf_value?: number } | null>(null);

  // Lens hooks MUST be called before any early returns (React rules of hooks)
  const wallet = data ? getWalletFromServices(data.services) : null;
  const basename = data ? getBasename(data.services) : null;
  const { account: lensAccount, lensVersion, loading: lensLoading } = useLensAccount(wallet, basename || handle);
  const { profile: lensProfile, loading: lensGraphLoading, load: loadLensGraph } = useLensProfileOnDemand(lensAccount);
  const [lensExpanded, setLensExpanded] = useState(false);

  useEffect(() => {
    if (!handle) return;
    setLoading(true);
    setError(null);

    // Fetch registration.json
    fetch(`${API_BASE}/api/agent/${handle}/registration.json`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Agent not found' : `Error ${r.status}`);
        return r.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
        // Fetch price + coqaf in parallel
        fetch(`${API_BASE}/api/attention/price/${handle}`).then(r => r.json()).then(setPriceData).catch(() => {});
        fetch(`${API_BASE}/api/attention/coqaf/${handle}`).then(r => r.json()).then(setCoqafData).catch(() => {});
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [handle]);

  if (loading) {
    return (
      <div className="min-h-screen bg-base-dark flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-lg">Loading agent profile...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-base-dark flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">🔍</div>
        <h1 className="text-2xl font-bold text-white">Agent Not Found</h1>
        <p className="text-gray-400">No ERC-8004 registration found for <span className="font-mono text-base-blue">@{handle}</span></p>
        <Link to="/" className="mt-4 text-base-blue hover:underline">← Back to BaseMail</Link>
      </div>
    );
  }

  const rep = data.reputation || { source: '', uniqueSenders: 0, totalBondsUsdc: 0, emailsReceived: 0, emailsSent: 0 };
  const bonds = data.attentionBonds;

  return (
    <div className="min-h-screen bg-base-dark">
      {/* SEO + AISEO */}
      <AgentSEO
        handle={handle!}
        name={data.name}
        description={data.description}
        image={data.image}
        wallet={wallet}
        lensHandle={lensAccount?.username?.localName}
        emailsReceived={rep.emailsReceived}
        totalBondsUsdc={rep.totalBondsUsdc}
      />

      {/* Header */}
      <header className="border-b border-gray-800 bg-base-dark/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white hover:text-base-blue transition">
            <span className="text-xl">📮</span>
            <span className="font-bold">BaseMail</span>
          </Link>
          <div className="flex items-center gap-3">
            <a
              href={`${API_BASE}/api/agent/${handle}/registration.json`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-base-blue transition font-mono flex items-center gap-1"
            >
              <span>📋</span> ERC-8004 JSON
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Profile Hero */}
        <div className="flex flex-col sm:flex-row items-start gap-6 mb-10">
          <img
            src={data.image}
            alt={data.name}
            className="w-24 h-24 rounded-2xl bg-base-gray border-2 border-gray-700 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${handle}`; }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">{data.name}</h1>
              {data.active && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Active
                </span>
              )}
            </div>
            <p className="text-gray-400 mb-3 text-sm leading-relaxed">{data.description}</p>
            <div className="flex flex-wrap gap-2">
              {data.supportedTrust.map(t => <TrustBadge key={t} trust={t} />)}
              <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-base-blue/20 text-base-blue">
                📄 ERC-8004
              </span>
              <LensBadge handle={lensAccount?.username?.localName} loading={lensLoading} />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <Stat icon="📨" label="Emails Received" value={rep.emailsReceived} />
          <Stat icon="📤" label="Emails Sent" value={rep.emailsSent} />
          <Stat icon="👥" label="Unique Senders" value={rep.uniqueSenders} />
          <Stat icon="💎" label="Total Bonded" value={`$${rep.totalBondsUsdc.toFixed(2)}`} />
        </div>

        {/* Attention Bonds Section */}
        {bonds?.enabled && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              💰 Attention Bonds
            </h2>
            <div className="bg-base-gray rounded-xl border border-gray-800 overflow-hidden">
              <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-800">
                <div className="p-5">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Base Price</div>
                  <div className="text-xl font-bold text-white font-mono">
                    ${bonds.basePriceUsdc} <span className="text-sm text-gray-400">USDC</span>
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Current Price</div>
                  <div className="text-xl font-bold text-base-blue font-mono">
                    ${priceData?.current_price_usdc?.toFixed(4) || '...'} <span className="text-sm text-gray-400">USDC</span>
                  </div>
                  {priceData?.demand_7d !== undefined && (
                    <div className="text-xs text-gray-500 mt-1">{priceData.demand_7d} emails in last 7 days</div>
                  )}
                </div>
                <div className="p-5">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Mechanism</div>
                  <div className="text-sm text-white">{bonds.mechanism}</div>
                  {bonds.paper && (
                    <a href={bonds.paper} target="_blank" rel="noopener noreferrer" className="text-xs text-base-blue hover:underline mt-1 inline-block">
                      Read paper →
                    </a>
                  )}
                </div>
              </div>

              {/* QAF Scores */}
              {coqafData && (coqafData.qaf_value || 0) > 0 && (
                <div className="border-t border-gray-800 p-5">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">Quadratic Attention Score</div>
                  <div className="flex gap-8">
                    <div>
                      <div className="text-xs text-gray-500">QAF</div>
                      <div className="text-lg font-bold text-white font-mono">{coqafData.qaf_value?.toFixed(4)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">CO-QAF</div>
                      <div className="text-lg font-bold text-green-400 font-mono">{coqafData.coqaf_value?.toFixed(4)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Contract Info */}
              <div className="border-t border-gray-800 p-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
                <span>Chain: Base (8453)</span>
                <span>Token: USDC</span>
                <a
                  href={`https://basescan.org/address/${bonds.escrowContract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base-blue hover:underline"
                >
                  Escrow: {truncAddr(bonds.escrowContract)}
                </a>
                <a
                  href={`https://basescan.org/address/${bonds.tokenContract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base-blue hover:underline"
                >
                  USDC: {truncAddr(bonds.tokenContract)}
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Lens Social Graph (collapsible, loads on demand) */}
        {lensAccount && (
          <section className="mb-10">
            <button
              onClick={() => {
                const next = !lensExpanded;
                setLensExpanded(next);
                if (next && !lensProfile) loadLensGraph();
              }}
              className="w-full flex items-center justify-between bg-base-gray rounded-xl px-5 py-4 border border-gray-800 hover:border-[#abfe2c]/30 transition group"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🌿</span>
                <div className="text-left">
                  <div className="text-white font-bold">Lens Social Graph</div>
                  <div className="text-xs text-gray-400">
                    {lensAccount.username?.localName ? `@${lensAccount.username.localName}` : 'Connected'}
                    {lensProfile ? ` · ${lensProfile.graph.stats.followers} followers · ${lensProfile.graph.stats.following} following` : ' · Click to explore'}
                  </div>
                </div>
              </div>
              <span className={`text-gray-400 transition-transform ${lensExpanded ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {lensExpanded && (
              <div className="mt-3">
                {lensGraphLoading && !lensProfile && (
                  <div className="bg-base-gray rounded-xl border border-gray-800 p-10 text-center">
                    <div className="animate-spin text-3xl mb-3">🌿</div>
                    <div className="text-gray-400 text-sm">Loading social graph from Lens Protocol…</div>
                  </div>
                )}
                {lensProfile && (
                  <>
                    <Suspense fallback={<div className="text-gray-500 text-center py-10 animate-pulse">Rendering graph…</div>}>
                      <LensSocialGraph
                        rootAccount={lensProfile.account}
                        initialGraph={lensProfile.graph}
                      />
                    </Suspense>
                    <div className="mt-4">
                      <Suspense fallback={<div className="text-gray-500 text-center py-4 animate-pulse">Loading tree…</div>}>
                        <LensTreeView
                          rootAccount={lensProfile.account}
                          initialGraph={lensProfile.graph}
                        />
                      </Suspense>
                    </div>
                  </>
                )}

                {/* Lens version badge + upgrade hint */}
                {lensVersion === 'v2-managed' && (
                  <div className="mt-4 bg-yellow-900/15 border border-yellow-800/30 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-yellow-800/30 text-yellow-400 border border-yellow-700/40">
                        Lens v2
                      </span>
                      <span className="text-xs text-yellow-500/80">Legacy Profile NFT on Polygon</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      If you're <span className="text-white font-mono">@{lensAccount?.username?.localName || handle}</span>,{' '}
                      <a
                        href="https://lens.xyz/mint"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#abfe2c] hover:underline"
                      >
                        click here to upgrade to Lens v3 →
                      </a>
                    </p>
                  </div>
                )}
                {lensVersion === 'v3' && (
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#00501e]/30 text-[#abfe2c] border border-[#abfe2c]/20">
                      Lens v3
                    </span>
                    <span className="text-[10px] text-gray-600">On Lens Chain</span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Services */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            🔗 Services & Endpoints
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.services.map((s, i) => <ServiceBadge key={i} service={s} />)}
          </div>
        </section>

        {/* Raw JSON */}
        <section className="mb-10">
          <details className="group">
            <summary className="cursor-pointer text-sm text-gray-400 hover:text-white transition flex items-center gap-2">
              <span className="group-open:rotate-90 transition-transform">▶</span>
              View raw ERC-8004 registration.json
            </summary>
            <pre className="mt-4 bg-base-gray rounded-xl border border-gray-800 p-5 text-xs text-gray-300 font-mono overflow-x-auto max-h-96">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </section>

        {/* CTA */}
        <section className="text-center py-10 border-t border-gray-800">
          <p className="text-gray-400 mb-4">Want your own ERC-8004 agent identity?</p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 bg-base-blue text-white font-bold px-8 py-3 rounded-xl hover:bg-blue-600 transition"
          >
            Register on BaseMail →
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-500">
        <a href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noopener noreferrer" className="hover:text-base-blue transition">
          ERC-8004: Agent Registry Standard
        </a>
        <span className="mx-2">·</span>
        <a href="https://basemail.ai" className="hover:text-base-blue transition">BaseMail.ai</a>
        <span className="mx-2">·</span>
        <span>Æmail for AI Agents on Base</span>
      </footer>
    </div>
  );
}
