import { useState, useEffect, useRef, useCallback } from 'react';
import WorldIdVerify from '../components/WorldIdVerify';
import { Icon } from '../components/Icons';
import { Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect, useSignMessage, useSendTransaction, useBalance, useSwitchChain } from 'wagmi';
import { parseEther, formatUnits, encodeFunctionData, parseAbi, toHex } from 'viem';
import { base, mainnet } from 'wagmi/chains';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? '' : 'https://api.basemail.ai';
const DEPOSIT_ADDRESS = '0x4BbdB896eCEd7d202AD7933cEB220F7f39d0a9Fe';

// USDC Hackathon — Base Sepolia Testnet
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`;

// Attention Bond Escrow — Base Mainnet
const ESCROW_CONTRACT = '0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220' as `0x${string}`;
const BASE_MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const PAYMENT_ESCROW_ADDRESS = '0xaf41b976978ac981d79c1008dd71681355c71bf6' as `0x${string}`;
const PAYMENT_ESCROW_ABI = parseAbi([
  'function deposit(bytes32 claimId, uint256 amount, uint256 expiry) external',
]);
const ESCROW_ABI = parseAbi([
  'function deposit(address _recipient, bytes32 _emailId, uint256 _amount) external',
  'function setAttentionPrice(uint256 _price) external',
  'function getAttentionPrice(address _account) view returns (uint256)',
]);
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

interface EmailItem {
  id: string;
  from_addr: string;
  to_addr: string;
  subject: string | null;
  snippet: string | null;
  read: number;
  created_at: number;
  usdc_amount?: string | null;
  usdc_tx?: string | null;
  usdc_network?: string | null;
}

interface AuthState {
  token: string;
  wallet: string;
  handle: string | null;
  registered: boolean;
  basename?: string | null;
  tier?: 'free' | 'pro';
  suggested_handle?: string | null;
  suggested_source?: string | null;
  suggested_email?: string | null;
  pending_emails?: number;
  upgrade_available?: boolean;
  has_basename_nft?: boolean;
}


// ─── Animated Spinner ────────────────────────────────────
function ChainSearchSpinner({ maxSeconds = 30 }: { maxSeconds?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const progress = Math.min(elapsed / maxSeconds, 1);
  return (
    <div className="flex items-center gap-3 py-2" role="status" aria-live="polite">
      <div className="relative w-8 h-8">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle cx="16" cy="16" r="13" fill="none" stroke="#0052FF" strokeWidth="3"
            strokeDasharray={`${progress * 81.68} 81.68`}
            strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-mono text-fg-muted">
          {elapsed}s
        </span>
      </div>
      <div className="text-xs text-fg-muted">
        <span className="inline-flex">
          Verifying on-chain
          <span className="animate-pulse">...</span>
        </span>
        <div className="text-xs text-fg-subtle mt-0.5">
          {elapsed < 5 ? 'Checking Base...' : elapsed < 15 ? 'Checking ETH Mainnet...' : 'Waiting for confirmation...'}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────

function apiFetch(path: string, token: string, opts: RequestInit = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });
}

function truncateEmail(handle: string): string {
  if (handle.length <= 20) return `${handle}@basemail.ai`;
  return `${handle.slice(0, 6)}...${handle.slice(-4)}@basemail.ai`;
}

function CopyButton({ text, html, label }: { text: string; html?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            // Rich text copy: text/html + text/plain fallback
            await navigator.clipboard.write([
              new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([text], { type: 'text/plain' }),
              }),
            ]);
          } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            throw new Error('no clipboard');
          }
        } catch {
          // Ultimate fallback for restricted WebViews
          try { navigator.clipboard?.writeText(text); } catch { prompt('Copy:', text); }
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="btn btn-secondary btn-sm"
      title={label || 'Copy to clipboard'}
      aria-label={label || 'Copy to clipboard'}
    >
      {copied ? <Icon.Check size={14} className="text-success" /> : <Icon.Copy size={14} />}
      {copied ? 'Copied' : (label || 'Copy')}
    </button>
  );
}

// Small inline gold badge for BaseMail Pro accounts
function ProBadge({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block shrink-0"
      role="img"
      aria-label="BaseMail Pro"
    >
      <title>BaseMail Pro</title>
      <circle cx="12" cy="12" r="11" fill="url(#proGold)" stroke="#B8860B" strokeWidth="1" />
      <path d="M9 12.5l2 2 4-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="proGold" x1="0" y1="0" x2="24" y2="24">
          <stop stopColor="#FFD700" />
          <stop offset="1" stopColor="#FFA500" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ConfettiEffect() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {Array.from({ length: 50 }).map((_, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-10%`,
            width: `${6 + Math.random() * 8}px`,
            height: `${6 + Math.random() * 8}px`,
            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][Math.floor(Math.random() * 5)],
            borderRadius: Math.random() > 0.5 ? '50%' : '0',
            animation: `confetti-fall ${2 + Math.random() * 2}s ease-out forwards`,
            animationDelay: `${Math.random() * 0.5}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// Decode quoted-printable encoded strings
function decodeQuotedPrintable(str: string): string {
  // Remove soft line breaks (= at end of line)
  let decoded = str.replace(/=\r?\n/g, '');
  // Decode =XX hex sequences
  decoded = decoded.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  // Try to decode as UTF-8
  try {
    const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return decoded;
  }
}

// Extract readable text from raw MIME
function extractTextFromMime(raw: string): string {
  if (!raw) return '';

  // If multipart, extract text/plain part
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = raw.split('--' + boundary);
    for (const part of parts) {
      if (part.toLowerCase().includes('content-type: text/plain')) {
        const isQP = part.toLowerCase().includes('quoted-printable');
        const sep = part.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
        const bodyStart = part.indexOf(sep);
        if (bodyStart !== -1) {
          let body = part.slice(bodyStart + sep.length).trim();
          // Remove trailing boundary markers
          body = body.replace(/--$/, '').trim();
          return isQP ? decodeQuotedPrintable(body) : body;
        }
      }
    }
  }

  // Single part — check for quoted-printable
  const isQP = raw.toLowerCase().includes('content-transfer-encoding: quoted-printable');
  const sep = raw.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const headerEnd = raw.indexOf(sep);
  if (headerEnd === -1) return raw;
  let body = raw.slice(headerEnd + sep.length).trim();
  return isQP ? decodeQuotedPrintable(body) : body;
}

function extractHtmlFromMime(raw: string): string | null {
  if (!raw) return null;

  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/);
  if (!boundaryMatch) return null;

  const boundary = boundaryMatch[1];
  const parts = raw.split('--' + boundary);
  for (const part of parts) {
    if (part.toLowerCase().includes('content-type: text/html')) {
      const isQP = part.toLowerCase().includes('quoted-printable');
      const sep = part.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
      const bodyStart = part.indexOf(sep);
      if (bodyStart !== -1) {
        let body = part.slice(bodyStart + sep.length).trim();
        body = body.replace(/--$/, '').trim();
        return isQP ? decodeQuotedPrintable(body) : body;
      }
    }
  }
  return null;
}

// Clean snippet for inbox list (strip MIME artifacts + decode QP)
function cleanSnippet(snippet: string | null): string {
  if (!snippet) return '';
  // Remove MIME boundary lines and headers from snippet
  let clean = snippet
    .replace(/--[0-9a-f]+\s*/gi, '')
    .replace(/Content-Type:[^\n]+/gi, '')
    .replace(/Content-Transfer-Encoding:[^\n]+/gi, '')
    .replace(/charset="?[^"\s]+"?/gi, '')
    .trim();
  if (clean.length === 0) return snippet.slice(0, 100);
  // Decode quoted-printable if present
  if (/=[0-9A-Fa-f]{2}/.test(clean)) {
    clean = decodeQuotedPrintable(clean);
  }
  return clean;
}

// ─── Main Dashboard ──────────────────────────────────────

export default function Dashboard() {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const saved = sessionStorage.getItem('basemail_auth');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (auth) {
      sessionStorage.setItem('basemail_auth', JSON.stringify(auth));
    } else {
      sessionStorage.removeItem('basemail_auth');
    }
  }, [auth]);

  const location = useLocation();
  const { disconnect } = useDisconnect();
  const [showAltEmail, setShowAltEmail] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [showUpgradeConfetti, setShowUpgradeConfetti] = useState(false);
  // Sidebar is a slide-in drawer below md; start collapsed on small viewports
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );

  // Track viewport so the drawer behaviour only applies below md
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      setSidebarCollapsed(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Drawer: close on route change; while open, close on Escape, lock body scroll, move focus in
  const drawerOpen = isMobile && !sidebarCollapsed;
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (isMobile) setSidebarCollapsed(true);
  }, [location.pathname, isMobile]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarCollapsed(true); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      menuBtnRef.current?.focus();
    };
  }, [drawerOpen]);
  const [basenameInput, setBasenameInput] = useState(
    new URLSearchParams(location.search).get('claim') || ''
  );
  const [upgradeError, setUpgradeError] = useState('');

  // URL params: ?claim=name (verify ownership + upgrade) or ?buy=name (purchase + register)
  const urlParams = new URLSearchParams(location.search);
  const claimParam = urlParams.get('claim');
  const buyParam = urlParams.get('buy');
  // Only use PendingActionBanner for ?buy= (purchase flow). 
  // For ?claim=, we use the existing NFT upgrade banner with pre-filled input.
  const [pendingAction, setPendingAction] = useState<{ type: 'claim' | 'buy'; name: string } | null>(
    buyParam ? { type: 'buy', name: buyParam } : null
  );

  // Wallet balances for sidebar display
  const walletAddr = auth?.wallet as `0x${string}` | undefined;
  const { data: baseEth } = useBalance({ address: walletAddr, chainId: base.id });
  const { data: mainnetEth } = useBalance({ address: walletAddr, chainId: mainnet.id });
  const { data: baseUsdc } = useBalance({ address: walletAddr, chainId: base.id, token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' });
  const { data: mainnetUsdc } = useBalance({ address: walletAddr, chainId: mainnet.id, token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' });

  // USDC Hackathon — Base Sepolia testnet balances
  const { data: sepoliaEth } = useBalance({ address: walletAddr, chainId: BASE_SEPOLIA_CHAIN_ID });
  const { data: sepoliaUsdc } = useBalance({ address: walletAddr, chainId: BASE_SEPOLIA_CHAIN_ID, token: BASE_SEPOLIA_USDC });

  // USDC Send modal state
  const [showUsdcSend, setShowUsdcSend] = useState(false);

  // Sidebar badges
  const [sidebarUnread, setSidebarUnread] = useState(0);
  const [attentionConfigured, setAttentionConfigured] = useState(true); // assume true until checked
  const [attnBalance, setAttnBalance] = useState<{ balance: number; daily_earned: number; daily_earn_cap: number } | null>(null);

  useEffect(() => {
    if (!auth?.token) return;
    apiFetch('/api/inbox?folder=inbox&limit=1', auth.token).then(r => r.json()).then(d => setSidebarUnread(d.unread || 0)).catch(() => {});
    apiFetch('/api/attention/config', auth.token).then(r => r.json()).then(d => setAttentionConfigured(!!d.config?.enabled)).catch(() => setAttentionConfigured(true));
    apiFetch('/api/attn/balance', auth.token).then(r => r.json()).then(d => { if (d.balance !== undefined) setAttnBalance(d); }).catch(() => {});
  }, [auth?.token]);

  // Auto-detect Basename upgrade for 0x handle users
  useEffect(() => {
    if (!auth?.registered || !auth.handle || !/^0x/i.test(auth.handle)) return;
    if (auth.upgrade_available || auth.has_basename_nft) return; // Already checked

    fetch(`${API_BASE}/api/register/check/${auth.wallet}`)
      .then(r => r.json())
      .then(data => {
        if (data.basename && data.source === 'basename') {
          // Reverse resolution found the name
          setAuth(prev => prev ? {
            ...prev,
            basename: data.basename,
            suggested_handle: data.handle,
            suggested_source: data.source,
            suggested_email: data.email,
            upgrade_available: true,
          } : prev);
        } else if (data.has_basename_nft) {
          // User owns a Basename NFT but reverse resolution isn't set
          // Show manual input for the user to type their Basename
          setAuth(prev => prev ? {
            ...prev,
            has_basename_nft: true,
            upgrade_available: true,
          } : prev);
        }
      })
      .catch(() => {});
  }, [auth?.handle, auth?.wallet]);

  if (!auth) {
    return <ConnectWallet onAuth={setAuth} />;
  }

  if (!auth.registered || !auth.handle) {
    return (
      <RegisterEmail
        auth={auth}
        onRegistered={(handle, token) =>
          setAuth((prev) => (prev ? { ...prev, handle, registered: true, token } : prev))
        }
      />
    );
  }

  const a = auth!;
  const hasBasename = !!a.basename && !/^0x/i.test(a.handle!);
  // Can upgrade: either reverse resolution found the name, or we know they have a Basename NFT
  const hasKnownName = a.suggested_handle && /^0x/i.test(a.handle!);
  const hasNFTOnly = a.has_basename_nft && /^0x/i.test(a.handle!) && !a.suggested_handle;
  const canUpgrade = a.upgrade_available && (hasKnownName || hasNFTOnly);
  const primaryEmail = `${a.handle}@basemail.ai`;
  const altEmail = hasBasename ? `${a.wallet.toLowerCase()}@basemail.ai` : null;
  const displayEmail = showAltEmail && altEmail ? altEmail : primaryEmail;

  async function handleUpgrade(overrideBasename?: string, autoBuy?: boolean) {
    const basename = overrideBasename || a.basename;
    if (!basename && !basenameInput.trim()) {
      setUpgradeError('Please enter your Basename');
      return;
    }

    // Build the basename string
    let nameOnly = basename || basenameInput.trim();
    nameOnly = nameOnly.replace(/\.base\.eth$/i, '');
    const fullBasename = `${nameOnly}.base.eth`;

    setUpgrading(true);
    setUpgradeError('');

    try {
      let res: Response;

      if (autoBuy) {
        // Direct auto-purchase path (from ?buy= flow)
        res = await apiFetch('/api/register/upgrade', auth!.token, {
          method: 'PUT',
          body: JSON.stringify({ auto_basename: true, basename_name: nameOnly }),
        });
      } else {
        // First try claiming existing Basename (verify ownership)
        const tokenForUpgrade = auth!.token;
        res = await apiFetch('/api/register/upgrade', auth!.token, {
          method: 'PUT',
          body: JSON.stringify({ basename: fullBasename }),
        });

        // If ownership verification fails, try auto_basename (buy + register)
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          const errMsg = errData?.error || '';
          if (errMsg.includes('not own') || errMsg.includes('ownership') || errMsg.includes('not the owner') || errMsg.includes('Failed to verify')) {
            res = await apiFetch('/api/register/upgrade', auth!.token, {
              method: 'PUT',
              body: JSON.stringify({ auto_basename: true, basename_name: nameOnly }),
            });
          } else {
            throw new Error(errMsg || 'Upgrade failed');
          }
        }
      }
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(`Server error: ${text.slice(0, 100)}`); }
      if (!res.ok) throw new Error(data.error);
      setShowUpgradeConfetti(true);
      setTimeout(() => {
        setShowUpgradeConfetti(false);
        setAuth((prev) =>
          prev
            ? {
                ...prev,
                handle: data.handle,
                token: data.token,
                basename: data.basename,
                upgrade_available: false,
                has_basename_nft: false,
              }
            : prev,
        );
      }, 3500);
    } catch (e: any) {
      setUpgradeError(e.message || 'Upgrade failed');
    } finally {
      setUpgrading(false);
    }
  }

  const sectionTitle =
    location.pathname === '/dashboard' ? 'Inbox'
    : location.pathname === '/dashboard/sent' ? 'Sent'
    : location.pathname === '/dashboard/compose' ? 'Compose'
    : location.pathname === '/dashboard/credits' ? 'Credits'
    : location.pathname.startsWith('/dashboard/attn') ? '$ATTN'
    : location.pathname === '/dashboard/attention' ? 'Attention Bonds'
    : location.pathname === '/dashboard/settings' ? 'Settings'
    : location.pathname.startsWith('/dashboard/email/') ? 'Email'
    : 'Dashboard';
  const shortHandle = a.handle!.length > 14 ? `${a.handle!.slice(0, 6)}…${a.handle!.slice(-4)}` : a.handle!;

  return (
    <div className="min-h-screen bg-bg">
      {showUpgradeConfetti && <ConfettiEffect />}

      {/* Mobile top app bar */}
      <header className="md:hidden sticky top-0 z-20 h-12 flex items-center gap-2 px-3 bg-surface border-b border-line">
        <button ref={menuBtnRef}
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className="btn btn-ghost btn-icon"
          aria-label="Open menu"
          aria-expanded={!sidebarCollapsed}
        >
          <Icon.Menu size={20} />
        </button>
        <span className="text-sm font-semibold flex-1 truncate">{sectionTitle}</span>
        <span className="badge badge-accent font-mono shrink-0" title={displayEmail}>
          {auth.tier === 'pro' && <ProBadge size={12} />}
          {shortHandle}
        </span>
      </header>

      {/* Drawer backdrop (mobile only) */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 md:hidden transition-opacity duration-200 ${sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        onClick={() => setSidebarCollapsed(true)}
        aria-hidden="true"
      />

      {/* Sidebar (fixed on md+, slide-in drawer below md) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-line flex flex-col transform transition-transform duration-200 ease-in-out ${sidebarCollapsed ? '-translate-x-full' : 'translate-x-0'}`}
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label="Navigation"
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-line shrink-0">
          <Link to="/" className="flex items-center gap-2 flex-1 min-w-0">
            <Icon.Logo size={28} />
            <span className="text-base font-semibold tracking-tight">BaseMail</span>
          </Link>
          <button
            type="button"
            ref={closeBtnRef}
            onClick={() => { setSidebarCollapsed(true); menuBtnRef.current?.focus(); }}
            className="btn btn-ghost btn-icon"
            aria-label={isMobile ? 'Close menu' : 'Collapse sidebar'}
          >
            <Icon.Close size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {/* Email address card — with toggle for basename users */}
          <div className="card-inset mb-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="eyebrow flex items-center gap-1.5">
                {showAltEmail ? '0x Address' : 'Your Email'}
                {auth.tier === 'pro' && <ProBadge />}
              </span>
              {altEmail && (
                <button
                  type="button"
                  onClick={() => setShowAltEmail(!showAltEmail)}
                  className="text-fg-subtle hover:text-accent transition-colors duration-150"
                  title={showAltEmail ? 'Show Basename' : 'Show 0x address'}
                  aria-label={showAltEmail ? 'Show Basename' : 'Show 0x address'}
                >
                  <Icon.Refresh size={14} />
                </button>
              )}
            </div>
            <div className="text-accent font-mono text-sm truncate" title={displayEmail}>
              {showAltEmail && altEmail ? truncateEmail(auth.wallet.toLowerCase()) : truncateEmail(auth.handle!)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CopyButton text={displayEmail} label="Copy address" />
              <a href={`/agent/${auth.handle}`} className="btn btn-ghost btn-sm" title="Your public ERC-8004 profile">
                <Icon.Shield size={14} /> Public profile
              </a>
            </div>
            {altEmail && (
              <div className="text-fg-subtle text-xs mt-2 truncate">
                {showAltEmail ? 'Both addresses receive mail' : `Also: ${truncateEmail(auth.wallet.toLowerCase())}`}
              </div>
            )}
          </div>

          {/* Basename upgrade prompt */}
          {canUpgrade && hasKnownName && (
            <button
              type="button"
              onClick={() => handleUpgrade()}
              disabled={upgrading}
              className="btn btn-primary btn-sm w-full mb-4 min-w-0"
            >
              <span className="truncate">{upgrading ? 'Upgrading...' : `Upgrade to ${auth.suggested_handle}@basemail.ai`}</span>
            </button>
          )}
          {canUpgrade && hasNFTOnly && (
            <div className="card-inset border-l-2 border-l-accent py-2.5 mb-4 text-xs">
              <span className="text-accent font-medium">Basename Detected!</span>
            </div>
          )}

          <nav className="space-y-0.5" aria-label="Dashboard">
            <NavLink to="/dashboard" icon="inbox" label="Inbox" active={location.pathname === '/dashboard'} badge={sidebarUnread > 0 ? sidebarUnread : undefined} />
            <NavLink to="/dashboard/sent" icon="send" label="Sent" active={location.pathname === '/dashboard/sent'} />
            <NavLink to="/dashboard/compose" icon="edit" label="Compose" active={location.pathname === '/dashboard/compose'} />
            <NavLink to="/dashboard/credits" icon="credits" label="Credits" active={location.pathname === '/dashboard/credits'} />
            <NavLink to="/dashboard/attn" icon="attention" label="$ATTN" active={location.pathname.startsWith('/dashboard/attn')} badge={attnBalance ? attnBalance.balance : undefined} />
            <NavLink to="/dashboard/settings" icon="settings" label="Settings" active={location.pathname === '/dashboard/settings'} />
          </nav>
        </div>

        <div className="px-3 py-4 border-t border-line shrink-0">
          {/* Wallet balances */}
          <div className="mb-3 space-y-1">
            <div className="eyebrow mb-1.5">Balances</div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-subtle">Base ETH</span>
              <span className="text-fg-muted font-mono">{baseEth ? parseFloat(formatUnits(baseEth.value, 18)).toFixed(4) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-subtle">Base USDC</span>
              <span className="text-fg-muted font-mono">{baseUsdc ? parseFloat(formatUnits(baseUsdc.value, 6)).toFixed(2) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-subtle">ETH Main</span>
              <span className="text-fg-muted font-mono">{mainnetEth ? parseFloat(formatUnits(mainnetEth.value, 18)).toFixed(4) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-subtle">Main USDC</span>
              <span className="text-fg-muted font-mono">{mainnetUsdc ? parseFloat(formatUnits(mainnetUsdc.value, 6)).toFixed(2) : '—'}</span>
            </div>
          </div>
          {/* USDC Hackathon Box */}
          <div className="card-inset border-l-2 border-l-attn p-3 mb-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <a href="https://www.moltbook.com/m/usdc" target="_blank" rel="noopener noreferrer"
                className="eyebrow text-attn hover:text-fg transition-colors duration-150">
                USDC Hackathon
              </a>
              <span className="badge badge-attn">Testnet</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noopener noreferrer"
                  className="text-fg-subtle hover:text-attn transition-colors duration-150 underline decoration-dotted underline-offset-4" title="Get free testnet ETH">Sepolia ETH</a>
                <span className="text-fg-muted font-mono">{sepoliaEth ? parseFloat(formatUnits(sepoliaEth.value, 18)).toFixed(4) : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer"
                  className="text-fg-subtle hover:text-attn transition-colors duration-150 underline decoration-dotted underline-offset-4" title="Get free testnet USDC">Sepolia USDC</a>
                <span className="text-fg-muted font-mono">{sepoliaUsdc ? parseFloat(formatUnits(sepoliaUsdc.value, 6)).toFixed(2) : '—'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowUsdcSend(true)}
              className="btn btn-attn btn-sm w-full mt-2"
            >
              <Icon.Send size={14} /> Send USDC
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-subtle font-mono truncate" title={auth.wallet}>
              {auth.wallet.slice(0, 6)}...{auth.wallet.slice(-4)}
            </span>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('basemail_auth');
                disconnect();
                setAuth(null);
              }}
              className="text-xs text-fg-subtle hover:text-danger transition-colors duration-150 shrink-0"
            >
              Disconnect
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`min-w-0 ${sidebarCollapsed ? '' : 'md:pl-64'}`}>
        {/* Desktop: reopen a collapsed sidebar */}
        {!isMobile && sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="btn btn-secondary btn-icon fixed left-3 top-3 z-30"
            aria-label="Expand sidebar"
          >
            <Icon.Menu size={18} />
          </button>
        )}
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Pending action from URL params: ?claim=name or ?buy=name */}
          {pendingAction && auth?.handle && (
            <PendingActionBanner
              action={pendingAction}
              auth={auth}
              onUpgrade={handleUpgrade}
              upgrading={upgrading}
              error={upgradeError}
              onSessionExpired={() => {
                // Clear auth → forces re-SIWE; URL params preserved so claim resumes after
                sessionStorage.removeItem('basemail_auth');
                disconnect();
                setAuth(null);
              }}
              onDismiss={() => {
                setPendingAction(null);
                // Clean URL params
                window.history.replaceState({}, '', '/dashboard');
              }}
            />
          )}
          {/* Basename upgrade banner at top */}
          {!pendingAction && canUpgrade && hasKnownName && (
            <div className="card border-l-2 border-l-accent mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold mb-1">Basename Detected!</h3>
                <p className="text-fg-muted text-sm break-words">
                  You own <span className="text-accent font-medium">{auth.basename}</span> — upgrade your email from{' '}
                  <span className="font-mono text-fg-subtle text-xs">{truncateEmail(auth.handle!)}</span> to{' '}
                  <span className="text-accent font-semibold">{auth.suggested_handle}@basemail.ai</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleUpgrade()}
                disabled={upgrading}
                className="btn btn-primary shrink-0"
              >
                {upgrading ? 'Upgrading...' : 'Claim Basename Email'}
              </button>
            </div>
          )}
          {!pendingAction && ((canUpgrade && hasNFTOnly) || (claimParam && /^0x/i.test(a.handle!))) && (
            <div className="card border-l-2 border-l-accent mb-6">
              <h3 className="text-base font-semibold mb-1">{claimParam ? `Claim ${claimParam}.base.eth` : 'You own a Basename!'}</h3>
              <p className="text-fg-muted text-sm mb-4">
                {claimParam
                  ? 'Verify ownership and upgrade your email address.'
                  : 'We detected a Basename NFT in your wallet. Enter your Basename to upgrade your email.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="input-group flex-1 min-w-0">
                  <input
                    type="text"
                    value={basenameInput}
                    onChange={(e) => { setBasenameInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setUpgradeError(''); }}
                    placeholder="yourname"
                    className="font-mono"
                    aria-label="Basename"
                  />
                  <span className="suffix">.base.eth</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpgrade()}
                  disabled={upgrading || !basenameInput.trim()}
                  className="btn btn-primary shrink-0"
                >
                  {upgrading ? 'Verifying...' : 'Claim Email'}
                </button>
              </div>
              {upgradeError && <p className="text-danger text-sm mt-2">{upgradeError}</p>}
            </div>
          )}

          {/* Free Basename banner for 0x-handle users with no basename */}
          {!pendingAction && !canUpgrade && !a.basename && !a.has_basename_nft && /^0x/i.test(a.handle!) && (
            <div className="card border-l-2 border-l-success mb-6">
              <h3 className="text-base font-semibold text-success mb-1">Limited-Time: Free 1-Year Basename</h3>
              <p className="text-fg-muted text-sm mb-4 break-words">
                Upgrade from <span className="font-mono text-fg-subtle text-xs">{a.handle!.slice(0, 10)}...@basemail.ai</span> to <span className="text-accent font-medium">yourname@basemail.ai</span> — <span className="text-warning">1 year free, limited-time offer!</span> Renew on your own after expiry.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="input-group flex-1 min-w-0">
                  <input
                    type="text"
                    value={basenameInput}
                    onChange={(e) => { setBasenameInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setUpgradeError(''); }}
                    placeholder="yourname"
                    className="font-mono"
                    aria-label="Basename"
                  />
                  <span className="suffix">.base.eth</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!basenameInput.trim()) { setUpgradeError('Please enter a name'); return; }
                    handleUpgrade(basenameInput.trim(), true);
                  }}
                  disabled={upgrading || !basenameInput.trim()}
                  className="btn btn-primary shrink-0"
                >
                  {upgrading ? 'Registering...' : 'Get Free Name'}
                </button>
              </div>
              {upgradeError && <p className="text-danger text-sm mt-2">{upgradeError}</p>}
              <p className="text-fg-subtle text-xs mt-2 break-all">
                Your new email: <span className="text-accent font-mono">{basenameInput || 'yourname'}@basemail.ai</span>
              </p>
            </div>
          )}

          <Routes>
            <Route index element={<Inbox auth={auth} folder="inbox" />} />
            <Route path="sent" element={<Inbox auth={auth} folder="sent" />} />
            <Route path="compose" element={<Compose auth={auth} />} />
            <Route path="credits" element={<Credits auth={auth} />} />
            <Route path="attention" element={<Attention auth={auth} />} />
            <Route path="attn" element={<AttnDashboard auth={auth} />} />
            <Route path="settings" element={<Settings auth={auth} setAuth={setAuth} onUpgrade={handleUpgrade} upgrading={upgrading} />} />
            <Route path="email/:id" element={<EmailDetail auth={auth} />} />
          </Routes>
        </div>
      </main>

      {/* USDC Send Modal */}
      {showUsdcSend && auth.handle && (
        <UsdcSendModal auth={auth} onClose={() => setShowUsdcSend(false)} />
      )}
    </div>
  );
}

// ─── USDC Send Modal (Base Mainnet + Base Sepolia) ────────────
type UsdcNetwork = 'base-mainnet' | 'base-sepolia';
const USDC_NET_CONFIG: Record<UsdcNetwork, { chainId: number; usdc: `0x${string}`; label: string; badge: string; badgeColor: string; explorer: string }> = {
  'base-mainnet': {
    chainId: base.id,
    usdc: BASE_MAINNET_USDC,
    label: 'Base Mainnet',
    badge: 'Real USDC',
    badgeColor: 'badge-success',
    explorer: 'https://basescan.org',
  },
  'base-sepolia': {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    usdc: BASE_SEPOLIA_USDC,
    label: 'Base Sepolia (Testnet)',
    badge: 'Testnet',
    badgeColor: 'badge-attn',
    explorer: 'https://sepolia.basescan.org',
  },
};

function UsdcSendModal({ auth, onClose }: { auth: AuthState; onClose: () => void }) {
  const { switchChainAsync } = useSwitchChain();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState<UsdcNetwork>('base-mainnet');
  const [recipientWallet, setRecipientWallet] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [status, setStatus] = useState<'idle' | 'switching' | 'approving' | 'depositing' | 'transferring' | 'confirming' | 'sending_email' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [expiryHours, setExpiryHours] = useState(168); // 7 days default
  const { writeContractAsync } = useWriteContract();

  // Detect escrow mode: external email (not @basemail.ai)
  const isEscrow = recipient.includes('@') && !recipient.toLowerCase().endsWith('@basemail.ai');

  // Resolve recipient handle → wallet (skip for escrow/external email)
  useEffect(() => {
    if (!recipient || recipient.length < 2) {
      setRecipientWallet('');
      setResolveError('');
      return;
    }
    // External email → escrow mode, no wallet needed
    if (recipient.includes('@') && !recipient.toLowerCase().endsWith('@basemail.ai')) {
      setRecipientWallet('');
      setResolveError('');
      return;
    }
    const handle = recipient.replace(/@basemail\.ai$/i, '').toLowerCase();
    const timeout = setTimeout(async () => {
      setResolving(true);
      setResolveError('');
      try {
        const res = await fetch(`${API_BASE}/api/identity/${handle}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Not found');
        setRecipientWallet(data.wallet);
      } catch {
        setRecipientWallet('');
        setResolveError('Recipient not found');
      } finally {
        setResolving(false);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [recipient]);

  async function handleSend() {
    if (!amount || parseFloat(amount) <= 0) return;
    if (!isEscrow && !recipientWallet) return;
    setError('');

    const net = USDC_NET_CONFIG[network];
    const amountRaw = BigInt(Math.floor(parseFloat(amount) * 1e6));
    const amountStr = parseFloat(amount).toFixed(2);
    const networkLabel = network === 'base-mainnet' ? 'Base' : 'Base Sepolia (testnet)';

    try {
      // 1. Switch to selected network
      setStatus('switching');
      await switchChainAsync({ chainId: net.chainId });

      if (isEscrow) {
        // ── Escrow mode: external email ──
        const { keccak256 } = await import('viem');
        const claimId = crypto.randomUUID();
        const claimIdHash = keccak256(toHex(claimId));
        const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + expiryHours * 3600);

        // 2a. Approve USDC spending
        setStatus('approving');
        await writeContractAsync({
          address: net.usdc,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [PAYMENT_ESCROW_ADDRESS, amountRaw],
          chainId: net.chainId,
        });

        // 2b. Deposit to PaymentEscrow
        setStatus('depositing');
        const hash = await writeContractAsync({
          address: PAYMENT_ESCROW_ADDRESS,
          abi: PAYMENT_ESCROW_ABI,
          functionName: 'deposit',
          args: [claimIdHash, amountRaw, expiryTimestamp],
          chainId: net.chainId,
        });
        setTxHash(hash);

        // 3. Send email with claim link
        setStatus('sending_email');
        const claimUrl = `https://basemail.ai/claim/${claimId}`;
        const res = await apiFetch('/api/send', auth.token, {
          method: 'POST',
          body: JSON.stringify({
            to: recipient,
            subject: `💸 You received ${amountStr} USDC — Claim now`,
            body: `${auth.handle} sent you ${amountStr} USDC on ${networkLabel}!\n\n` +
              `Click to claim: ${claimUrl}\n\n` +
              `This payment is held in escrow. No crypto wallet? One will be created for you automatically.\n\n` +
              `Expires: ${new Date(Number(expiryTimestamp) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n\n` +
              `Sent via BaseMail.ai`,
            escrow_claim: {
              claim_id: claimId,
              amount: amountStr,
              deposit_tx: hash,
              network,
              expires_at: Number(expiryTimestamp),
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send claim email');
      } else {
        // ── Direct transfer: internal BaseMail user ──
        setStatus('transferring');
        const handle = recipient.replace(/@basemail\.ai$/i, '').toLowerCase();
        const memo = new TextEncoder().encode(`basemail:${handle}@basemail.ai`);
        const memoHex = Array.from(memo).map(b => b.toString(16).padStart(2, '0')).join('');

        const hash = await writeContractAsync({
          address: net.usdc,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipientWallet as `0x${string}`, amountRaw],
          chainId: net.chainId,
          dataSuffix: `0x${memoHex}` as `0x${string}`,
        });
        setTxHash(hash);

        // Send verified payment email
        setStatus('sending_email');
        const emailTo = `${handle}@basemail.ai`;
        const res = await apiFetch('/api/send', auth.token, {
          method: 'POST',
          body: JSON.stringify({
            to: emailTo,
            subject: `USDC Payment: $${amountStr}`,
            body: `You received a payment of ${amountStr} USDC on ${networkLabel}.\n\nTransaction: ${net.explorer}/tx/${hash}\n\nSent via BaseMail.ai`,
            usdc_payment: { tx_hash: hash, amount: amountStr, network },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send payment email');
      }

      setStatus('success');
    } catch (e: any) {
      setError(e.message || 'Transaction failed');
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="usdc-send-title">
      <div className="card w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 id="usdc-send-title" className="text-h3 font-semibold">Send USDC</h3>
            <span className={`badge ${USDC_NET_CONFIG[network].badgeColor} mt-1`}>{USDC_NET_CONFIG[network].badge}</span>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon -mr-2" aria-label="Close">
            <Icon.Close size={18} />
          </button>
        </div>

        {status === 'success' ? (
          <div className="text-center py-6">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-success/15 text-success flex items-center justify-center">
              <Icon.Check size={24} />
            </div>
            <h4 className="text-xl font-semibold text-success mb-2">{isEscrow ? 'Escrow Deposited!' : 'Payment Sent!'}</h4>
            <p className="text-fg-muted text-sm mb-2 break-words">
              {parseFloat(amount).toFixed(2)} USDC {isEscrow ? 'escrowed for' : 'sent to'} {recipient}
            </p>
            {isEscrow && (
              <p className="text-warning text-xs mb-2">
                Claim email sent! Recipient can claim with one click.
              </p>
            )}
            {txHash && (
              <a
                href={`${USDC_NET_CONFIG[network].explorer}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link text-xs"
              >
                View on BaseScan
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary w-full mt-4"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Recipient */}
            <div className="mb-4">
              <label className="field-label" htmlFor="usdc-recipient">Recipient</label>
              <input
                id="usdc-recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.toLowerCase().trim())}
                placeholder="handle@basemail.ai or email@gmail.com"
                className="input input-mono"
              />
              {resolving && <p className="field-hint">Resolving...</p>}
              {!isEscrow && resolveError && <p className="mt-1.5 text-xs text-danger">{resolveError}</p>}
              {!isEscrow && recipientWallet && (
                <p className="mt-1.5 text-xs text-success font-mono">
                  {recipientWallet.slice(0, 6)}...{recipientWallet.slice(-4)}
                </p>
              )}
              {isEscrow && recipient.includes('@') && (
                <p className="mt-1.5 text-xs text-warning">External email — USDC will be held in escrow</p>
              )}
            </div>

            {/* Network Selector */}
            <div className="mb-4">
              <span className="field-label">Network</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNetwork('base-mainnet')}
                  aria-pressed={network === 'base-mainnet'}
                  className={`btn ${network === 'base-mainnet' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Base Mainnet
                </button>
                <button
                  type="button"
                  onClick={() => setNetwork('base-sepolia')}
                  aria-pressed={network === 'base-sepolia'}
                  className={`btn ${network === 'base-sepolia' ? 'btn-attn' : 'btn-secondary'}`}
                >
                  Testnet
                </button>
              </div>
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="field-label" htmlFor="usdc-amount">Amount (USDC)</label>
              <input
                id="usdc-amount"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="10.00"
                className="input input-mono"
              />
              {isEscrow && parseFloat(amount) > 0 && parseFloat(amount) < 0.1 && (
                <p className="mt-1.5 text-xs text-danger">Minimum escrow: 0.10 USDC</p>
              )}
            </div>

            {/* Escrow: Expiry selector */}
            {isEscrow && (
              <div className="mb-4">
                <span className="field-label">Claim Expiry</span>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '1h', hours: 1 },
                    { label: '24h', hours: 24 },
                    { label: '7d', hours: 168 },
                    { label: '30d', hours: 720 },
                  ].map(opt => (
                    <button
                      key={opt.hours}
                      type="button"
                      onClick={() => setExpiryHours(opt.hours)}
                      aria-pressed={expiryHours === opt.hours}
                      className={`btn px-2 ${expiryHours === opt.hours ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="card-inset mb-4 text-xs text-fg-subtle space-y-1">
              {isEscrow ? (
                <>
                  <p className="text-warning font-medium">Escrow Mode</p>
                  <p>USDC deposited to on-chain escrow contract. Recipient gets an email with a claim link.</p>
                  <p>No crypto wallet needed — a BaseMail account is auto-created when they claim.</p>
                  <p>If unclaimed, you can refund after the expiry period.</p>
                </>
              ) : (
                <>
                  <p>Payment goes directly to recipient's wallet on {USDC_NET_CONFIG[network].label}.</p>
                  <p className="text-fg-muted font-mono break-all">On-chain memo: basemail:{recipient || '...'}@basemail.ai</p>
                </>
              )}
              {network === 'base-mainnet' && (
                <p className="text-warning flex items-start gap-1.5">
                  <Icon.Warning size={14} className="mt-0.5" />
                  <span>This sends real USDC. Double-check the recipient.</span>
                </p>
              )}
              <p>A {isEscrow ? 'claim' : 'verified payment'} email will be sent automatically.</p>
            </div>

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={(!isEscrow && !recipientWallet) || !amount || parseFloat(amount) <= 0 || (isEscrow && parseFloat(amount) < 0.1) || (status !== 'idle' && status !== 'error')}
              className={`btn btn-lg w-full ${network === 'base-mainnet' ? 'btn-primary' : 'btn-attn'}`}
            >
              {status === 'switching' ? `Switching to ${USDC_NET_CONFIG[network].label}...`
                : status === 'approving' ? 'Approve USDC spending...'
                : status === 'depositing' ? 'Depositing to escrow...'
                : status === 'transferring' ? 'Confirm in wallet...'
                : status === 'confirming' ? 'Waiting for confirmation...'
                : status === 'sending_email' ? (isEscrow ? 'Sending claim email...' : 'Sending payment email...')
                : isEscrow ? `Escrow ${amount || '0'} USDC` : `Send ${amount || '0'} USDC`}
            </button>

            {error && <p className="text-danger text-sm mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function NavLink({ to, icon, label, active, badge }: { to: string; icon: string; label: string; active: boolean; badge?: number | string }) {
  const icons: Record<string, typeof Icon.Inbox> = {
    inbox: Icon.Inbox,
    send: Icon.Send,
    edit: Icon.Compose,
    settings: Icon.Settings,
    credits: Icon.Credits,
    attention: Icon.Attn,
  };
  const NavIcon = icons[icon] || Icon.Mail;
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
        active ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg hover:bg-surface-2'
      }`}
    >
      <NavIcon size={18} />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge !== 0 && (
        <span className={`badge ${
          typeof badge === 'string' ? 'badge-danger' : active ? 'badge-accent' : 'badge-neutral'
        }`}>{badge}</span>
      )}
    </Link>
  );
}

// ─── Connect Wallet ─────────────────────────────────────
function ConnectWallet({ onAuth }: { onAuth: (auth: AuthState) => void }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const doSiwe = useCallback(async (addr: string) => {
    try {
      setStatus('Preparing sign-in...');
      setError('');

      // 2-step flow: POST /start → sign → POST /verify
      const startRes = await fetch(`${API_BASE}/api/auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || 'Failed to start authentication');
      }
      const { message } = await startRes.json();

      setStatus('Please sign the message in your wallet...');
      const signature = await signMessageAsync({ message });

      setStatus('Verifying...');
      const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, signature, message }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Verification failed');
      }

      const data = await verifyRes.json();
      onAuth({
        token: data.token,
        wallet: data.wallet,
        handle: data.handle,
        registered: data.registered,
        basename: data.basename,
        tier: data.tier || 'free',
        suggested_handle: data.suggested_handle,
        suggested_source: data.suggested_source,
        suggested_email: data.suggested_email,
        pending_emails: data.pending_emails || 0,
        upgrade_available: data.upgrade_available || false,
        has_basename_nft: data.has_basename_nft || false,
      });
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
      setStatus('');
    }
  }, [signMessageAsync, onAuth]);

  useEffect(() => {
    if (isConnected && address && !status) {
      doSiwe(address);
    }
  }, [isConnected, address]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="card w-full max-w-md text-center">
        <Icon.Logo size={56} className="block mx-auto mb-6" />
        <h1 className="text-h3 font-semibold mb-2">BaseMail Dashboard</h1>
        <p className="text-fg-muted mb-8">Connect your Base wallet to access your agent's email.</p>

        {error && (
          <div className="card-inset border-l-2 border-l-danger text-danger text-sm text-left mb-4">
            {error}
          </div>
        )}

        {status ? (
          <div className="text-accent text-sm font-mono py-3">{status}</div>
        ) : (
          <div className="space-y-3">
            {connectors.map((connector) => {
              const isCoinbase = connector.id === 'coinbaseWalletSDK';
              // 隱藏重複：Coinbase Smart Wallet 會 inject window.ethereum
              if (connector.id === 'injected' && connector.name === 'Coinbase Wallet') return null;
              // 隱藏 injected 如果沒有瀏覽器錢包（WalletConnect 已覆蓋）
              if (connector.id === 'injected' && typeof window !== 'undefined' && !(window as any).ethereum) return null;

              return (
                <button
                  key={connector.uid}
                  type="button"
                  onClick={() => connect({ connector })}
                  disabled={isConnecting}
                  className={`btn btn-lg w-full ${isCoinbase ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {isConnecting ? 'Connecting...' : `Connect with ${connector.name}`}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-fg-subtle text-xs mt-6">
          Sign-In with Ethereum (SIWE) — No passwords, no CAPTCHAs
        </p>
      </div>
    </div>
  );
}

// ─── Register Email ─────────────────────────────────────
function RegisterEmail({
  auth,
  onRegistered,
}: {
  auth: AuthState;
  onRegistered: (handle: string, token: string) => void;
}) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [claimedHandle, setClaimedHandle] = useState('');
  const [claimedToken, setClaimedToken] = useState('');

  const suggestedEmail = auth.suggested_email || `${auth.wallet}@basemail.ai`;
  const isBasename = auth.suggested_source === 'basename';
  const shortAddr = auth.wallet ? `${auth.wallet.slice(0, 6)}...${auth.wallet.slice(-4)}` : '';

  async function handleRegister() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/register', auth.token, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setClaimedHandle(data.handle);
      // /api/register issues a new JWT that carries the handle — the pre-register
      // token has handle:'' and every authed endpoint (send/inbox) rejects it.
      setClaimedToken(data.token || auth.token);
      setClaimed(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Success screen after claim
  if (claimed) {
    const claimedEmail = `${claimedHandle}@basemail.ai`;
    const altEmail = `${auth.wallet.toLowerCase()}@basemail.ai`;
    const hasAlt = claimedHandle !== auth.wallet.toLowerCase();

    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        {showConfetti && <ConfettiEffect />}

        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-success/15 text-success flex items-center justify-center">
            <Icon.Check size={28} />
          </div>
          <h1 className="text-h3 font-semibold font-mono text-accent mb-1 break-all">
            {claimedEmail}
          </h1>
          <p className="text-success font-medium text-lg mb-6">is yours!</p>

          {hasAlt && (
            <div className="card-inset text-left mb-6">
              <div className="text-fg-subtle text-xs mb-2">Also receives email at:</div>
              <div className="font-mono text-sm text-fg-muted break-all">
                {altEmail}
              </div>
              <div className="text-fg-subtle text-xs mt-1">
                Both addresses deliver to the same inbox.
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onRegistered(claimedHandle, claimedToken || auth.token)}
            className="btn btn-primary btn-lg w-full"
          >
            Enter Inbox <Icon.ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // Claim screen
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        {isBasename ? (
          <>
            <div className="text-center mb-6">
              <Icon.Spark size={40} className="block mx-auto mb-4 text-accent" />
              <h1 className="text-h3 font-semibold mb-2">Basename Detected!</h1>
              <p className="text-fg-muted">
                Your Basename <span className="text-accent font-medium">{auth.basename}</span> is linked to this wallet.
              </p>
            </div>

            <div className="card-inset text-center mb-6">
              <div className="text-fg-subtle text-xs mb-2">Your Email Address</div>
              <div className="text-xl font-mono text-accent font-semibold break-all">
                {suggestedEmail}
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-h3 font-semibold mb-2">Claim Your Email</h1>
            <p className="text-fg-muted mb-6">
              Your wallet address will be your email identity.
            </p>

            <div className="card-inset mb-4">
              <div className="text-fg-subtle text-xs mb-2">Your Email Address</div>
              <div className="text-lg font-mono text-accent font-semibold break-all">
                {suggestedEmail}
              </div>
              <div className="text-fg-subtle text-xs mt-2">
                Wallet: <span className="text-fg-muted font-mono">{shortAddr}</span>
              </div>
            </div>
          </>
        )}

        {auth.pending_emails && auth.pending_emails > 0 ? (
          <div className="card-inset border-l-2 border-l-accent text-sm mb-4">
            You have <span className="font-semibold">{auth.pending_emails}</span> email{auth.pending_emails > 1 ? 's' : ''} waiting for you!
          </div>
        ) : null}

        {!isBasename && (
          <div className="card-inset text-xs text-fg-muted mb-4">
            No Basename detected. You can upgrade your email later by registering a{' '}
            <a href="https://www.base.org/names" target="_blank" rel="noopener noreferrer" className="link">
              Basename
            </a>.
          </div>
        )}

        {error && <p className="text-danger text-sm mb-4">{error}</p>}

        <button
          type="button"
          onClick={handleRegister}
          disabled={submitting}
          className="btn btn-primary btn-lg w-full"
        >
          {submitting ? 'Claiming...' : isBasename ? 'Claim My Email' : 'Claim Email'}
        </button>
      </div>
    </div>
  );
}

// ─── Inbox / Sent ───────────────────────────────────────
function Inbox({ auth, folder }: { auth: AuthState; folder: string }) {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [bondedCount, setBondedCount] = useState(0);
  const [filterBonded, setFilterBonded] = useState(false);
  const [bondSort, setBondSort] = useState<'deadline' | 'bond_amount'>('deadline');
  const [filterAttn, setFilterAttn] = useState<'all' | 'pending' | 'returned'>('all');
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const filterContact = searchParams.get('contact');
  const filterUnread = searchParams.get('unread') === '1';

  const fetchInbox = useCallback(() => {
    setLoading(true);
    const params = filterBonded
      ? `folder=inbox&bonded=true&sort=${bondSort}&limit=50`
      : `folder=${folder}&limit=50`;
    apiFetch(`/api/inbox?${params}`, auth.token)
      .then((r) => r.json())
      .then((data) => {
        setEmails(data.emails || []);
        setTotal(data.total || 0);
        setUnread(data.unread || 0);
        setBondedCount(data.bonded_count || 0);
      })
      .catch(() => setEmails([]))
      .finally(() => setLoading(false));
  }, [folder, auth.token, filterBonded, bondSort]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  const chip = (activeCls: string, isActive: boolean) =>
    `inline-flex items-center h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
      isActive ? activeCls : 'bg-surface-2 text-fg-muted hover:text-fg'
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-h3 font-semibold flex items-center gap-2">
          {folder === 'inbox' ? 'Inbox' : 'Sent'}
          {unread > 0 && (
            <span className="badge badge-accent">
              {unread}
            </span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {folder === 'inbox' && unread > 0 && (
            <button
              type="button"
              onClick={async () => {
                await apiFetch('/api/inbox/mark-read', auth.token, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ folder: 'inbox' }),
                });
                setEmails((prev) => prev.map((e) => ({ ...e, read: 1 })));
                setUnread(0);
              }}
              className="btn btn-ghost btn-sm"
            >
              Mark all as read
            </button>
          )}
          <span className="text-fg-subtle text-sm">{total} emails{unread > 0 ? ` · ${unread} unread` : ''}</span>
        </div>
      </div>

      {/* Bonded filter bar */}
      {(folder === 'inbox' || folder === 'sent') && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button type="button" onClick={() => { setFilterBonded(false); setFilterAttn('all'); }} aria-pressed={!filterBonded && filterAttn === 'all'} className={chip('bg-accent text-white', !filterBonded && filterAttn === 'all')}>All</button>
          <button type="button" onClick={() => { setFilterAttn('pending'); setFilterBonded(false); }} aria-pressed={filterAttn === 'pending' && !filterBonded} className={chip('badge-attn', filterAttn === 'pending' && !filterBonded)}>
            Pending
          </button>
          <button type="button" onClick={() => { setFilterAttn('returned'); setFilterBonded(false); }} aria-pressed={filterAttn === 'returned' && !filterBonded} className={chip('badge-success', filterAttn === 'returned' && !filterBonded)}>
            Returned
          </button>
          {folder === 'inbox' && <button type="button" onClick={() => { setFilterBonded(true); setFilterAttn('all'); }} aria-pressed={filterBonded} className={chip('badge-warning', filterBonded)}>
            Bonded{bondedCount > 0 ? ` (${bondedCount})` : ''}
          </button>}
          {filterBonded && folder === 'inbox' && (
            <div className="flex items-center gap-1 sm:ml-2">
              <span className="text-fg-subtle text-xs">Sort:</span>
              <button type="button" onClick={() => setBondSort('deadline')} className={`btn btn-ghost btn-sm ${bondSort === 'deadline' ? 'bg-surface-2 text-fg' : ''}`}>Deadline</button>
              <button type="button" onClick={() => setBondSort('bond_amount')} className={`btn btn-ghost btn-sm ${bondSort === 'bond_amount' ? 'bg-surface-2 text-fg' : ''}`}>Amount</button>
            </div>
          )}
        </div>
      )}

      {filterContact && (
        <div className="card-inset border-l-2 border-l-attn flex flex-wrap items-center gap-2 py-2 mb-4">
          <span className="text-fg-muted text-sm min-w-0 break-all">
            {folder === 'inbox' ? `From ${filterContact}` : `To ${filterContact}`}{filterUnread ? ' · unread only' : ''}
          </span>
          <Link to={folder === 'inbox' ? '/dashboard' : '/dashboard/sent'} className="ml-auto btn btn-ghost btn-sm"><Icon.Close size={14} /> Clear</Link>
        </div>
      )}

      {loading ? (
        <div className="divide-y divide-line" aria-busy="true" aria-label="Loading emails">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-3 py-3">
              <div className="skeleton w-1.5 h-1.5 rounded-full mt-2 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between gap-3">
                  <div className="skeleton h-3.5 w-1/3" />
                  <div className="skeleton h-3 w-16" />
                </div>
                <div className="skeleton h-3.5 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : emails.length === 0 ? (
        <div className="text-center py-20 text-fg-subtle">
          {folder === 'inbox'
            ? <Icon.Inbox size={36} className="block mx-auto mb-3" />
            : <Icon.Send size={36} className="block mx-auto mb-3" />}
          <p>No emails yet</p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {emails.filter((email) => {
            if (filterAttn === 'pending') return (email as any).attn_stake > 0 && (email as any).attn_status === 'pending';
            if (filterAttn === 'returned') return (email as any).attn_stake > 0 && ['refunded', 'rejected', 'transferred', 'expired'].includes((email as any).attn_status);
            if (filterContact) {
              const contactAddr = `${filterContact}@basemail.ai`.toLowerCase();
              const match = folder === 'inbox'
                ? email.from_addr?.toLowerCase() === contactAddr
                : email.to_addr?.toLowerCase() === contactAddr;
              if (!match) return false;
              if (filterUnread && folder === 'inbox' && email.read) return false;
            }
            return true;
          }).map((email) => {
            const attnStatus: string = (email as any).attn_status;
            const attnBadge =
              attnStatus === 'pending' ? 'badge-attn' :
              attnStatus === 'refunded' ? 'badge-success' :
              attnStatus === 'rejected' || attnStatus === 'transferred' ? 'badge-danger' :
              attnStatus === 'expired' ? (folder === 'sent' ? 'badge-neutral' : 'badge-warning') :
              'badge-neutral';
            const attnLabel = folder === 'sent'
              ? (attnStatus === 'pending' ? 'Pending' :
                 attnStatus === 'refunded' ? 'Refunded' :
                 attnStatus === 'rejected' || attnStatus === 'transferred' ? 'Forfeited' :
                 attnStatus === 'expired' ? 'Expired' : 'Staked')
              : (attnStatus === 'pending' ? 'Pending' :
                 attnStatus === 'refunded' ? 'Returned' :
                 attnStatus === 'rejected' || attnStatus === 'transferred' ? 'Earned' :
                 attnStatus === 'expired' ? 'Earned' : 'Staked');
            const when = new Date(email.created_at * 1000);
            return (
            <Link
              key={email.id}
              to={`/dashboard/email/${email.id}`}
              className={`block px-3 py-3 hover:bg-surface-2 transition-colors duration-150 ${
                !email.read ? 'bg-surface' : ''
              }`}
            >
              <div className="flex gap-3">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${!email.read ? 'bg-accent' : 'bg-transparent'}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`font-mono text-sm truncate min-w-0 ${!email.read ? 'text-fg font-medium' : 'text-fg-muted'}`}>
                      {folder === 'inbox' ? email.from_addr : email.to_addr}
                    </span>
                    <span className="text-fg-subtle text-xs shrink-0">
                      <span className="sm:hidden">{when.toLocaleDateString()}</span>
                      <span className="hidden sm:inline">{when.toLocaleString()}</span>
                    </span>
                  </div>
                  <div className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm min-w-0 ${!email.read ? 'text-fg font-medium' : 'text-fg-muted'}`}>
                    {(email as any).bond_amount && (email as any).bond_status === 'active' && (() => {
                      const remaining = ((email as any).bond_deadline - Math.floor(Date.now() / 1000)) / 3600;
                      return (
                        <>
                          <span className="badge badge-warning" title="Attention Bond">
                            ${Number((email as any).bond_amount).toFixed(2)}
                          </span>
                          <span className={`badge font-mono ${remaining < 6 ? 'badge-danger' : 'badge-neutral'}`} title="Time to reply">
                            {remaining > 0 ? (remaining < 1 ? `${Math.round(remaining * 60)}m` : `${Math.round(remaining)}h`) : 'expired'}
                          </span>
                        </>
                      );
                    })()}
                    {email.usdc_amount && (
                      <span className="badge badge-success" title="Verified USDC Payment">
                        ${email.usdc_amount}
                      </span>
                    )}
                    {(email as any).attn_stake > 0 && (
                      <span className={`badge ${attnBadge}`} title={`$ATTN: ${attnStatus}`}>
                        {attnLabel} {(email as any).attn_stake} ATTN
                      </span>
                    )}
                    <span className="truncate min-w-0 flex-1">{email.subject || '(no subject)'}</span>
                  </div>
                  <div className="text-fg-subtle text-xs truncate mt-0.5">{cleanSnippet(email.snippet)}</div>
                </div>
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Email Detail ───────────────────────────────────────
function EmailDetail({ auth }: { auth: AuthState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiFetch(`/api/inbox/${id}`, auth.token)
      .then((r) => r.json())
      .then(setEmail)
      .catch(() => setEmail(null))
      .finally(() => setLoading(false));
  }, [id, auth.token]);

  async function handleDelete() {
    if (!confirm('Delete this email?')) return;
    setDeleting(true);
    await apiFetch(`/api/inbox/${id}`, auth.token, { method: 'DELETE' });
    navigate('/dashboard');
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4" aria-busy="true" aria-label="Loading email">
        <div className="skeleton h-8 w-24" />
        <div className="card space-y-3">
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!email || email.error) {
    return (
      <div className="text-center py-20">
        <p className="text-danger mb-4">Email not found</p>
        <Link to="/dashboard" className="link">Back to Inbox</Link>
      </div>
    );
  }

  const bodyText = extractTextFromMime(email.body || '');
  const bodyHtml = extractHtmlFromMime(email.body || '');

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Link to="/dashboard" className="btn btn-ghost btn-sm -ml-2">
          <Icon.ArrowLeft size={16} /> Back
        </Link>
        <div className="flex-1" />
        <Link
          to={`/dashboard/compose?reply=${id}&to=${encodeURIComponent(email.from_addr)}&subject=${encodeURIComponent('Re: ' + (email.subject || ''))}`}
          className="btn btn-secondary btn-sm"
        >
          <Icon.Reply size={14} /> Reply
        </Link>
        {email.folder === 'inbox' && !email.read && (
          <button
            type="button"
            onClick={async () => {
              if (!confirm('Reject this email? You\'ll receive ATTN compensation.')) return;
              const res = await apiFetch(`/api/inbox/${id}/reject`, auth.token, { method: 'POST' });
              const data = await res.json();
              if (data.success) {
                setEmail((prev: any) => prev ? { ...prev, read: 1 } : prev);
                alert(data.attn_received > 0 ? `Rejected! You received ${data.attn_received} ATTN.` : 'Rejected.');
              }
            }}
            className="btn btn-secondary btn-sm text-warning"
            title="Reject — don't read, earn ATTN compensation"
          >
            <Icon.Ban size={14} /> Reject
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn btn-danger btn-sm"
        >
          <Icon.Trash size={14} /> {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      <div className="card">
        <h1 className="text-h3 font-semibold mb-4 break-words">{email.subject || '(no subject)'}</h1>

        {/* Verified USDC Payment banner */}
        {email.usdc_amount && (
          <div className="card-inset border-l-2 border-l-success mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-success/15 text-success flex items-center justify-center font-mono font-semibold">$</span>
              <div>
                <div className="text-success font-semibold text-lg">{email.usdc_amount} USDC</div>
                <div className="text-fg-subtle text-xs">Verified USDC Payment</div>
              </div>
            </div>
            {email.usdc_tx && (
              <a
                href={`${email.usdc_network === 'base-mainnet' ? 'https://basescan.org' : 'https://sepolia.basescan.org'}/tx/${email.usdc_tx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link text-xs"
              >
                View on BaseScan
              </a>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-4 gap-y-1 text-sm text-fg-muted mb-6 pb-4 border-b border-line">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-fg-subtle shrink-0">From:</span>
            <span className="text-fg font-mono text-xs truncate min-w-0" title={email.from_addr}>{email.from_addr}</span>
          </div>
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-fg-subtle shrink-0">To:</span>
            <span className="text-fg font-mono text-xs truncate min-w-0" title={email.to_addr}>{email.to_addr}</span>
          </div>
          <div className="sm:ml-auto text-fg-subtle text-xs">
            {new Date(email.created_at * 1000).toLocaleString()}
          </div>
        </div>
        {/* Render HTML if available, otherwise plain text */}
        {bodyHtml ? (
          <div
            className="text-fg-muted text-sm leading-relaxed max-w-none overflow-x-auto break-words
              [&_pre]:bg-surface-2 [&_pre]:border [&_pre]:border-line [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:text-[13px] [&_pre]:leading-relaxed
              [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.9em] [&_code]:font-mono [&_code]:text-fg
              [&_a]:text-accent [&_a]:underline
              [&_h1]:text-fg [&_h2]:text-fg [&_h3]:text-fg
              [&_strong]:text-fg
              [&_hr]:border-line
              [&_ul]:ml-6 [&_ul]:list-disc [&_li]:mb-1
              [&_p]:mb-3 [&_p]:leading-relaxed
              [&_img]:max-w-full [&_img]:h-auto [&_table]:max-w-full"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : (
          <div className="whitespace-pre-wrap break-words text-fg-muted font-mono text-sm leading-relaxed">
            {bodyText}
          </div>
        )}

        {/* Download .md */}
        <div className="mt-4 pt-4 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => {
              const md = `# ${email.subject || 'Email'}\n\n**From:** ${email.from_addr}\n**To:** ${email.to_addr}\n**Date:** ${new Date(email.created_at * 1000).toISOString()}\n\n---\n\n${bodyText}`;
              try {
                const blob = new Blob([md], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${(email.subject || 'email').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50)}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch {
                prompt('Copy markdown:', md);
              }
            }}
            className="btn btn-secondary btn-sm"
          >
            Save .md
          </button>
          <CopyButton
            label="Markdown"
            text={`# ${email.subject || 'Email'}\n\n**From:** ${email.from_addr}\n**To:** ${email.to_addr}\n**Date:** ${new Date(email.created_at * 1000).toISOString()}\n\n---\n\n${bodyText}`}
          />
          <CopyButton label="Plain Text" text={bodyText} />
          {bodyHtml ? (
            <CopyButton
              label="Rich Text"
              text={bodyText}
              html={bodyHtml}
            />
          ) : <div />}
        </div>
      </div>
    </div>
  );
}

// ─── Buy Credits Modal ──────────────────────────────────
function BuyCreditsModal({
  auth,
  onClose,
  onSuccess,
}: {
  auth: AuthState;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const walletAddr = auth.wallet as `0x${string}`;
  const { data: baseEthBal } = useBalance({ address: walletAddr, chainId: base.id });
  const { data: mainnetEthBal } = useBalance({ address: walletAddr, chainId: mainnet.id });
  const [credits, setCredits] = useState<number>(0);
  const [amount, setAmount] = useState('0.001');
  const [txHash, setTxHash] = useState('');
  const [payChainId, setPayChainId] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'paying' | 'confirming' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [tab, setTab] = useState<'wallet' | 'api'>('wallet');

  // Fetch current credits
  useEffect(() => {
    apiFetch('/api/credits', auth.token)
      .then((r) => r.json())
      .then((data) => setCredits(data.credits || 0));
  }, [auth.token]);

  const creditsForAmount = Math.floor(parseFloat(amount || '0') * 1_000_000);

  async function handleWalletPay() {
    setStatus('paying');
    setError('');
    try {
      const payAmount = parseEther(amount);

      // Smart chain selection: prefer Base, fallback to ETH mainnet
      let targetChainId: number = base.id;
      if (baseEthBal && baseEthBal.value < payAmount && mainnetEthBal && mainnetEthBal.value >= payAmount) {
        targetChainId = mainnet.id;
      }

      // Switch to correct chain
      await switchChainAsync({ chainId: targetChainId });

      const hash = await sendTransactionAsync({
        to: DEPOSIT_ADDRESS as `0x${string}`,
        value: payAmount,
        chainId: targetChainId,
      });
      setTxHash(hash);
      setPayChainId(targetChainId);
      setStatus('confirming');

      // Backend will wait up to 60s for on-chain confirmation
      const res = await apiFetch('/api/credits/buy', auth.token, {
        method: 'POST',
        body: JSON.stringify({ tx_hash: hash, chain_id: targetChainId }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Might need more time, let user retry
        setError(data.error || 'Confirming... try Check Balance in a few seconds');
        setStatus('idle');
        return;
      }
      setCredits(data.balance);
      setStatus('success');
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
    } catch (e: any) {
      setError(e.message || 'Payment failed');
      setStatus('idle');
    }
  }

  async function handleManualCheck() {
    if (!txHash) {
      // Just refresh credits
      const res = await apiFetch('/api/credits', auth.token);
      const data = await res.json();
      const newCredits = data.credits || 0;
      if (newCredits > credits) {
        setCredits(newCredits);
        setStatus('success');
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      } else {
        setCredits(newCredits);
      }
      return;
    }

    setStatus('confirming');
    setError('');
    try {
      const res = await apiFetch('/api/credits/buy', auth.token, {
        method: 'POST',
        body: JSON.stringify({ tx_hash: txHash, chain_id: payChainId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCredits(data.balance);
      setStatus('success');
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
    } catch (e: any) {
      setError(e.message);
      setStatus('idle');
    }
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=1a1a2e&color=ffffff&data=ethereum:${DEPOSIT_ADDRESS}@8453`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="buy-credits-title">
      {/* Confetti */}
      {showConfetti && <ConfettiEffect />}

      <div className="card w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 id="buy-credits-title" className="text-h3 font-semibold">Buy Email Credits</h3>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon -mr-2" aria-label="Close">
            <Icon.Close size={18} />
          </button>
        </div>

        {/* Current balance */}
        <div className="card-inset py-3 mb-4 flex items-center justify-between">
          <span className="text-fg-muted text-sm">Current Balance</span>
          <span className="text-2xl font-semibold font-mono text-accent">{credits}</span>
        </div>

        {status === 'success' ? (
          <div className="text-center py-6">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-success/15 text-success flex items-center justify-center">
              <Icon.Check size={24} />
            </div>
            <h4 className="text-xl font-semibold text-success mb-2">Credits Added!</h4>
            <p className="text-fg-muted mb-4">You now have <span className="text-accent font-semibold">{credits}</span> credits</p>
            <button
              type="button"
              onClick={onSuccess}
              className="btn btn-primary"
            >
              OK, Send Email
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="grid grid-cols-2 gap-1 bg-surface-2 border border-line rounded-lg p-1 mb-4" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'wallet'}
                onClick={() => setTab('wallet')}
                className={`h-8 rounded-md text-sm font-medium transition-colors duration-150 ${tab === 'wallet' ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'}`}
              >
                Pay with Wallet
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'api'}
                onClick={() => setTab('api')}
                className={`h-8 rounded-md text-sm font-medium transition-colors duration-150 ${tab === 'api' ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'}`}
              >
                API / Agent
              </button>
            </div>

            {tab === 'wallet' ? (
              <>
                {/* Pricing info */}
                <div className="text-sm text-fg-muted mb-4 space-y-1">
                  <p>1 credit = 1 external email ($0.002)</p>
                  <p>0.001 ETH = 1,000 credits (min: 0.0001 ETH)</p>
                </div>

                {/* Amount input */}
                <div className="mb-4">
                  <label className="field-label" htmlFor="buy-credits-amount">
                  Amount (ETH) — pays on {baseEthBal && baseEthBal.value >= parseEther(amount || '0') ? 'Base' : mainnetEthBal && mainnetEthBal.value >= parseEther(amount || '0') ? 'ETH Mainnet' : 'Base'}
                </label>
                  <div className="input-group">
                    <input
                      id="buy-credits-amount"
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="font-mono"
                    />
                    <span className="suffix">
                      = {creditsForAmount.toLocaleString()} credits
                    </span>
                  </div>
                </div>

                {/* QR Code */}
                <div className="text-center mb-4">
                  <img
                    src={qrUrl}
                    alt="Payment QR Code"
                    className="mx-auto rounded-lg mb-2 border border-line"
                    width={160}
                    height={160}
                  />
                  <div className="font-mono text-xs text-fg-muted break-all px-4 mb-2">{DEPOSIT_ADDRESS}</div>
                  <CopyButton text={DEPOSIT_ADDRESS} label="Copy address" />
                </div>

                {/* Pay button */}
                {status === 'confirming' ? (
                  <div className="card-inset mb-2">
                    <ChainSearchSpinner maxSeconds={60} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleWalletPay}
                    disabled={status === 'paying' || !amount || parseFloat(amount) < 0.0001}
                    className="btn btn-primary btn-lg w-full mb-2"
                  >
                    {status === 'paying' ? 'Confirm in wallet...' : `Pay ${amount} ETH`}
                  </button>
                )}

                {/* Manual tx hash */}
                <div className="mt-3 pt-3 border-t border-line">
                  <label className="field-label" htmlFor="buy-credits-txhash">Already paid? Paste tx hash:</label>
                  <div className="flex gap-2">
                    <input
                      id="buy-credits-txhash"
                      type="text"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder="0x..."
                      className="input input-mono flex-1 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={handleManualCheck}
                      disabled={status === 'confirming'}
                      className="btn btn-secondary shrink-0"
                    >
                      Check
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* API / Agent tab */
              <div className="text-sm space-y-3">
                <p className="text-fg-muted">
                  For AI Agents: send ETH on Base chain to the deposit address, then submit the tx hash via API.
                </p>
                <div className="card-inset font-mono text-xs text-fg-muted space-y-2">
                  <div className="text-fg-subtle"># 1. Send ETH on Base to:</div>
                  <div className="text-accent break-all">{DEPOSIT_ADDRESS}</div>
                  <div className="text-fg-subtle mt-2"># 2. Submit tx hash:</div>
                  <div className="text-success">
                    {`POST /api/credits/buy`}
                  </div>
                  <div className="text-fg-muted">
                    {`{ "tx_hash": "0x..." }`}
                  </div>
                  <div className="text-fg-subtle mt-2"># Pricing:</div>
                  <div className="text-fg-muted">
                    1 ETH = 1,000,000 credits<br />
                    Min: 0.0001 ETH = 100 credits<br />
                    1 credit = 1 external email
                  </div>
                </div>
                <CopyButton text={DEPOSIT_ADDRESS} label="Copy deposit address" />
              </div>
            )}

            {error && <div className="text-danger text-sm mt-3">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Compose ────────────────────────────────────────────
function Compose({ auth }: { auth: AuthState }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);

  const [to, setTo] = useState(params.get('to') || '');
  const [subject, setSubject] = useState(params.get('subject') || '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showBuyCredits, setShowBuyCredits] = useState(false);

  // Diplomat pricing detection
  const [diplomatPricing, setDiplomatPricing] = useState<{
    qaf_n: number; qaf_base: number; llm_category: string;
    llm_coefficient: number; final_cost: number; formula: string;
    handle: string;
    relationship?: {
      me_to_them: { sent: number; replied: number; unread: number };
      them_to_me: { sent: number; replied: number; unread: number };
    };
  } | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [showQafInfo, setShowQafInfo] = useState(false);
  const [attnChecking, setAttnChecking] = useState(false);
  const [arbitrationResult, setArbitrationResult] = useState<{
    estimated_cost: number;
    actual_cost: number;
    discount: number;
    llm_category: string;
    llm_score: number;
    llm_reasoning: string;
    sender_balance_after: number;
    in_debt: boolean;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const isReply = subject.toLowerCase().startsWith('re:');
  useEffect(() => {
    const handle = to.replace(/@basemail\.ai$/i, '').toLowerCase();
    if (!handle || !to.includes('@basemail.ai') || handle === auth.handle) {
      setDiplomatPricing(null);
      return;
    }
    const timer = setTimeout(async () => {
      setAttnChecking(true);
      try {
        const category = isReply ? 'reply' : 'cold';
        const res = await fetch(`${API_BASE}/api/diplomat/pricing?from=${auth.handle}&to=${handle}&category=${category}`);
        const data = await res.json();
        if (data.pricing) {
          setDiplomatPricing({ ...data.pricing, handle, relationship: data.relationship });
        } else {
          // Fallback to old ATTN price endpoint
          const res2 = await fetch(`${API_BASE}/api/attn-price/${handle}`);
          const data2 = await res2.json();
          if (data2.attn_enabled) {
            setDiplomatPricing({
              qaf_n: 0, qaf_base: data2.cold_email_stake,
              llm_category: isReply ? 'reply' : 'cold',
              llm_coefficient: isReply ? 0 : 1,
              final_cost: isReply ? 0 : data2.cold_email_stake,
              formula: `${data2.cold_email_stake} ATTN`,
              handle,
            });
          } else {
            setDiplomatPricing(null);
          }
        }
      } catch { setDiplomatPricing(null); }
      setAttnChecking(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [to, isReply, auth.handle]);

  async function handleSend() {
    if (!to || !subject || !body) {
      setError('All fields are required');
      return;
    }

    setSending(true);
    setError('');
    try {
      // Use Diplomat send for internal BaseMail, regular send for external
      const isInternal = to.toLowerCase().endsWith('@basemail.ai');
      const toHandle = to.replace(/@basemail\.ai$/i, '').toLowerCase();
      const isSelfSend = toHandle === auth.handle?.toLowerCase();
      const endpoint = (isInternal && !isSelfSend) ? '/api/diplomat/send' : '/api/send';
      const payload: any = { to, subject, body };
      const res = await apiFetch(endpoint, auth.token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // Check if it's an ATTN balance error (debt model)
        if (res.status === 402) {
          if (data.hint && data.balance < 0) {
            setError(`⚠️ Insufficient ATTN (${data.balance} ATTN). Your account is in debt — receive emails to recover.`);
          } else {
            setError(`⚠️ Insufficient ATTN: need ${data.required} ATTN, only have ${data.balance} ATTN`);
          }
          return;
        }
        throw new Error(data.error || 'Failed to send');
      }
      // Show arbitration result for Diplomat sends
      if (data.diplomat && isInternal && !isSelfSend) {
        const d = data.diplomat;
        setArbitrationResult(d);
        if (d.discount > 0) {
          // Discount! Show confetti 🎉
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 4000);
        }
        // Auto-navigate after showing result
        setTimeout(() => navigate('/dashboard/sent'), d.discount > 0 ? 4000 : 2500);
      } else {
        navigate('/dashboard/sent');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-h3 font-semibold mb-6">Compose</h1>
      <div className="max-w-3xl space-y-4">
        <div>
          <span className="field-label">From</span>
          <div className="input input-mono flex items-center text-accent truncate cursor-default" title={`${auth.handle}@basemail.ai`}>
            {truncateEmail(auth.handle!)}
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="compose-to">To</label>
          <input
            id="compose-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="input"
          />
        </div>
        {/* Diplomat pricing info */}
        {diplomatPricing && (
          <div className="card-inset border-l-2 border-l-attn">
            <div className="flex items-center gap-2 mb-2">
              <Icon.Attn size={16} className="text-attn" />
              <span className="text-sm font-semibold">The Diplomat — AI Pricing</span>
            </div>
            {diplomatPricing.llm_category === 'reply' ? (
              <div className="text-center py-1">
                <div className="text-2xl font-semibold text-success">FREE</div>
                <div className="text-fg-muted text-xs mt-1">Replies keep the conversation alive!</div>
              </div>
            ) : (<>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <div className="text-2xl font-semibold font-mono text-attn">{diplomatPricing.final_cost}</div>
                <div className="text-fg-subtle text-xs">ATTN cost</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-fg capitalize">{diplomatPricing.llm_category}</div>
                <div className="text-fg-subtle text-xs">AI classification</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold font-mono text-fg">n={diplomatPricing.qaf_n}</div>
                <div className="text-fg-subtle text-xs">unread streak</div>
              </div>
            </div>
            <p className="text-fg-subtle text-xs flex flex-wrap items-center gap-1">
              {diplomatPricing.formula}
              {' '}
              <button
                type="button"
                onClick={() => setShowQafInfo(true)}
                className="inline-flex items-center text-attn hover:text-fg transition-colors duration-150"
                title="What is QAF?"
                aria-label="What is QAF?"
              >
                <Icon.Info size={14} />
              </button>
            </p>
            </>)}
          </div>
        )}
        {attnChecking && <div className="text-fg-subtle text-xs">Checking ATTN requirements...</div>}

        {/* QAF Info Popup */}
        {showQafInfo && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowQafInfo(false)} role="dialog" aria-modal="true" aria-labelledby="qaf-info-title">
            <div className="card w-full sm:max-w-sm shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 id="qaf-info-title" className="text-h3 font-semibold">What is QAF?</h3>
                <button type="button" onClick={() => setShowQafInfo(false)} className="btn btn-ghost btn-icon -mr-2" aria-label="Close">
                  <Icon.Close size={18} />
                </button>
              </div>
              <div className="space-y-3 text-sm text-fg-muted">
                <p>
                  <strong className="text-fg">QAF (Quadratic Attention Finance)</strong> makes your inbox smarter. The more someone emails you without you reading, the more expensive each follow-up becomes.
                </p>
                <p>
                  Cost grows <strong className="text-fg">quadratically</strong> (n²) — first email is cheap, but spamming gets expensive fast.
                </p>
                <p>
                  When you <strong className="text-fg">read</strong> an email, the streak resets to 0. The sender gets their ATTN back.
                </p>
                <p>
                  <strong className="text-fg">Replies are always free</strong> — good conversations are rewarded, not taxed.
                </p>
                <p className="text-fg-subtle text-xs">
                  Based on Quadratic Voting by Glen Weyl, adapted for email attention economics.
                </p>
              </div>
              <a
                href="https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary w-full mt-4"
              >
                Read the full story <Icon.ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="compose-subject">Subject</label>
          <input
            id="compose-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="input"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="compose-body">Body</label>
          <textarea
            id="compose-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={10}
            className="textarea"
          />
        </div>

        {error && <div className="text-danger text-sm">{error}</div>}

        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !!arbitrationResult}
          className="btn btn-primary btn-lg px-8"
        >
          {sending ? 'Arbitrating...' : 'Send'}
        </button>

        {/* Arbitration Result */}
        {arbitrationResult && (
          <div className={`card-inset border-l-2 mt-4 ${
            arbitrationResult.discount > 0
              ? 'border-l-success'
              : arbitrationResult.discount < 0
              ? 'border-l-danger'
              : 'border-l-attn'
          }`}>
            <div className="text-center">
              {arbitrationResult.discount > 0 ? (
                <>
                  <div className="text-success font-semibold text-lg">Good Email Reward!</div>
                  <div className="text-fg text-2xl font-semibold font-mono mt-1">
                    <span className="line-through text-fg-subtle">{arbitrationResult.estimated_cost}</span>
                    {' → '}
                    <span className="text-success">{arbitrationResult.actual_cost} ATTN</span>
                  </div>
                  <div className="text-success text-sm mt-1">Saved {arbitrationResult.discount} ATTN!</div>
                </>
              ) : arbitrationResult.discount < 0 ? (
                <>
                  <div className="text-danger font-semibold text-lg">Low Quality Detected</div>
                  <div className="text-fg text-2xl font-semibold font-mono mt-1">
                    <span className="text-fg-subtle">{arbitrationResult.estimated_cost}</span>
                    {' → '}
                    <span className="text-danger">{arbitrationResult.actual_cost} ATTN</span>
                  </div>
                  <div className="text-danger text-sm mt-1">Extra {Math.abs(arbitrationResult.discount)} ATTN charged</div>
                </>
              ) : arbitrationResult.llm_category === 'reply' ? (
                <>
                  <div className="text-success font-semibold text-lg">Reply — FREE!</div>
                  <div className="text-success text-sm mt-1">Replies keep the conversation alive</div>
                </>
              ) : (
                <>
                  <div className="text-attn font-semibold">Email Sent</div>
                  <div className="text-fg text-lg font-semibold font-mono mt-1">{arbitrationResult.actual_cost} ATTN</div>
                </>
              )}
              <div className="text-fg-muted text-xs mt-2">
                Gemini verdict: {arbitrationResult.llm_category} ({arbitrationResult.llm_score}/10)
              </div>
              <div className="text-fg-subtle text-xs mt-1 italic">
                「{arbitrationResult.llm_reasoning}」
              </div>
              {arbitrationResult.in_debt && (
                <div className="text-danger text-xs mt-2 font-semibold">
                  Balance: {arbitrationResult.sender_balance_after} ATTN (in debt)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confetti effect */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
            <style>{`
              @keyframes compose-confetti-fall {
                0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
                100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
              }
            `}</style>
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-5%`,
                  animation: `compose-confetti-fall ${2 + Math.random() * 3}s ease-out ${Math.random() * 1.5}s forwards`,
                  fontSize: `${14 + Math.random() * 18}px`,
                }}
              >
                {['🎉', '✨', '🦞', '💰', '⭐', '🎊'][Math.floor(Math.random() * 6)]}
              </div>
            ))}
          </div>
        )}
      </div>

      {showBuyCredits && (
        <BuyCreditsModal
          auth={auth}
          onClose={() => setShowBuyCredits(false)}
          onSuccess={() => {
            setShowBuyCredits(false);
            // Auto-retry send
            handleSend();
          }}
        />
      )}
    </div>
  );
}

// ─── Credits ────────────────────────────────────────────
function Credits({ auth }: { auth: AuthState }) {
  const [credits, setCredits] = useState<number | null>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [recoverHash, setRecoverHash] = useState('');
  const [recoverStatus, setRecoverStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [recoverMsg, setRecoverMsg] = useState('');

  function loadData() {
    Promise.all([
      apiFetch('/api/credits', auth.token).then((r) => r.json()),
      apiFetch('/api/credits/history', auth.token).then((r) => r.json()),
    ])
      .then(([creditData, historyData]) => {
        setCredits(creditData.credits ?? 0);
        setPricing(creditData.pricing);
        setHistory(historyData.transactions || []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [auth.token]);

  if (loading) {
    return (
      <div>
        <h1 className="text-h3 font-semibold mb-6">Credits</h1>
        <div className="max-w-3xl space-y-6" aria-busy="true" aria-label="Loading credits">
          <div className="card space-y-3">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-8 w-24" />
            <div className="skeleton h-4 w-48" />
          </div>
          <div className="card space-y-3">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-h3 font-semibold mb-6">Credits</h1>
      <div className="max-w-3xl space-y-6">
        {credits === 0 && (
          <div className="card border-l-2 border-l-accent">
            <div className="text-base font-semibold mb-2">You started with 10 free emails!</div>
            <p className="text-fg-muted text-sm mb-3">
              Every BaseMail account gets 10 free external emails to try things out. To keep sending, add credits — it's just <strong className="text-fg">$0.002 per email</strong> (1,000 emails for ~$2.70 in ETH).
            </p>
            <button
              type="button"
              onClick={() => setShowBuyCredits(true)}
              className="btn btn-primary"
            >
              Add Credits <Icon.ArrowRight size={16} />
            </button>
          </div>
        )}

        <div className="card">
          <div className="text-fg-muted text-sm mb-1">Balance</div>
          <div className="text-2xl font-semibold font-mono text-accent">{credits}</div>
          <div className="text-fg-subtle text-sm mt-1">
            1 credit = 1 external email{credits !== null && credits > 0 && credits <= 3 ? ' — running low!' : ''}
          </div>
          <button
            type="button"
            onClick={() => setShowBuyCredits(true)}
            className="btn btn-primary mt-4"
          >
            Buy Credits
          </button>
        </div>

        {pricing && (
          <div className="card">
            <h2 className="text-base font-semibold mb-4">Pricing</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-fg-muted">Rate</span>
                <span className="font-mono text-right">{pricing.example}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-fg-muted">Min purchase</span>
                <span className="font-mono text-right">{pricing.min_purchase}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-fg-muted">Cost per email</span>
                <span className="font-mono text-right">{pricing.cost_per_email_usd}</span>
              </div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="card">
            <h2 className="text-base font-semibold mb-4">Transaction History</h2>
            <div className="text-sm divide-y divide-line">
              {history.map((tx: any) => (
                <div key={tx.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <div className="min-w-0">
                    <span className={`font-mono ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </span>
                    <span className="text-fg-subtle ml-2">{tx.type}</span>
                  </div>
                  <span className="text-fg-subtle text-xs">
                    {new Date(tx.created_at * 1000).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recover lost credits */}
        <div className="card">
          <h2 className="text-base font-semibold mb-1">Lost your credits?</h2>
          <p className="text-fg-subtle text-xs mb-4">
            Paid but credits didn't show up? Paste your transaction hash below. We'll check both Base and ETH Mainnet automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={recoverHash}
              onChange={(e) => { setRecoverHash(e.target.value.trim()); setRecoverStatus('idle'); setRecoverMsg(''); }}
              placeholder="0x..."
              className="input input-mono flex-1 min-w-0"
              aria-label="Transaction hash"
            />
            <button
              type="button"
              onClick={async () => {
                if (!recoverHash || !recoverHash.startsWith('0x')) {
                  setRecoverMsg('Please enter a valid transaction hash');
                  setRecoverStatus('error');
                  return;
                }
                setRecoverStatus('checking');
                setRecoverMsg('Checking Base and ETH Mainnet...');
                try {
                  const res = await apiFetch('/api/credits/buy', auth.token, {
                    method: 'POST',
                    body: JSON.stringify({ tx_hash: recoverHash }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);
                  setRecoverStatus('success');
                  setRecoverMsg(`Recovered ${data.purchased} credits from ${data.chain || 'on-chain'} payment (${data.eth_spent} ETH)`);
                  setCredits(data.balance);
                  loadData();
                } catch (e: any) {
                  setRecoverStatus('error');
                  setRecoverMsg(e.message || 'Recovery failed');
                }
              }}
              disabled={recoverStatus === 'checking'}
              className="btn btn-secondary shrink-0"
            >
              {recoverStatus === 'checking' ? 'Checking...' : 'Recover'}
            </button>
          </div>
          {recoverStatus === 'checking' && <ChainSearchSpinner maxSeconds={30} />}
          {recoverMsg && recoverStatus !== 'checking' && (
            <p className={`text-xs mt-2 ${recoverStatus === 'success' ? 'text-success' : recoverStatus === 'error' ? 'text-danger' : 'text-warning'}`}>
              {recoverMsg}
            </p>
          )}
        </div>
      </div>

      {showBuyCredits && (
        <BuyCreditsModal
          auth={auth}
          onClose={() => { setShowBuyCredits(false); loadData(); }}
          onSuccess={() => { setShowBuyCredits(false); loadData(); }}
        />
      )}
    </div>
  );
}

// ─── Settings ───────────────────────────────────────────
function Settings({ auth, setAuth, onUpgrade, upgrading }: { auth: AuthState; setAuth: (a: AuthState) => void; onUpgrade?: (basename?: string, autoBuy?: boolean) => void; upgrading?: boolean }) {
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const [webhook, setWebhook] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsBasenameInput, setSettingsBasenameInput] = useState('');
  const [settingsUpgradeError, setSettingsUpgradeError] = useState('');
  const [proStatus, setProStatus] = useState<'idle' | 'paying' | 'confirming' | 'success' | 'error'>('idle');
  const [proError, setProError] = useState('');
  const [showProConfetti, setShowProConfetti] = useState(false);

  // v2: Notification email, aliases, expiry
  const [notifEmail, setNotifEmail] = useState('');
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [aliases, setAliases] = useState<{ id: string; handle: string; basename: string; is_primary: number; expiry: number | null }[]>([]);
  const [newAliasInput, setNewAliasInput] = useState('');
  const [aliasAdding, setAliasAdding] = useState(false);
  const [aliasError, setAliasError] = useState('');
  const [aliasMsg, setAliasMsg] = useState('');

  // Load settings on mount
  useEffect(() => {
    apiFetch('/api/settings', auth.token).then(r => r.json()).then((data: any) => {
      if (data.notification_email) setNotifEmail(data.notification_email);
      if (data.aliases) setAliases(data.aliases);
    }).catch(() => {});
  }, [auth.token]);

  function getExpiryColor(expiry: number | null): string {
    if (!expiry) return 'text-fg-muted';
    const daysLeft = (expiry - Date.now() / 1000) / 86400;
    if (daysLeft < 0) return 'text-danger';
    if (daysLeft < 7) return 'text-danger';
    if (daysLeft < 30) return 'text-warning';
    if (daysLeft < 90) return 'text-warning';
    return 'text-success';
  }

  function getExpiryText(expiry: number | null): string {
    if (!expiry) return 'Unknown';
    const daysLeft = Math.floor((expiry - Date.now() / 1000) / 86400);
    if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)}d ago`;
    return `${daysLeft}d remaining`;
  }

  const fullEmail = `${auth.handle}@basemail.ai`;
  const hasBasename = !!auth.basename && !/^0x/i.test(auth.handle!);
  const altEmail = hasBasename ? `${auth.wallet.toLowerCase()}@basemail.ai` : null;
  const canUpgradeKnown = auth.upgrade_available && auth.suggested_handle && /^0x/i.test(auth.handle!);
  const canUpgradeNFT = auth.has_basename_nft && /^0x/i.test(auth.handle!) && !auth.suggested_handle;

  return (
    <div>
      <h1 className="text-h3 font-semibold mb-6">Settings</h1>
      <div className="max-w-3xl space-y-6">
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Account</h2>
          <div className="space-y-3 text-sm">
            {/* Already upgraded — show Basename info first */}
            {hasBasename && auth.basename && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-fg-muted">Basename</span>
                  <span className="font-mono text-accent text-xs font-semibold break-all">{auth.basename}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-fg-muted">Basename Email</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-accent text-xs break-all">{fullEmail}</span>
                    <CopyButton text={fullEmail} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-fg-muted">0x Email</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-fg-muted text-xs break-all">{altEmail}</span>
                    <CopyButton text={altEmail!} />
                  </div>
                </div>
              </>
            )}
            {/* No basename upgrade yet — show current 0x email */}
            {!hasBasename && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-fg-muted">Email</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-accent text-xs break-all">{fullEmail}</span>
                  <CopyButton text={fullEmail} />
                </div>
              </div>
            )}
            {/* Basename detected (name known) — upgrade prompt */}
            {canUpgradeKnown && auth.basename && (
              <div className="card-inset border-l-2 border-l-accent mt-2">
                <div className="text-accent text-xs font-semibold mb-2">Basename Detected: {auth.basename}</div>
                <p className="text-fg-muted text-xs mb-3">
                  Upgrade your email to <span className="text-accent font-semibold">{auth.suggested_handle}@basemail.ai</span>
                </p>
                {onUpgrade && (
                  <button
                    type="button"
                    onClick={() => onUpgrade()}
                    disabled={upgrading}
                    className="btn btn-primary btn-sm"
                  >
                    {upgrading ? 'Upgrading...' : 'Claim Basename Email'}
                  </button>
                )}
              </div>
            )}
            {/* Basename NFT detected but name unknown — manual input */}
            {canUpgradeNFT && (
              <div className="card-inset border-l-2 border-l-accent mt-2">
                <div className="text-accent text-xs font-semibold mb-2">Basename NFT Detected!</div>
                <p className="text-fg-muted text-xs mb-3">
                  Enter your Basename to upgrade your email address.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <div className="input-group flex-1 min-w-0">
                    <input
                      type="text"
                      value={settingsBasenameInput}
                      onChange={(e) => { setSettingsBasenameInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSettingsUpgradeError(''); }}
                      placeholder="yourname"
                      className="font-mono"
                      aria-label="Basename"
                    />
                    <span className="suffix">.base.eth</span>
                  </div>
                  {onUpgrade && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!settingsBasenameInput.trim()) { setSettingsUpgradeError('Please enter your Basename'); return; }
                        onUpgrade(`${settingsBasenameInput.trim()}.base.eth`);
                      }}
                      disabled={upgrading || !settingsBasenameInput.trim()}
                      className="btn btn-primary shrink-0"
                    >
                      {upgrading ? 'Verifying...' : 'Claim'}
                    </button>
                  )}
                </div>
                {settingsUpgradeError && <p className="text-danger text-xs">{settingsUpgradeError}</p>}
              </div>
            )}
            {/* No basename at all — offer free registration */}
            {!auth.basename && !auth.has_basename_nft && (
              <div className="card-inset border-l-2 border-l-success mt-2">
                <div className="text-success text-xs font-semibold mb-2">Limited-Time: Free 1-Year Basename</div>
                <p className="text-fg-muted text-xs mb-3">
                  Choose a name and we'll register <span className="text-accent font-medium">yourname.base.eth</span> for you — <span className="text-warning">1 year free</span>, no wallet signing needed. Renew on your own after expiry.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <div className="input-group flex-1 min-w-0">
                    <input
                      type="text"
                      value={settingsBasenameInput}
                      onChange={(e) => { setSettingsBasenameInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSettingsUpgradeError(''); }}
                      placeholder="yourname"
                      className="font-mono"
                      aria-label="Basename"
                    />
                    <span className="suffix">.base.eth</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!settingsBasenameInput.trim()) { setSettingsUpgradeError('Please enter a name'); return; }
                      if (onUpgrade) onUpgrade(settingsBasenameInput.trim(), true);
                    }}
                    disabled={upgrading || !settingsBasenameInput.trim()}
                    className="btn btn-primary shrink-0"
                  >
                    {upgrading ? 'Registering...' : 'Get Free Name'}
                  </button>
                </div>
                {settingsUpgradeError && <p className="text-danger text-xs">{settingsUpgradeError}</p>}
                <p className="text-fg-subtle text-xs mt-1 break-all">
                  Your email will upgrade from <span className="font-mono">{auth.wallet.slice(0, 8)}...@basemail.ai</span> to <span className="text-accent font-mono">{settingsBasenameInput || 'yourname'}@basemail.ai</span>
                </p>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
              <span className="text-fg-muted shrink-0">Wallet</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-fg-muted text-xs truncate">{auth.wallet.slice(0, 6)}...{auth.wallet.slice(-4)}</span>
                <CopyButton text={auth.wallet} />
              </div>
            </div>
          </div>
        </div>

        {/* BaseMail Pro */}
        <div className={`card ${auth.tier === 'pro' ? 'border-l-2 border-l-warning' : ''}`}>
          {showProConfetti && <ConfettiEffect />}
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            {auth.tier === 'pro' ? (
              <><ProBadge size={16} /> BaseMail Pro</>
            ) : (
              'BaseMail Pro'
            )}
          </h2>
          {auth.tier === 'pro' ? (
            <div className="space-y-2 text-sm">
              <p className="text-success">You are a Pro member!</p>
              <ul className="text-fg-muted space-y-1">
                <li className="flex items-center gap-2"><Icon.Check size={14} className="text-success" /> No email signature on outgoing emails</li>
                <li className="flex items-center gap-2"><Icon.Check size={14} className="text-success" /> Gold badge</li>
                <li className="flex items-center gap-2"><Icon.Check size={14} className="text-success" /> Priority support</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-fg-muted text-sm">
                Remove the BaseMail signature from your emails and get a gold badge. One-time lifetime purchase.
              </p>
              <div className="card-inset">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-fg-muted text-sm">Price</span>
                  <span className="text-xl font-semibold font-mono text-accent">0.008 ETH</span>
                </div>
                <ul className="text-fg-subtle text-xs space-y-1 mb-4">
                  <li className="flex items-center gap-2"><Icon.Check size={14} className="text-success" /> Remove email signature forever</li>
                  <li className="flex items-center gap-2"><Icon.Check size={14} className="text-success" /> Gold badge on your profile</li>
                  <li className="flex items-center gap-2"><Icon.Check size={14} className="text-success" /> Priority support</li>
                </ul>
                <button
                  type="button"
                  onClick={async () => {
                    setProStatus('paying');
                    setProError('');
                    try {
                      await switchChainAsync({ chainId: base.id });
                      const hash = await sendTransactionAsync({
                        to: DEPOSIT_ADDRESS as `0x${string}`,
                        value: parseEther('0.008'),
                        chainId: base.id,
                      });
                      setProStatus('confirming');
                      const res = await apiFetch('/api/pro/buy', auth.token, {
                        method: 'POST',
                        body: JSON.stringify({ tx_hash: hash, chain_id: base.id }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      setProStatus('success');
                      setShowProConfetti(true);
                      setTimeout(() => setShowProConfetti(false), 4000);
                      setAuth({ ...auth, tier: 'pro' });
                    } catch (e: any) {
                      setProError(e.message || 'Purchase failed');
                      setProStatus('idle');
                    }
                  }}
                  disabled={proStatus === 'paying' || proStatus === 'confirming'}
                  className="btn btn-primary w-full"
                >
                  {proStatus === 'paying' ? 'Confirm in wallet...' : proStatus === 'confirming' ? 'Verifying on-chain...' : 'Upgrade to Pro'}
                </button>
              </div>
              {proError && <p className="text-danger text-sm">{proError}</p>}
            </div>
          )}
        </div>

        {/* World ID Human Verification */}
        <WorldIdVerify token={auth.token!} handle={auth.handle!} wallet={auth.wallet} />

        <div className="card">
          <h2 className="text-base font-semibold mb-1">Webhook Notification</h2>
          <p className="text-fg-muted text-sm mb-4">
            Get notified when new emails arrive. Set a webhook URL that BaseMail will POST to.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={webhook}
              onChange={(e) => { setWebhook(e.target.value); setSaved(false); }}
              placeholder="https://your-agent.example.com/webhook"
              className="input input-mono flex-1 min-w-0"
              aria-label="Webhook URL"
            />
            <button
              type="button"
              onClick={async () => {
                setSaving(true);
                try {
                  await apiFetch('/api/register', auth.token, {
                    method: 'PUT',
                    body: JSON.stringify({ webhook_url: webhook }),
                  });
                  setSaved(true);
                } catch {}
                setSaving(false);
              }}
              disabled={saving}
              className="btn btn-primary shrink-0"
            >
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>

        {/* Notification Email */}
        <div className="card">
          <h2 className="text-base font-semibold mb-1">Notification Email</h2>
          <p className="text-fg-muted text-sm mb-4">
            Where to send expiry reminders and important notifications. Defaults to your BaseMail address.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={notifEmail}
              onChange={(e) => { setNotifEmail(e.target.value); setNotifSaved(false); }}
              placeholder={`${auth.handle}@basemail.ai`}
              className="input input-mono flex-1 min-w-0"
              aria-label="Notification email"
            />
            <button
              type="button"
              onClick={async () => {
                setNotifSaving(true);
                try {
                  await apiFetch('/api/settings', auth.token, {
                    method: 'PUT',
                    body: JSON.stringify({ notification_email: notifEmail }),
                  });
                  setNotifSaved(true);
                } catch {}
                setNotifSaving(false);
              }}
              disabled={notifSaving}
              className="btn btn-primary shrink-0"
            >
              {notifSaving ? 'Saving...' : notifSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>

        {/* Your Basenames */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Your Basenames</h2>
          {aliases.length > 0 ? (
            <div className="space-y-3 mb-4">
              {aliases.map((a) => (
                <div key={a.handle} className="card-inset flex items-start gap-3">
                    <input
                      type="radio"
                      name="primary-alias"
                      checked={a.is_primary === 1}
                      onChange={async () => {
                        try {
                          const res = await apiFetch('/api/settings/primary', auth.token, {
                            method: 'PUT',
                            body: JSON.stringify({ handle: a.handle }),
                          });
                          const data = await res.json() as any;
                          if (res.ok && data.token) {
                            setAuth({ ...auth, token: data.token, handle: data.handle, basename: data.basename });
                            const sr = await apiFetch('/api/settings', data.token);
                            const sd = await sr.json() as any;
                            if (sd.aliases) setAliases(sd.aliases);
                          }
                        } catch {}
                      }}
                      className="accent-accent mt-1 shrink-0"
                      aria-label={`Set ${a.handle}@basemail.ai as primary`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm text-accent break-all">{a.handle}@basemail.ai</span>
                        {a.is_primary === 1 && <span className="badge badge-accent">Primary</span>}
                      </div>
                      <div className={`text-xs mt-0.5 ${getExpiryColor(a.expiry)}`}>
                        {a.expiry ? (
                          <>
                            {getExpiryText(a.expiry)}
                            {' · '}
                            <a href={`https://www.base.org/names/${a.handle}`} target="_blank" rel="noopener noreferrer" className="link">Renew</a>
                          </>
                        ) : (
                          <span className="text-fg-subtle">Expiry unknown</span>
                        )}
                      </div>
                      {a.is_primary !== 1 && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/settings/alias/${a.handle}`, auth.token, { method: 'DELETE' });
                            setAliases(aliases.filter(x => x.handle !== a.handle));
                          }}
                          className="text-fg-subtle hover:text-danger text-xs mt-1 transition-colors duration-150"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-fg-subtle text-sm mb-4">No basename aliases configured yet.</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="input-group flex-1 min-w-0">
              <input
                type="text"
                value={newAliasInput}
                onChange={(e) => { setNewAliasInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setAliasError(''); setAliasMsg(''); }}
                placeholder="yourname"
                className="font-mono"
                aria-label="New alias basename"
              />
              <span className="suffix">.base.eth</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!newAliasInput.trim()) return;
                setAliasAdding(true);
                setAliasError('');
                setAliasMsg('');
                try {
                  const res = await apiFetch('/api/settings/alias', auth.token, {
                    method: 'POST',
                    body: JSON.stringify({ basename: `${newAliasInput.trim()}.base.eth` }),
                  });
                  const data = await res.json() as any;
                  if (!res.ok) throw new Error(data.error);
                  setAliasMsg(`Added ${data.handle}@basemail.ai`);
                  setNewAliasInput('');
                  // Reload
                  const sr = await apiFetch('/api/settings', auth.token);
                  const sd = await sr.json() as any;
                  if (sd.aliases) setAliases(sd.aliases);
                } catch (e: any) {
                  setAliasError(e.message || 'Failed to add alias');
                }
                setAliasAdding(false);
              }}
              disabled={aliasAdding || !newAliasInput.trim()}
              className="btn btn-primary shrink-0"
            >
              {aliasAdding ? 'Verifying...' : 'Add'}
            </button>
          </div>
          {aliasError && <p className="text-danger text-xs mt-2">{aliasError}</p>}
          {aliasMsg && <p className="text-success text-xs mt-2">{aliasMsg}</p>}
        </div>

        <div className="card">
          <h2 className="text-base font-semibold mb-1">API Token</h2>
          <p className="text-fg-muted text-sm mb-4">
            Use this token in your AI Agent's API calls. It expires in 24 hours — reconnect your wallet to get a fresh one.
          </p>
          <div className="card-inset font-mono text-sm text-fg-muted break-all select-all cursor-pointer hover:border-line-strong transition-colors duration-150"
               onClick={() => navigator.clipboard.writeText(auth.token)}
               title="Click to copy"
               role="button"
               tabIndex={0}>
            {auth.token}
          </div>
          <p className="text-fg-subtle text-xs mt-2">Click to copy</p>
        </div>

        {/* Disconnect */}
        <div className="pt-4 border-t border-line">
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem('basemail_auth');
              localStorage.removeItem('basemail_auth');
              setAuth(null as any);
              window.location.href = '/';
            }}
            className="btn btn-danger w-full"
          >
            Disconnect Wallet
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Attention Bonds ─────────────────────────────────────
function Attention({ auth }: { auth: AuthState }) {
  const location = useLocation();
  const depositParams = new URLSearchParams(location.search);
  const depositHandle = depositParams.get('deposit');
  const depositAmount = depositParams.get('amount');

  const [tab, setTab] = useState<'config' | 'stats' | 'whitelist' | 'deposit' | 'my-bonds'>(depositHandle ? 'deposit' : 'stats');
  const [myBonds, setMyBonds] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Deposit flow state
  const [depRecipient, setDepRecipient] = useState(depositHandle || '');
  const [depAmount, setDepAmount] = useState(depositAmount || '0.01');
  const [depEmailId, setDepEmailId] = useState('');
  const [depStep, setDepStep] = useState<'input' | 'approving' | 'depositing' | 'recording' | 'done' | 'error'>('input');
  const [depError, setDepError] = useState('');
  const [depTxHash, setDepTxHash] = useState('');
  const { writeContractAsync } = useWriteContract();
  const walletAddr = auth.wallet as `0x${string}`;

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [basePrice, setBasePrice] = useState('0.01');
  const [alpha, setAlpha] = useState('0.1');
  const [beta, setBeta] = useState('1.0');
  const [gamma, setGamma] = useState('0.5');
  const [responseHours, setResponseHours] = useState('168');

  // Whitelist form
  const [wlHandle, setWlHandle] = useState('');
  const [wlNote, setWlNote] = useState('');

  // On-chain interactions
  const { switchChain } = useSwitchChain();
  const { chain } = useAccount();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, statsRes, wlRes, bondsRes] = await Promise.all([
        apiFetch('/api/attention/config', auth.token),
        apiFetch('/api/attention/stats', auth.token),
        apiFetch('/api/attention/whitelist', auth.token),
        apiFetch('/api/attention/my-bonds', auth.token),
      ]);
      const cfgData = await cfgRes.json();
      const statsData = await statsRes.json();
      const wlData = await wlRes.json();
      const bondsData = await bondsRes.json();

      setConfig(cfgData.config);
      setStats(statsData);
      setWhitelist(wlData.whitelist || []);
      setMyBonds(bondsData.bonds || []);

      if (cfgData.config && cfgData.config.enabled !== undefined) {
        setEnabled(!!cfgData.config.enabled);
        setBasePrice(String(cfgData.config.base_price ?? '0.01'));
        setAlpha(String(cfgData.config.alpha ?? '0.1'));
        setBeta(String(cfgData.config.beta ?? '1.0'));
        setGamma(String(cfgData.config.gamma ?? '0.5'));
        setResponseHours(String(Math.round((cfgData.config.response_window ?? 604800) / 3600)));
      }
    } catch {}
    setLoading(false);
  }, [auth.token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Intro popup for first-time visitors
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    if (!loading && config && !config.enabled && !localStorage.getItem('attention_intro_seen')) {
      setShowIntro(true);
    }
  }, [loading, config]);

  async function saveConfig() {
    setSaving(true);
    setMsg('');
    try {
      const res = await apiFetch('/api/attention/config', auth.token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          base_price: parseFloat(basePrice),
          alpha: parseFloat(alpha),
          beta: parseFloat(beta),
          gamma: parseFloat(gamma),
          response_window_hours: parseInt(responseHours),
        }),
      });
      if (res.ok) {
        setMsg('✅ Config saved!');
        loadAll();
      } else {
        const err = await res.json();
        setMsg(`❌ ${err.error}`);
      }
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    }
    setSaving(false);
  }

  async function setOnChainPrice() {
    if (chain?.id !== base.id) {
      switchChain({ chainId: base.id });
      return;
    }
    const priceInUsdc6 = BigInt(Math.round(parseFloat(basePrice) * 1e6));
    writeContractAsync({
      address: ESCROW_CONTRACT,
      abi: ESCROW_ABI,
      functionName: 'setAttentionPrice',
      args: [priceInUsdc6],
    });
  }

  async function addWhitelist() {
    if (!wlHandle.trim()) return;
    await apiFetch('/api/attention/whitelist', auth.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_handle: wlHandle.toLowerCase(), note: wlNote || undefined }),
    });
    setWlHandle('');
    setWlNote('');
    loadAll();
  }

  async function removeWhitelist(sender: string) {
    await apiFetch(`/api/attention/whitelist/${sender}`, auth.token, { method: 'DELETE' });
    loadAll();
  }

  if (loading) {
    return (
      <div className="max-w-3xl" aria-busy="true" aria-label="Loading Attention Bonds">
        <div className="skeleton h-7 w-56 mb-6" />
        <div className="space-y-6">
          <div className="card space-y-3">
            <div className="skeleton h-4 w-32" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-12" />)}
            </div>
          </div>
          <div className="card space-y-3">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  const TAB_LABELS: Record<typeof tab, string> = {
    stats: 'Dashboard',
    deposit: 'Deposit',
    'my-bonds': 'My Bonds',
    config: 'Settings',
    whitelist: 'Whitelist',
  };

  return (
    <div className="max-w-3xl">
      {/* Intro popup for new users */}
      {showIntro && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowIntro(false); localStorage.setItem('attention_intro_seen', '1'); }} role="dialog" aria-modal="true" aria-labelledby="attn-intro-title">
          <div className="card w-full sm:max-w-lg shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
            <Icon.Shield size={32} className="text-accent mb-4" />
            <h3 id="attn-intro-title" className="text-h3 font-semibold mb-3">Protect your inbox with Attention Bonds</h3>
            <p className="text-fg-muted text-sm leading-relaxed mb-4">
              Attention Bonds require senders to stake USDC before emailing you. If you reply, they get a <strong className="text-fg">full refund</strong>. If you don't, the bond is forfeited. This creates an economic signal that filters noise and rewards genuine communication.
            </p>
            <p className="text-fg-subtle text-xs mb-6">
              Powered by CO-QAF (Quadratic Attention Funding) — the same mechanism endorsed by Glen Weyl, co-inventor of Quadratic Funding.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => { setShowIntro(false); localStorage.setItem('attention_intro_seen', '1'); setTab('config'); }} className="btn btn-primary flex-1">Enable & Set Price</button>
              <a href="/blog/attention-bonds-quadratic-funding-spam/" target="_blank" className="btn btn-secondary flex-1">Learn More</a>
              <button type="button" onClick={() => { setShowIntro(false); localStorage.setItem('attention_intro_seen', '1'); }} className="btn btn-ghost">Skip</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h1 className="text-h3 font-semibold">Attention Bonds</h1>
        <span className="badge badge-neutral">Legacy (USDC)</span>
      </div>
      <div className="card-inset border-l-2 border-l-attn mb-4">
        <p className="text-fg-muted text-sm"><strong className="text-fg">$ATTN tokens</strong> are the new default! ATTN is auto-staked when sending email — no deposit needed. <a href="/dashboard/attn" className="link">Go to $ATTN Dashboard →</a></p>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-6">
        <p className="text-fg-muted text-sm flex-1">
          USDC Attention Bonds (v2 legacy). Require senders to deposit USDC to reach your inbox. Bonds are refunded when you reply.
          Based on <a href="https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/" target="_blank" className="link">CO-QAF</a> (Ko, 2026).
        </p>
        <span className={`badge shrink-0 ${enabled ? 'badge-success' : 'badge-neutral'}`}>
          {enabled ? 'Enabled' : 'Not configured'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 bg-surface-2 border border-line rounded-lg p-1" role="tablist">
        {(['stats', 'deposit', 'my-bonds', 'config', 'whitelist'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 h-8 px-3 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
              tab === t ? 'bg-accent text-white' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {tab === 'stats' && stats && (
        <div className="space-y-6">
          {/* Email Activity */}
          <div className="card">
            <h2 className="text-base font-semibold mb-4">Email Activity</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Received" value={stats.email_activity?.received ?? 0} color="text-accent" />
              <Stat label="Sent" value={stats.email_activity?.sent ?? 0} color="text-success" />
              <Stat label="Unique Senders" value={stats.email_activity?.unique_senders ?? 0} />
              <Stat label="Reply Rate" value={`${Math.round((stats.email_activity?.reply_rate ?? 0) * 100)}%` as any} color="text-attn" />
            </div>
          </div>

          {/* QAF Score */}
          <div className="card border-l-2 border-l-accent">
            <h2 className="text-base font-semibold mb-3">QAF Score</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-semibold font-mono text-accent">{(stats.qaf?.qaf_value ?? 0).toFixed(2)}</div>
                <div className="text-xs text-fg-subtle mt-1">AV = (Σ√bᵢ)²</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold font-mono text-fg">{stats.qaf?.unique_senders ?? 0}</div>
                <div className="text-xs text-fg-subtle mt-1">Unique Senders</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold font-mono text-success">${(stats.qaf?.total_bonds ?? 0).toFixed(2)}</div>
                <div className="text-xs text-fg-subtle mt-1">Total Bonds</div>
              </div>
            </div>
            {(stats.qaf?.total_bonds ?? 0) > 0 && (
              <div className="mt-3 text-center text-xs text-fg-subtle">
                Breadth Premium: {((stats.qaf?.qaf_value ?? 0) / (stats.qaf?.total_bonds ?? 1)).toFixed(2)}× — diverse senders amplify your score
              </div>
            )}
          </div>

          {/* Bonds Received */}
          <div className="card">
            <h2 className="text-base font-semibold mb-4">Bonds Received</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Total" value={stats.bonds_received?.total ?? 0} />
              <Stat label="Active" value={stats.bonds_received?.active ?? 0} color="text-warning" />
              <Stat label="Refunded" value={stats.bonds_received?.refunded ?? 0} color="text-success" />
              <Stat label="Forfeited" value={stats.bonds_received?.forfeited ?? 0} color="text-danger" />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm">
              <div className="text-fg-muted">Total: <span className="text-fg font-mono">${(stats.bonds_received?.total_usdc ?? 0).toFixed(2)}</span></div>
              <div className="text-fg-muted">Refunded: <span className="text-success font-mono">${(stats.bonds_received?.refunded_usdc ?? 0).toFixed(2)}</span></div>
              <div className="text-fg-muted">Earned: <span className="text-danger font-mono">${(stats.bonds_received?.forfeited_usdc ?? 0).toFixed(2)}</span></div>
            </div>
          </div>

          {/* Bonds Sent */}
          <div className="card">
            <h2 className="text-base font-semibold mb-4">Bonds Sent</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Total" value={stats.bonds_sent?.total ?? 0} />
              <Stat label="Active" value={stats.bonds_sent?.active ?? 0} color="text-warning" />
              <Stat label="Refunded" value={stats.bonds_sent?.refunded ?? 0} color="text-success" />
              <Stat label="Forfeited" value={stats.bonds_sent?.forfeited ?? 0} color="text-danger" />
            </div>
            <div className="mt-4 text-sm text-fg-muted">
              Total bonded: <span className="text-fg font-mono">${(stats.bonds_sent?.total_usdc ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Config Tab */}
      {tab === 'config' && (
        <div className="card space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">Enable Attention Bonds</div>
              <div className="text-xs text-fg-subtle">Require USDC deposit to reach your inbox</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Enable Attention Bonds"
              onClick={() => setEnabled(!enabled)}
              className={`w-14 h-7 rounded-full transition-colors duration-150 relative shrink-0 ${enabled ? 'bg-accent' : 'bg-surface-2 border border-line-strong'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${enabled ? 'left-7' : 'left-0.5'}`} />
            </button>
          </div>

          {enabled && (
            <>
              {/* Base Price */}
              <div>
                <label className="field-label" htmlFor="ab-base-price">
                  Base Price (p₀) — USDC
                </label>
                <input
                  id="ab-base-price"
                  type="number" step="0.001" min="0.001" max="1000"
                  value={basePrice} onChange={e => setBasePrice(e.target.value)}
                  className="input input-mono"
                />
                <p className="field-hint">Starting price before demand adjustment</p>
              </div>

              {/* Dynamic pricing params */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="field-label" htmlFor="ab-alpha">α (demand)</label>
                  <input id="ab-alpha" type="number" step="0.01" min="0" max="10"
                    value={alpha} onChange={e => setAlpha(e.target.value)}
                    className="input input-mono" />
                  <p className="field-hint">Higher = price grows faster with demand</p>
                </div>
                <div>
                  <label className="field-label" htmlFor="ab-beta">β (curve)</label>
                  <input id="ab-beta" type="number" step="0.1" min="0.1" max="5"
                    value={beta} onChange={e => setBeta(e.target.value)}
                    className="input input-mono" />
                  <p className="field-hint">1=linear, 2=quadratic growth</p>
                </div>
                <div>
                  <label className="field-label" htmlFor="ab-gamma">γ (reply discount)</label>
                  <input id="ab-gamma" type="number" step="0.05" min="0" max="0.99"
                    value={gamma} onChange={e => setGamma(e.target.value)}
                    className="input input-mono" />
                  <p className="field-hint">Max discount for high reply-rate senders</p>
                </div>
              </div>

              {/* Response window */}
              <div>
                <label className="field-label" htmlFor="ab-response-window">
                  Response Window (hours)
                </label>
                <input id="ab-response-window" type="number" min="24" max="720"
                  value={responseHours} onChange={e => setResponseHours(e.target.value)}
                  className="input input-mono" />
                <p className="field-hint">Reply within this window to refund the sender's bond. Default: 168h (7 days)</p>
              </div>

              {/* Formula preview */}
              <div className="card-inset">
                <div className="text-xs text-fg-subtle mb-2 font-medium">Dynamic Pricing Formula</div>
                <div className="font-mono text-sm text-fg-muted break-words">
                  p(t,s) = {basePrice} × (1 + {alpha} × D(t))^{beta} × (1 − {gamma} × R̄ₛ)
                </div>
                <div className="text-xs text-fg-subtle mt-1">
                  D(t) = 7-day message count, R̄ₛ = sender's reply rate
                </div>
              </div>

              {/* On-chain price */}
              <div className="card-inset border-l-2 border-l-accent">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-fg">Set On-Chain Price</div>
                    <div className="text-xs text-fg-subtle mt-0.5">
                      Update AttentionBondEscrow contract with your base price
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={setOnChainPrice}
                    disabled={false}
                    className="btn btn-primary btn-sm shrink-0"
                  >
                    {chain?.id !== base.id ? 'Switch to Base' : `Set ${basePrice} USDC`}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Save button */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={saveConfig}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {msg && <span className="text-sm">{msg}</span>}
          </div>
        </div>
      )}

      {/* My Sent Bonds Tab */}
      {tab === 'my-bonds' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Your Sent Bonds</h2>
          {myBonds.length === 0 ? (
            <p className="text-fg-subtle text-sm py-8 text-center">No bonds sent yet. Deposit a bond when emailing someone who has Attention Bonds enabled.</p>
          ) : (
            <div className="space-y-2">
              {myBonds.map((b: any) => {
                const remaining = b.time_remaining_sec;
                const hours = Math.round(remaining / 3600);
                const statusColors: Record<string, string> = {
                  active: 'badge-warning',
                  refunded: 'badge-success',
                  forfeited: 'badge-danger',
                  exempt: 'badge-neutral',
                };
                return (
                  <div key={b.email_id} className="card-inset">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-sm text-fg break-all">{b.recipient_handle}@basemail.ai</span>
                      <span className={`badge capitalize ${statusColors[b.status] || 'badge-neutral'}`}>
                        {b.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                      <span>${Number(b.amount_usdc).toFixed(2)} USDC</span>
                      <span>{new Date(b.deposit_time * 1000).toLocaleDateString()}</span>
                      {b.status === 'active' && remaining > 0 && (
                        <span className={hours < 6 ? 'text-danger' : ''}>{hours}h left</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Whitelist Tab */}
      {tab === 'whitelist' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-base font-semibold mb-1">Add Sender to Whitelist</h2>
            <p className="text-xs text-fg-subtle mb-4">Whitelisted senders can email you without posting a bond.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text" value={wlHandle} onChange={e => setWlHandle(e.target.value)}
                placeholder="sender handle"
                className="input flex-1 min-w-0"
                aria-label="Sender handle"
              />
              <input
                type="text" value={wlNote} onChange={e => setWlNote(e.target.value)}
                placeholder="note (optional)"
                className="input flex-1 min-w-0"
                aria-label="Note"
              />
              <button type="button" onClick={addWhitelist} className="btn btn-primary shrink-0">
                Add
              </button>
            </div>
          </div>

          {whitelist.length === 0 ? (
            <div className="text-center text-fg-subtle py-8">No whitelisted senders yet</div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-fg-subtle text-xs uppercase tracking-wider">
                      <th className="text-left px-3 py-2 font-medium">Sender</th>
                      <th className="text-left px-3 py-2 font-medium">Note</th>
                      <th className="text-left px-3 py-2 font-medium">Added</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {whitelist.map((w: any) => (
                      <tr key={w.sender_handle || w.sender_wallet} className="border-b border-line last:border-0 hover:bg-surface-2 transition-colors duration-150">
                        <td className="px-3 py-2.5 font-mono whitespace-nowrap">{w.sender_handle || w.sender_wallet?.slice(0, 10) + '...'}</td>
                        <td className="px-3 py-2.5 text-fg-subtle">{w.note || '—'}</td>
                        <td className="px-3 py-2.5 text-fg-subtle whitespace-nowrap">{new Date(w.created_at * 1000).toLocaleDateString()}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" onClick={() => removeWhitelist(w.sender_handle || w.sender_wallet)}
                            className="text-danger hover:text-fg text-xs transition-colors duration-150">Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deposit Tab */}
      {tab === 'deposit' && (
        <div className="space-y-6">
          <div className="card border-l-2 border-l-warning">
            <h2 className="text-base font-semibold mb-2">Deposit Attention Bond</h2>
            <p className="text-fg-muted text-sm mb-6">
              Stake USDC to guarantee a response from a BaseMail user. The bond is refunded if the recipient replies within the response window.
            </p>

            {depStep === 'done' ? (
              <div className="card-inset border-l-2 border-l-success text-center py-6">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-success/15 text-success flex items-center justify-center">
                  <Icon.Check size={24} />
                </div>
                <h4 className="font-semibold text-lg text-success mb-2">Bond Deposited!</h4>
                <p className="text-fg-muted text-sm mb-3 break-words">
                  Your bond of <span className="text-warning font-semibold">${parseFloat(depAmount).toFixed(4)} USDC</span> to{' '}
                  <span className="text-fg font-mono">{depRecipient}@basemail.ai</span> has been recorded.
                </p>
                {depTxHash && (
                  <a href={`https://basescan.org/tx/${depTxHash}`} target="_blank" className="link text-xs">
                    View transaction ↗
                  </a>
                )}
                <div className="mt-4">
                  <button type="button" onClick={() => { setDepStep('input'); setDepRecipient(''); setDepAmount('0.01'); setDepEmailId(''); setDepError(''); setDepTxHash(''); }}
                    className="link text-sm">Deposit another bond</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Recipient */}
                <div>
                  <label className="field-label" htmlFor="ab-dep-recipient">Recipient Handle</label>
                  <div className="input-group">
                    <input
                      id="ab-dep-recipient"
                      type="text" value={depRecipient}
                      onChange={e => setDepRecipient(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="recipient"
                      disabled={depStep !== 'input'}
                      className="font-mono disabled:opacity-50"
                    />
                    <span className="suffix">@basemail.ai</span>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label className="field-label" htmlFor="ab-dep-amount">Bond Amount (USDC)</label>
                  <input
                    id="ab-dep-amount"
                    type="number" step="0.001" min="0.001" value={depAmount}
                    onChange={e => setDepAmount(e.target.value)}
                    disabled={depStep !== 'input'}
                    className="input input-mono"
                  />
                </div>

                {/* Email ID (optional) */}
                <div>
                  <label className="field-label" htmlFor="ab-dep-email-id">Email ID <span className="text-fg-subtle font-normal">(optional — link bond to a specific email)</span></label>
                  <input
                    id="ab-dep-email-id"
                    type="text" value={depEmailId}
                    onChange={e => setDepEmailId(e.target.value)}
                    placeholder="Leave empty for general bond"
                    disabled={depStep !== 'input'}
                    className="input input-mono"
                  />
                </div>

                {/* Progress indicator */}
                {depStep !== 'input' && depStep !== 'error' && (
                  <div className="card-inset space-y-2">
                    <div className={`flex items-center gap-2 text-sm ${depStep === 'approving' ? 'text-warning' : 'text-success'}`}>
                      {depStep === 'approving' ? <Icon.Refresh size={14} className="animate-spin" /> : <Icon.Check size={14} />} Step 1: Approve USDC
                      {depStep === 'approving' && <span className="text-fg-subtle text-xs">— confirm in wallet...</span>}
                    </div>
                    <div className={`flex items-center gap-2 text-sm ${depStep === 'depositing' ? 'text-warning' : (depStep as string) === 'recording' || (depStep as string) === 'done' ? 'text-success' : 'text-fg-subtle'}`}>
                      {depStep === 'depositing' ? <Icon.Refresh size={14} className="animate-spin" /> : (depStep as string) === 'recording' || (depStep as string) === 'done' ? <Icon.Check size={14} /> : <Icon.Dot size={14} />} Step 2: Deposit to Escrow
                      {depStep === 'depositing' && <span className="text-fg-subtle text-xs">— confirm in wallet...</span>}
                    </div>
                    <div className={`flex items-center gap-2 text-sm ${depStep === 'recording' ? 'text-warning' : 'text-fg-subtle'}`}>
                      {depStep === 'recording' ? <Icon.Refresh size={14} className="animate-spin" /> : <Icon.Dot size={14} />} Step 3: Record bond
                    </div>
                  </div>
                )}

                {depError && <div className="text-danger text-sm">{depError}</div>}

                <button
                  type="button"
                  onClick={async () => {
                    if (!depRecipient || !depAmount || parseFloat(depAmount) < 0.001) {
                      setDepError('Recipient and amount (min 0.001 USDC) required');
                      return;
                    }
                    if (chain?.id !== base.id) {
                      switchChain({ chainId: base.id });
                      return;
                    }

                    setDepError('');
                    const amountRaw = BigInt(Math.round(parseFloat(depAmount) * 1e6));
                    const { keccak256, toBytes } = await import('viem');
                    const emailIdBytes = depEmailId
                      ? keccak256(toBytes(depEmailId))
                      : keccak256(toBytes(`bond-${Date.now()}-${Math.random()}`));

                    try {
                      // Get recipient wallet
                      const checkRes = await fetch(`${API_BASE}/api/register/check/${depRecipient}`);
                      const checkData = await checkRes.json() as any;
                      if (!checkData.registered) {
                        setDepError(`${depRecipient}@basemail.ai is not registered`);
                        return;
                      }
                      let recipientWallet = checkData.wallet as `0x${string}`;
                      // If no wallet in response (old data), look up on-chain via ownerOf
                      if (!recipientWallet && checkData.basename) {
                        const { keccak256: k, toBytes: tb, createPublicClient: cpc, http: h } = await import('viem');
                        const { base: baseChain } = await import('viem/chains');
                        const pc = cpc({ chain: baseChain, transport: h() });
                        const label = checkData.basename.replace(/\.base\.eth$/, '');
                        const tokenId = BigInt(k(tb(label)));
                        recipientWallet = await pc.readContract({
                          address: '0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a',
                          abi: [{ inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'ownerOf', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' }],
                          functionName: 'ownerOf',
                          args: [tokenId],
                        }) as `0x${string}`;
                      }
                      if (!recipientWallet) {
                        setDepError('Could not resolve recipient wallet address');
                        return;
                      }

                      // Step 1: Check allowance & approve if needed
                      setDepStep('approving');
                      const publicClient = (await import('viem')).createPublicClient({
                        chain: base,
                        transport: (await import('viem')).http(),
                      });
                      const currentAllowance = await publicClient.readContract({
                        address: BASE_MAINNET_USDC,
                        abi: ERC20_ABI,
                        functionName: 'allowance',
                        args: [walletAddr, ESCROW_CONTRACT],
                      });

                      if (currentAllowance < amountRaw) {
                        await writeContractAsync({
                          address: BASE_MAINNET_USDC,
                          abi: ERC20_ABI,
                          functionName: 'approve',
                          args: [ESCROW_CONTRACT, amountRaw],
                        });
                        // Brief wait for approval to propagate
                        await new Promise(r => setTimeout(r, 2000));
                      }

                      // Step 2: Deposit
                      setDepStep('depositing');
                      const txHash = await writeContractAsync({
                        address: ESCROW_CONTRACT,
                        abi: ESCROW_ABI,
                        functionName: 'deposit',
                        args: [recipientWallet, emailIdBytes, amountRaw],
                      });
                      setDepTxHash(txHash);

                      // Step 3: Record with API
                      setDepStep('recording');
                      const bondRes = await apiFetch('/api/attention/bond', auth.token, {
                        method: 'POST',
                        body: JSON.stringify({
                          email_id: depEmailId || `bond-${Date.now()}`,
                          recipient_handle: depRecipient,
                          tx_hash: txHash,
                        }),
                      });
                      const bondData = await bondRes.json() as any;
                      if (!bondRes.ok) throw new Error(bondData.error || 'Failed to record bond');

                      setDepStep('done');
                      loadAll(); // Refresh stats
                    } catch (e: any) {
                      setDepError(e.message?.includes('User rejected') ? 'Transaction cancelled.' : `Error: ${e.message?.slice(0, 150)}`);
                      setDepStep('error');
                    }
                  }}
                  disabled={depStep !== 'input' && depStep !== 'error'}
                  className="btn btn-primary btn-lg w-full"
                >
                  {depStep === 'input' || depStep === 'error' ? `Deposit ${parseFloat(depAmount || '0').toFixed(4)} USDC Bond` : 'Processing...'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contract info */}
      <div className="mt-8 border-t border-line pt-6">
        <div className="text-xs text-fg-subtle space-y-1">
          <div className="break-all">Escrow Contract: <a href={`https://basescan.org/address/${ESCROW_CONTRACT}`} target="_blank" className="text-fg-muted hover:text-accent font-mono transition-colors duration-150">{ESCROW_CONTRACT}</a></div>
          <div>Protocol Fee: 10% (τ) · Response Window: {responseHours}h · Min Bond: 0.001 USDC</div>
          <div>QAF Formula: AV = (Σ√bᵢ)² — more diverse senders = higher score</div>
        </div>
      </div>
    </div>
  );
}

// ─── Pending Action Banner (from ?claim= or ?buy= URL params) ────
// ── Basename Registrar ABI (for direct user purchase via wagmi) ──
const BASENAME_REGISTRAR = '0xa7d2607c6BD39Ae9521e514026CBB078405Ab322' as `0x${string}`;
const BASENAME_REGISTRAR_ABI = parseAbi([
  'function register((string name, address owner, uint256 duration, address resolver, bytes[] data, bool reverseRecord, uint256[] coinTypes, uint256 signatureExpiry, bytes signature) request) payable',
]);

function PendingActionBanner({
  action, auth, onUpgrade, upgrading, onDismiss, onSessionExpired,
}: {
  action: { type: 'claim' | 'buy'; name: string };
  auth: AuthState;
  onUpgrade: (basename?: string, autoBuy?: boolean) => void;
  upgrading: boolean;
  error?: string;
  onDismiss: () => void;
  onSessionExpired?: () => void;
}) {
  const [checking, setChecking] = useState(true);
  const [ownsName, setOwnsName] = useState(false);
  const [priceEth, setPriceEth] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [buyData, setBuyData] = useState<any>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'check' | 'ready' | 'signing' | 'confirming' | 'upgrading' | 'done'>('check');
  const [fallbackName, setFallbackName] = useState('');
  const [fallbackError, setFallbackError] = useState('');
  const [fallbackUpgrading, setFallbackUpgrading] = useState(false);
  const { writeContract, isPending: isSigning, data: txHash, error: txError } = useWriteContract();
  const { switchChain } = useSwitchChain();
  const { chain } = useAccount();
  const txResult = useWaitForTransactionReceipt({ hash: txHash });

  // Step 1: Check availability + get buy data
  useEffect(() => {
    (async () => {
      setChecking(true);
      try {
        if (action.type === 'claim') {
          // Verify ownership via upgrade endpoint (checks ownerOf on-chain)
          const upgradeRes = await apiFetch('/api/register/upgrade', auth.token, {
            method: 'PUT',
            body: JSON.stringify({ basename: `${action.name}.base.eth` }),
          });
          if (upgradeRes.ok) {
            // Upgrade succeeded — ownership verified and email upgraded!
            const data = await upgradeRes.json();
            setOwnsName(true);
            setChecking(false);
            // Reload auth state
            window.location.href = '/dashboard';
            return;
          }
          // Auth expired → show reconnect button (don't auto-disconnect to avoid loops)
          if (upgradeRes.status === 401) {
            setError('__SESSION_EXPIRED__');
            setChecking(false);
            return;
          }
          const errData = await upgradeRes.json().catch(() => ({}));
          // If "already has Basename handle" — user already upgraded
          if (errData.error?.includes('already has')) {
            window.location.href = '/dashboard';
            return;
          }
          setError(errData.error || `Could not verify ownership of ${action.name}.base.eth.`);
        }

        // Get buy data from API (public endpoint, no auth needed)
        const buyRes = await fetch(`${API_BASE}/api/register/buy-data/${action.name}?owner=${auth.wallet}`);
        if (buyRes.ok) {
          const data = await buyRes.json();
          setBuyData(data);
          setAvailable(true);
          setPriceEth(data.price_eth);
          setStep('ready');
        } else {
          const err = await buyRes.json().catch(() => ({}));
          if (err.error?.includes('not available')) {
            // Name was already bought — maybe by this user! Try claiming it.
            const upgradeRes = await apiFetch('/api/register/upgrade', auth.token, {
              method: 'PUT',
              body: JSON.stringify({ basename: `${action.name}.base.eth` }),
            });
            if (upgradeRes.ok) {
              // User owns it! Upgrade succeeded.
              window.location.href = '/dashboard';
              return;
            }
            if (upgradeRes.status === 401) {
              setError('__SESSION_EXPIRED__');
              setChecking(false);
              return;
            }
            const upgradeErr = await upgradeRes.json().catch(() => ({}));
            if (upgradeErr.error?.includes('already has')) {
              window.location.href = '/dashboard';
              return;
            }
            setError(`${action.name}.base.eth is already taken. ${upgradeErr.error || 'Someone else owns it.'}`);
          } else {
            setError(err.error || `${action.name}.base.eth is not available.`);
          }
        }
      } catch (e: any) {
        setError(e.message || 'Failed to check availability');
      }
      setChecking(false);
    })();
  }, [action, auth]);

  // Step 2: After claim verification, trigger upgrade
  useEffect(() => {
    if (ownsName && action.type === 'claim' && !upgrading) {
      onUpgrade(action.name);
    }
  }, [ownsName]);

  // Step 3: Track tx signing
  useEffect(() => {
    if (isSigning) setStep('signing');
  }, [isSigning]);

  // Step 4: Track tx confirmation
  useEffect(() => {
    if (txHash && !txResult.isSuccess) setStep('confirming');
  }, [txHash, txResult.isSuccess]);

  // Step 5: After buy tx confirms → upgrade email
  useEffect(() => {
    if (txResult.isSuccess) {
      setStep('upgrading');
      setTimeout(() => onUpgrade(action.name), 3000);
    }
  }, [txResult.isSuccess]);

  // Track tx error
  useEffect(() => {
    if (txError) {
      setError(txError.message?.includes('User rejected') ? 'Transaction cancelled.' : `Transaction failed: ${txError.message?.slice(0, 100)}`);
      setStep('ready');
    }
  }, [txError]);

  if (checking) {
    return (
      <div className="card mb-6 flex items-center gap-3" aria-busy="true">
        <div className="skeleton w-5 h-5 rounded-full shrink-0" />
        <div className="text-fg-muted text-sm">Checking {action.name}.base.eth...</div>
      </div>
    );
  }

  // Claim flow: verified owner → auto-upgrading
  if (action.type === 'claim' && ownsName) {
    return (
      <div className="card border-l-2 border-l-success mb-6">
        <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
          <Icon.Check size={18} className="text-success" /> Ownership Verified!
        </h3>
        <p className="text-fg-muted text-sm">
          You own <span className="text-accent font-mono font-semibold">{action.name}.base.eth</span>. Upgrading your email...
        </p>
      </div>
    );
  }

  // Upgrading after purchase
  if (step === 'upgrading' || step === 'done') {
    return (
      <div className="card border-l-2 border-l-success mb-6">
        <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
          <Icon.Check size={18} className="text-success" /> Purchase Confirmed!
        </h3>
        <p className="text-fg-muted text-sm">
          <span className="text-accent font-mono font-semibold">{action.name}.base.eth</span> is yours! Setting up your email...
        </p>
        {txHash && (
          <a href={`https://basescan.org/tx/${txHash}`} target="_blank" className="link text-xs mt-2 block">
            View transaction ↗
          </a>
        )}
      </div>
    );
  }

  async function handleFallbackClaim() {
    if (!fallbackName.trim()) { setFallbackError('Please enter your Basename'); return; }
    setFallbackUpgrading(true);
    setFallbackError('');
    try {
      const fullName = `${fallbackName.trim().replace(/\.base\.eth$/i, '')}.base.eth`;
      const res = await apiFetch('/api/register/upgrade', auth.token, {
        method: 'PUT',
        body: JSON.stringify({ basename: fullName }),
      });
      if (res.ok) {
        window.location.href = '/dashboard';
        return;
      }
      const errData = await res.json().catch(() => ({}));
      if (errData.error?.includes('already has')) {
        window.location.href = '/dashboard';
        return;
      }
      setFallbackError(errData.error || 'Verification failed');
    } catch (e: any) {
      setFallbackError(e.message || 'Failed');
    }
    setFallbackUpgrading(false);
  }

  // Buy flow → direct on-chain purchase
  return (
    <div className="card border-l-2 border-l-accent mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold flex items-center gap-2 min-w-0">
          {action.type === 'claim'
            ? <Icon.Warning size={18} className="text-warning" />
            : <Icon.Spark size={18} className="text-accent" />}
          <span className="break-all">
            {action.type === 'claim'
              ? `You don't own ${action.name}.base.eth`
              : `Buy ${action.name}.base.eth`}
          </span>
        </h3>
        <button type="button" onClick={onDismiss} className="btn btn-ghost btn-icon -mr-2 -mt-1 shrink-0" aria-label="Dismiss">
          <Icon.Close size={16} />
        </button>
      </div>

      {error === '__SESSION_EXPIRED__' && (
        <div className="mb-4">
          <p className="text-warning text-sm mb-3">Your session has expired. Please reconnect your wallet to claim this Basename.</p>
          <button
            type="button"
            onClick={() => { if (onSessionExpired) onSessionExpired(); }}
            className="btn btn-primary btn-sm"
          >
            <Icon.Refresh size={14} /> Reconnect Wallet
          </button>
        </div>
      )}

      {error && error !== '__SESSION_EXPIRED__' && <p className="text-danger text-sm mb-3">{error}</p>}

      {/* Fallback: if claim failed, let user try a different basename */}
      {error && error !== '__SESSION_EXPIRED__' && !available && (
        <div className="card-inset mb-4">
          <div className="text-sm font-semibold mb-2">Own a different Basename?</div>
          <p className="text-fg-muted text-xs mb-3">
            Enter your actual Basename to claim your email address.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="input-group flex-1 min-w-0">
              <input
                type="text"
                value={fallbackName}
                onChange={(e) => { setFallbackName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setFallbackError(''); }}
                placeholder="yourname"
                className="font-mono"
                aria-label="Basename"
              />
              <span className="suffix">.base.eth</span>
            </div>
            <button
              type="button"
              onClick={handleFallbackClaim}
              disabled={fallbackUpgrading || !fallbackName.trim()}
              className="btn btn-primary shrink-0"
            >
              {fallbackUpgrading ? 'Verifying...' : 'Claim'}
            </button>
          </div>
          {fallbackError && <p className="text-danger text-xs mt-2">{fallbackError}</p>}
        </div>
      )}

      {available && priceEth && buyData && (
        <>
          {action.type === 'claim' && (
            <p className="text-warning text-sm mb-3">
              Your wallet doesn't own this Basename yet. Buy it now and we'll set up your email:
            </p>
          )}

          {/* Price breakdown */}
          <div className="card-inset mb-4">
            <div className="flex justify-between gap-4 text-sm mb-1">
              <span className="text-fg-muted">Registration fee (1 year)</span>
              <span className="text-fg font-mono">{parseFloat(priceEth).toFixed(4)} ETH</span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 text-xs text-fg-subtle">
              <span>≈ ${(parseFloat(priceEth) * 2800).toFixed(2)} USD</span>
              <span>+ 10% buffer for price fluctuation</span>
            </div>
          </div>

          {/* Step indicator */}
          {step !== 'ready' && (
            <div className="card-inset py-3 mb-4 text-sm">
              {step === 'signing' && <span className="text-warning">Please confirm the transaction in your wallet...</span>}
              {step === 'confirming' && (
                <span className="text-accent">
                  Transaction submitted! Waiting for confirmation...
                  {txHash && (
                    <a href={`https://basescan.org/tx/${txHash}`} target="_blank" className="link text-xs ml-2">
                      View ↗
                    </a>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Buy button */}
          <button
            type="button"
            onClick={() => {
              if (chain?.id !== base.id) {
                switchChain({ chainId: base.id });
                return;
              }
              setError('');
              const args = buyData.contract.args;
              writeContract({
                address: BASENAME_REGISTRAR,
                abi: BASENAME_REGISTRAR_ABI,
                functionName: 'register',
                args: [{
                  name: args.name,
                  owner: args.owner as `0x${string}`,
                  duration: BigInt(args.duration),
                  resolver: args.resolver as `0x${string}`,
                  data: args.data as `0x${string}`[],
                  reverseRecord: args.reverseRecord,
                  coinTypes: [] as readonly bigint[],
                  signatureExpiry: 0n,
                  signature: '0x' as `0x${string}`,
                }],
                value: BigInt(buyData.contract.value),
              });
            }}
            disabled={step !== 'ready'}
            className="btn btn-primary btn-lg w-full h-auto py-3 whitespace-normal"
          >
            {chain?.id !== base.id
              ? 'Switch to Base'
              : step === 'signing'
                ? 'Confirm in Wallet...'
                : step === 'confirming'
                  ? 'Confirming...'
                  : `Buy ${action.name}.base.eth + Register Email`}
          </button>

          <p className="text-xs text-fg-subtle mt-2 text-center">
            You pay directly from your wallet to the Base Registrar contract. No middleman.
          </p>
        </>
      )}

      {!available && action.type === 'buy' && !error && (
        <p className="text-danger text-sm">This Basename is not available. Try a different name.</p>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-semibold font-mono ${color || 'text-fg'}`}>{value}</div>
      <div className="text-xs text-fg-subtle mt-0.5">{label}</div>
    </div>
  );
}

// ─── ATTN Dashboard (v3) ─────────────────────────────────
function AttnDashboard({ auth }: { auth: AuthState }) {
  const [balance, setBalance] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [settings, setSettings] = useState<{ receive_price: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceInput, setPriceInput] = useState(1);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!auth?.token) return;
    Promise.all([
      apiFetch('/api/attn/balance', auth.token).then(r => r.json()),
      apiFetch('/api/attn/history?limit=20', auth.token).then(r => r.json()),
      apiFetch('/api/attn/settings', auth.token).then(r => r.json()),
    ]).then(([bal, hist, sett]) => {
      setBalance(bal);
      setHistory(hist.transactions || []);
      setSettings(sett);
      setPriceInput(sett?.receive_price ?? 1);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [auth?.token]);

  async function savePrice() {
    setSaving(true);
    try {
      await apiFetch('/api/attn/settings', auth.token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receive_price: priceInput }),
      });
      setSettings(prev => prev ? { ...prev, receive_price: priceInput } : prev);
    } catch {}
    setSaving(false);
  }

  async function claimDrip() {
    setClaiming(true);
    try {
      const res = await apiFetch('/api/attn/claim', auth.token, { method: 'POST' });
      const data = await res.json();
      if (data.claimed) {
        setBalance((prev: any) => prev ? {
          ...prev,
          balance: data.balance,
          can_claim: false,
          next_claim_in_seconds: data.next_claim_in_seconds,
        } : prev);
      } else if (data.reason === 'already_claimed') {
        setBalance((prev: any) => prev ? {
          ...prev,
          can_claim: false,
          next_claim_in_seconds: data.next_claim_in_seconds,
        } : prev);
      }
    } catch {}
    setClaiming(false);
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading $ATTN">
        <h1 className="text-h3 font-semibold mb-6">$ATTN — Attention Tokens</h1>
        <div className="card space-y-3 mb-6">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-8 w-40" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-16" />)}
          </div>
        </div>
        <div className="card space-y-3">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-2/3" />
        </div>
      </div>
    );
  }

  const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    signup_grant: { label: 'Welcome Grant', color: 'text-success' },
    drip: { label: 'Daily Drip', color: 'text-accent' },
    drip_batch: { label: 'Daily Drip (system)', color: 'text-accent' },
    drip_claim: { label: 'Daily Claim', color: 'text-accent' },
    airdrop: { label: 'Airdrop', color: 'text-warning' },
    stake: { label: 'Staked', color: 'text-warning' },
    refund: { label: 'Refunded', color: 'text-success' },
    reply_bonus: { label: 'Reply Bonus', color: 'text-attn' },
    compensation: { label: 'Compensation', color: 'text-fg' },
    forfeit: { label: 'Forfeited', color: 'text-danger' },
    cap_refund: { label: 'Cap Refund', color: 'text-fg-muted' },
    purchase: { label: 'Purchased', color: 'text-success' },
    transfer: { label: 'Received', color: 'text-fg' },
  };

  return (
    <div>
      <h1 className="text-h3 font-semibold mb-6">$ATTN — Attention Tokens</h1>

      {/* Balance Card */}
      <div className="card border-l-2 border-l-attn mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <div className="text-sm text-fg-muted mb-1">Your Balance</div>
            <div className="text-2xl font-semibold font-mono text-fg">{balance?.balance ?? 0} <span className="text-base text-attn">ATTN</span></div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs text-fg-subtle">Daily earned</div>
            <div className="text-sm text-fg-muted font-mono">{balance?.daily_earned ?? 0} / {balance?.daily_earn_cap ?? 200}</div>
            <div className="text-xs text-fg-subtle mt-2">Daily Drip</div>
            {balance?.can_claim ? (
              <button
                type="button"
                onClick={claimDrip}
                disabled={claiming}
                className="btn btn-attn btn-sm mt-1 animate-pulse"
              >
                {claiming ? 'Claiming...' : `Claim +${balance?.constants?.daily_drip ?? 10} ATTN`}
              </button>
            ) : (
              <div className="text-sm text-fg-subtle">
                Next claim in {balance?.next_claim_in_seconds > 0
                  ? `${Math.floor(balance.next_claim_in_seconds / 3600)}h ${Math.floor((balance.next_claim_in_seconds % 3600) / 60)}m`
                  : '—'}
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs">
          <div className="card-inset py-3">
            <div className="text-fg-muted">Cold email</div>
            <div className="text-fg font-semibold font-mono">3 ATTN</div>
          </div>
          <div className="card-inset py-3">
            <div className="text-fg-muted">Reply thread</div>
            <div className="text-fg font-semibold font-mono">1 ATTN</div>
          </div>
          <div className="card-inset py-3">
            <div className="text-fg-muted">Reply bonus</div>
            <div className="text-fg font-semibold font-mono">+2 each</div>
          </div>
        </div>
      </div>

      {/* Airdrop Waves */}
      <AirdropWaves auth={auth} />

      {/* Receive Price Setting */}
      <div className="card mb-6">
        <h2 className="text-base font-semibold mb-1">Receive Price</h2>
        <p className="text-xs text-fg-subtle mb-3">How much ATTN should senders stake to email you? (Cold emails always cost at least 3)</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="range" min={1} max={10} value={priceInput}
            onChange={e => setPriceInput(parseInt(e.target.value))}
            className="w-full sm:w-auto sm:flex-1 accent-attn"
            aria-label="Receive price in ATTN"
          />
          <span className="text-fg font-semibold font-mono text-sm shrink-0">{priceInput} ATTN</span>
          <button
            type="button"
            onClick={savePrice}
            disabled={saving || priceInput === (settings?.receive_price ?? 1)}
            className="btn btn-attn btn-sm"
          >
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </div>

      {/* How $ATTN Works */}
      <div className="card mb-6">
        <h2 className="text-base font-semibold mb-3">How $ATTN Works</h2>
        <ul className="space-y-2 text-xs text-fg-muted list-disc pl-4">
          <li>Someone emails you → they stake ATTN</li>
          <li>You read it → ATTN refunded to sender (good email!)</li>
          <li>You reply → both of you get +2 ATTN bonus</li>
          <li>You reject it → ATTN transferred to you (compensation)</li>
          <li>48h unread → ATTN transferred to you automatically</li>
          <li>Every day → claim +10 ATTN (use it or lose it!)</li>
        </ul>
      </div>

      {/* Transaction History */}
      <div className="card">
        <h2 className="text-base font-semibold mb-3">Transaction History</h2>
        {history.length === 0 ? (
          <p className="text-fg-subtle text-sm text-center py-6">No transactions yet</p>
        ) : (
          <div className="divide-y divide-line">
            {history.map((tx: any) => {
              const info = TYPE_LABELS[tx.type] || { label: tx.type, color: 'text-fg-muted' };
              return (
                <div key={tx.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <span className={`text-sm ${info.color}`}>{info.label}</span>
                    {tx.note && <span className="text-xs text-fg-subtle block sm:inline sm:ml-2 truncate">{tx.note}</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-mono text-sm font-semibold ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </span>
                    <span className="text-xs text-fg-subtle text-right">
                      {new Date(tx.created_at * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Airdrop Waves Component ─────────────────────────────
function AirdropWaves({ auth }: { auth: AuthState }) {
  const [waves, setWaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingWave, setClaimingWave] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!auth?.token) return;
    apiFetch('/api/airdrop/waves', auth.token)
      .then(r => r.json())
      .then(d => setWaves(d.waves || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [auth?.token]);

  // Countdown timer
  useEffect(() => {
    const previewWaves = waves.filter(w => w.status === 'preview');
    if (previewWaves.length === 0) return;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const cd: Record<string, string> = {};
      for (const w of previewWaves) {
        const diff = Math.max(0, w.claim_opens_at - now);
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        cd[w.id] = days > 0
          ? `${days}d ${hours}h ${mins}m ${secs}s`
          : `${hours}h ${mins}m ${secs}s`;
      }
      setCountdown(cd);
    }, 1000);
    return () => clearInterval(interval);
  }, [waves]);

  const [confettiWave, setConfettiWave] = useState<string | null>(null);

  async function claimWave(waveId: string) {
    setClaimingWave(waveId);
    try {
      const res = await apiFetch(`/api/airdrop/${waveId}/claim`, auth.token, { method: 'POST' });
      const data = await res.json();
      if (data.claimed) {
        setConfettiWave(waveId);
        setTimeout(() => setConfettiWave(null), 4000);
        setWaves(prev => prev.map(w =>
          w.id === waveId ? { ...w, status: 'claimed', claimed: { amount: data.amount, claimed_at: Math.floor(Date.now() / 1000) } } : w
        ));
      } else {
        alert(data.error || 'Claim failed');
      }
    } catch { alert('Claim failed'); }
    setClaimingWave(null);
  }

  if (loading || waves.length === 0) return null;

  return (
    <div className="mb-6">
      {waves.map(wave => (
        <div
          key={wave.id}
          className={`card mb-3 relative overflow-hidden border-l-2 ${
            wave.status === 'claimed'
              ? 'border-l-success'
              : wave.status === 'claimable'
              ? 'border-l-warning'
              : 'border-l-attn'
          }`}
        >
          {/* Confetti overlay */}
          {confettiWave === wave.id && (
            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden" aria-hidden="true">
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute animate-bounce"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `-${Math.random() * 20}%`,
                    fontSize: `${12 + Math.random() * 16}px`,
                    animationDuration: `${1 + Math.random() * 2}s`,
                    animationDelay: `${Math.random() * 0.5}s`,
                    animation: `confettiFall ${2 + Math.random() * 2}s ease-in forwards`,
                  }}
                >
                  {['🎉', '🎊', '✨', '⚡', '🥳', '💰', '🐣', '🦞'][Math.floor(Math.random() * 8)]}
                </div>
              ))}
              <style>{`
                @keyframes confettiFall {
                  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
                  100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
                }
              `}</style>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl inline-block" style={{ animation: 'chickenWiggle 1.5s ease-in-out infinite' }} aria-hidden="true">{wave.badge}</span>
            <style>{`
              @keyframes chickenWiggle {
                0%, 100% { transform: rotate(0deg); }
                15% { transform: rotate(12deg) scale(1.1); }
                30% { transform: rotate(-10deg); }
                45% { transform: rotate(8deg) scale(1.05); }
                60% { transform: rotate(-6deg); }
                75% { transform: rotate(4deg); }
              }
            `}</style>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-fg">{wave.name}</h3>
              <p className="text-xs text-fg-subtle">{wave.description}</p>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3 text-center text-xs">
            {[
              { label: 'Received', value: wave.score.breakdown.emails_received, icon: Icon.Inbox },
              { label: 'Read', value: wave.score.breakdown.emails_read, icon: Icon.Mail },
              { label: 'Replied', value: wave.score.breakdown.emails_replied, icon: Icon.Reply },
              { label: 'Sent', value: wave.score.breakdown.emails_sent, icon: Icon.Send },
              { label: 'Staked', value: wave.score.breakdown.attn_staked, icon: Icon.Attn },
              { label: 'Days', value: wave.score.breakdown.days_since_signup, icon: Icon.ChartBar },
            ].map(item => (
              <div key={item.label} className="card-inset p-2">
                <item.icon size={14} className="block mx-auto text-fg-subtle mb-1" />
                <div className="text-fg font-semibold font-mono">{item.value}</div>
                <div className="text-fg-subtle text-xs">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="card-inset px-4 py-3 mb-3 text-center">
            <div className="text-xs text-fg-subtle mb-1">
              Base: {wave.score.base_score} × {wave.multiplier}x multiplier
            </div>
            <div className="text-2xl font-semibold font-mono text-fg">
              {wave.score.total} <span className="text-base text-attn">ATTN</span>
            </div>
          </div>

          {/* Claim area */}
          {wave.status === 'preview' && (
            <div className="text-center">
              <div className="text-xs text-fg-subtle mb-2">Claim opens in</div>
              <div className="text-lg font-mono text-attn mb-3">{countdown[wave.id] || '...'}</div>
              <button type="button" disabled className="btn btn-secondary btn-lg w-full">
                <Icon.Lock size={16} /> Locked
              </button>
            </div>
          )}

          {wave.status === 'claimable' && (
            <button
              type="button"
              onClick={() => claimWave(wave.id)}
              disabled={claimingWave === wave.id || wave.score.total <= 0}
              className="btn btn-primary btn-lg w-full active:scale-[0.98]"
            >
              {claimingWave === wave.id ? 'Claiming...' : 'Claim Airdrop'}
            </button>
          )}

          {wave.status === 'claimed' && (
            <div className="card-inset border-l-2 border-l-success text-center py-3">
              <div className="text-success text-lg font-semibold flex items-center justify-center gap-2">
                <Icon.Check size={18} /> Claimed +{wave.claimed.amount} ATTN
              </div>
              <div className="text-xs text-fg-subtle">
                {new Date(wave.claimed.claimed_at * 1000).toLocaleDateString()}
              </div>
            </div>
          )}

          {wave.status === 'expired' && (
            <div className="text-center text-fg-subtle text-sm py-2">Claim window has closed</div>
          )}
        </div>
      ))}
    </div>
  );
}
