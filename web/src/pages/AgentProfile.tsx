import { useState, useEffect, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLensAccount, useLensProfileOnDemand } from '../hooks/useLensProfile';
import LensBadge from '../components/LensBadge';
import AgentSEO from '../components/AgentSEO';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { Icon } from '../components/Icons';

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

type IconComponent = typeof Icon.Check;

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

/* ─── Page shell: shared site header + footer ─── */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/* ─── Section heading ─── */
function SectionTitle({ icon: TitleIcon, children }: { icon: IconComponent; children: ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-h3 font-semibold text-fg">
      <TitleIcon size={18} className="text-fg-muted" />
      {children}
    </h2>
  );
}

/* ─── Stat Card ─── */
function Stat({ label, value, icon: StatIcon }: { label: string; value: string | number; icon: IconComponent }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2 text-fg-subtle">
        <StatIcon size={16} />
        <span className="eyebrow">{label}</span>
      </div>
      <div className="font-mono text-2xl font-semibold tracking-tight text-fg break-all">{value}</div>
    </div>
  );
}

/* ─── Service Badge ─── */
const SERVICE_ICONS: Record<string, IconComponent> = {
  email: Icon.Mail,
  wallet: Icon.Wallet,
  ENS: Icon.Globe,
  web: Icon.ExternalLink,
  'BaseMail API': Icon.Terminal,
};

function ServiceBadge({ service }: { service: Service }) {
  const ServiceIcon = SERVICE_ICONS[service.name] || Icon.ExternalLink;

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
    <div className="card-inset card-hover group flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-muted">
        <ServiceIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">{service.name}</div>
        <div className="truncate font-mono text-sm text-fg transition-colors duration-150 group-hover:text-[#7da2ff]">
          {displayEndpoint}
        </div>
      </div>
      {service.version && (
        <span className="badge badge-accent shrink-0">{service.version}</span>
      )}
    </div>
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block min-w-0 rounded-xl">{inner}</a>
  ) : (
    inner
  );
}

/* ─── Trust Badge ─── */
function TrustBadge({ trust }: { trust: string }) {
  const config: Record<string, { icon: IconComponent; cls: string }> = {
    'reputation': { icon: Icon.ChartBar, cls: 'badge-warning' },
    'crypto-economic': { icon: Icon.Lock, cls: 'badge-success' },
  };
  const c = config[trust] || { icon: Icon.Check, cls: 'badge-neutral' };
  const TrustIcon = c.icon;
  return (
    <span className={`badge ${c.cls}`}>
      <TrustIcon size={12} /> {trust}
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
  const [isHuman, setIsHuman] = useState<{ verified: boolean; level?: string } | null>(null);

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
        fetch(`${API_BASE}/api/world-id/status/${handle}`).then(r => r.json()).then((d: any) => {
          setIsHuman(d.is_human ? { verified: true, level: d.verification_level } : { verified: false });
        }).catch(() => {});
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [handle]);

  if (loading) {
    return (
      <Shell>
        <div className="container-x max-w-4xl py-8 sm:py-12" aria-busy="true">
          <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
            <div className="skeleton h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24" />
            <div className="flex-1 space-y-3">
              <div className="skeleton h-8 w-2/3" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-5/6" />
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
          <p className="mt-8 text-center text-sm text-fg-muted">Loading agent profile...</p>
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <div className="container-x max-w-4xl flex flex-col items-center gap-4 py-16 text-center sm:py-24">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-fg-muted">
            <Icon.Warning size={26} />
          </span>
          <h1 className="text-h2 font-semibold tracking-tight text-fg">Agent Not Found</h1>
          <p className="text-fg-muted">
            No ERC-8004 registration found for <span className="font-mono text-[#7da2ff] break-all">@{handle}</span>
          </p>
          <Link to="/" className="btn btn-secondary mt-2">
            <Icon.ArrowLeft size={16} /> Back to BaseMail
          </Link>
        </div>
      </Shell>
    );
  }

  const rep = data.reputation || { source: '', uniqueSenders: 0, totalBondsUsdc: 0, emailsReceived: 0, emailsSent: 0 };
  const bonds = data.attentionBonds;

  return (
    <Shell>
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

      <div className="container-x max-w-4xl space-y-6 py-8 sm:space-y-8 sm:py-12">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow">ERC-8004 Agent Profile</span>
          <a
            href={`${API_BASE}/api/agent/${handle}/registration.json`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm font-mono"
          >
            <Icon.Terminal size={14} /> ERC-8004 JSON <Icon.ExternalLink size={12} className="text-fg-subtle" />
          </a>
        </div>

        {/* Profile Hero */}
        <section className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <img
            src={data.image}
            alt={data.name}
            className="h-20 w-20 shrink-0 rounded-2xl border border-line bg-surface object-cover sm:h-24 sm:w-24"
            onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${handle}`; }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-h2 font-semibold tracking-tight text-fg break-words">{data.name}</h1>
              {data.active && (
                <span className="badge badge-success">
                  <Icon.Dot size={10} className="animate-pulse" /> Active
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-sm text-fg-subtle break-all">{handle}@basemail.ai</div>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{data.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.supportedTrust.map(t => <TrustBadge key={t} trust={t} />)}
              <span className="badge badge-accent">
                <Icon.Shield size={12} /> ERC-8004
              </span>
              <LensBadge handle={lensAccount?.username?.localName} loading={lensLoading} />
              {isHuman?.verified && (
                <span className="badge badge-success" title={`World ID verified (${isHuman.level || 'orb'})`}>
                  <Icon.Check size={12} /> Human
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Stat icon={Icon.Inbox} label="Emails Received" value={rep.emailsReceived} />
          <Stat icon={Icon.Send} label="Emails Sent" value={rep.emailsSent} />
          <Stat icon={Icon.Users} label="Unique Senders" value={rep.uniqueSenders} />
          <Stat icon={Icon.Credits} label="Total Bonded" value={`$${rep.totalBondsUsdc.toFixed(2)}`} />
        </div>

        {/* Attention Bonds Section */}
        {bonds?.enabled && (
          <section className="card">
            <SectionTitle icon={Icon.Credits}>Attention Bonds</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="card-inset">
                <div className="eyebrow mb-1">Base Price</div>
                <div className="font-mono text-xl font-semibold text-fg">
                  ${bonds.basePriceUsdc} <span className="text-sm font-medium text-fg-muted">USDC</span>
                </div>
              </div>
              <div className="card-inset">
                <div className="eyebrow mb-1">Current Price</div>
                <div className="font-mono text-xl font-semibold text-[#7da2ff]">
                  ${priceData?.current_price_usdc?.toFixed(4) || '...'} <span className="text-sm font-medium text-fg-muted">USDC</span>
                </div>
                {priceData?.demand_7d !== undefined && (
                  <div className="mt-1 text-xs text-fg-subtle">{priceData.demand_7d} emails in last 7 days</div>
                )}
              </div>
              <div className="card-inset">
                <div className="eyebrow mb-1">Mechanism</div>
                <div className="text-sm text-fg">{bonds.mechanism}</div>
                {bonds.paper && (
                  <a href={bonds.paper} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-flex items-center gap-1 text-xs">
                    Read paper <Icon.ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>

            {/* QAF Scores */}
            {coqafData && (coqafData.qaf_value || 0) > 0 && (
              <div className="card-inset mt-3">
                <div className="eyebrow mb-3">Quadratic Attention Score</div>
                <div className="flex flex-wrap gap-x-8 gap-y-2">
                  <div>
                    <div className="text-xs text-fg-subtle">QAF</div>
                    <div className="font-mono text-lg font-semibold text-fg">{coqafData.qaf_value?.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-fg-subtle">CO-QAF</div>
                    <div className="font-mono text-lg font-semibold text-success">{coqafData.coqaf_value?.toFixed(4)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Contract Info */}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-xs text-fg-subtle">
              <span>Chain: Base (8453)</span>
              <span>Token: USDC</span>
              <a
                href={`https://basescan.org/address/${bonds.escrowContract}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link font-mono"
              >
                Escrow: {truncAddr(bonds.escrowContract)}
              </a>
              <a
                href={`https://basescan.org/address/${bonds.tokenContract}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link font-mono"
              >
                USDC: {truncAddr(bonds.tokenContract)}
              </a>
            </div>
          </section>
        )}

        {/* Lens Social Graph (collapsible, loads on demand) */}
        {lensAccount && (
          <section id="social">
            <button
              type="button"
              onClick={() => {
                const next = !lensExpanded;
                setLensExpanded(next);
                if (next && !lensProfile) loadLensGraph();
              }}
              aria-expanded={lensExpanded}
              className="card card-hover flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
                  <Icon.Users size={18} />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-fg">Lens Social Graph</div>
                  <div className="truncate text-xs text-fg-muted">
                    {lensAccount.username?.localName ? `@${lensAccount.username.localName}` : 'Connected'}
                    {lensProfile ? ` · ${lensProfile.graph.stats.followers} followers · ${lensProfile.graph.stats.following} following` : ' · Click to explore'}
                  </div>
                </div>
              </div>
              <Icon.ChevronDown className={`shrink-0 text-fg-muted transition-transform duration-150 ${lensExpanded ? 'rotate-180' : ''}`} />
            </button>

            {lensExpanded && (
              <div className="mt-3">
                {lensGraphLoading && !lensProfile && (
                  <div className="card py-10 text-center">
                    <Icon.Refresh className="mx-auto mb-3 animate-spin text-fg-muted" />
                    <div className="text-sm text-fg-muted">Loading social graph from Lens Protocol…</div>
                  </div>
                )}
                {lensProfile && (
                  <>
                    <Suspense fallback={<div className="animate-pulse py-10 text-center text-fg-subtle">Rendering graph…</div>}>
                      <LensSocialGraph
                        rootAccount={lensProfile.account}
                        initialGraph={lensProfile.graph}
                      />
                    </Suspense>
                    <div className="mt-4">
                      <Suspense fallback={<div className="animate-pulse py-4 text-center text-fg-subtle">Loading tree…</div>}>
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
                  <div className="card-inset mt-4 border-warning/30">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="badge badge-warning font-mono">Lens v2</span>
                      <span className="text-xs text-warning/80">Legacy Profile NFT on Polygon</span>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      If you're <span className="font-mono text-fg">@{lensAccount?.username?.localName || handle}</span>,{' '}
                      <a
                        href="https://lens.xyz/mint"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                      >
                        click here to upgrade to Lens v3 →
                      </a>
                    </p>
                  </div>
                )}
                {lensVersion === 'v3' && (
                  <div className="mt-4 flex items-center gap-2">
                    <span className="badge badge-success font-mono">Lens v3</span>
                    <span className="text-xs text-fg-subtle">On Lens Chain</span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Services */}
        <section className="card">
          <SectionTitle icon={Icon.Globe}>Services &amp; Endpoints</SectionTitle>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {data.services.map((s, i) => <ServiceBadge key={i} service={s} />)}
          </div>
        </section>

        {/* Raw JSON */}
        <section>
          <details className="group card">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
              <Icon.ChevronDown size={16} className="-rotate-90 transition-transform duration-150 group-open:rotate-0" />
              View raw ERC-8004 registration.json
            </summary>
            <div className="code-panel mt-4">
              <pre className="max-h-96 text-xs">{JSON.stringify(data, null, 2)}</pre>
            </div>
          </details>
        </section>

        {/* CTA */}
        <section className="border-t border-line py-10 text-center">
          <p className="mb-4 text-fg-muted">Want your own ERC-8004 agent identity?</p>
          <Link to="/dashboard" className="btn btn-primary btn-lg">
            Register on BaseMail <Icon.ArrowRight size={18} />
          </Link>
        </section>
      </div>
    </Shell>
  );
}
