import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useSignMessage } from 'wagmi';
import { Logo } from '../components/SiteHeader';
import { Icon } from '../components/Icons';

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? '' : 'https://api.basemail.ai';

interface ClaimInfo {
  claim_id: string;
  sender: string;
  recipient_email: string;
  amount_usdc: number;
  network: string;
  status: string;
  expires_at: number;
  created_at: number;
  expired: boolean;
}

/** Shorten 0x addresses for display: 0x1234…abcd */
function formatHandle(h: string): string {
  if (/^0x[0-9a-fA-F]{40}$/i.test(h)) return `${h.slice(0, 6)}…${h.slice(-4)}`;
  return h;
}

type IconComponent = typeof Icon.Check;

/** Large tinted status glyph at the top of the card. */
function StatusGlyph({ tone, icon: Glyph }: { tone: 'success' | 'danger' | 'accent'; icon: IconComponent }) {
  const tones = {
    success: 'bg-success/15 text-success',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accent-soft text-[#7da2ff]',
  };
  return (
    <span className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${tones[tone]}`}>
      <Glyph size={28} />
    </span>
  );
}

export default function Claim() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const [claim, setClaim] = useState<ClaimInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState('');
  const [claimResult, setClaimResult] = useState<any>(null);

  // Fetch claim info
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/api/claim/${id}`)
      .then(r => r.json())
      .then(data => { if (data.error) setError(data.error); else setClaim(data); })
      .catch(() => setError('Failed to load claim'))
      .finally(() => setLoading(false));
  }, [id]);

  // One-click: auth + claim in a single user-initiated action
  const handleAuthAndClaim = useCallback(async () => {
    if (!address || !id) return;
    setStatusError('');

    try {
      // 1. SIWE auth (account auto-created during claim if needed)
      setStatus('Preparing sign-in...');
      const startRes = await fetch(`${API_BASE}/api/auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const { nonce, message } = await startRes.json();

      setStatus('Please sign in your wallet...');
      const signature = await signMessageAsync({ message });

      setStatus('Verifying...');
      const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature, nonce, message }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.token) throw new Error(verifyData.error || 'Authentication failed');

      // 2. Claim (auto-registers if no account)
      setStatus('Claiming USDC...');
      const claimRes = await fetch(`${API_BASE}/api/claim/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${verifyData.token}` },
      });
      const claimData = await claimRes.json();
      if (!claimRes.ok) throw new Error(claimData.error || 'Claim failed');

      // If a new token was issued (new account created), store it
      if (claimData.token) {
        localStorage.setItem('basemail_token', claimData.token);
      }

      setClaimResult({ ...claimData, handle: claimData.claimer || verifyData.handle });
      setStatus('');
    } catch (e: any) {
      setStatusError(e.message || 'Failed');
      setStatus('');
    }
  }, [address, id, signMessageAsync]);

  const networkLabel = claim?.network === 'base-mainnet' ? 'Base' : 'Base Sepolia (Testnet)';
  const explorerBase = claim?.network === 'base-mainnet' ? 'https://basescan.org' : 'https://sepolia.basescan.org';
  const isExpired = claim?.expired || (claim && Date.now() / 1000 >= claim.expires_at);
  const isClaimed = claim?.status === 'claimed';
  const isPending = claim?.status === 'pending' && !isExpired;

  const expiryDate = claim ? new Date(claim.expires_at * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Minimal header — this is a standalone flow, so no full nav */}
      <header className="border-b border-line">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <Logo />
          <a href="/dashboard" className="btn btn-ghost h-9 px-3 text-sm">Open Dashboard</a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <div className="card">
            {loading ? (
              <div className="py-8 space-y-3" aria-busy="true">
                <div className="skeleton mx-auto h-14 w-14 rounded-2xl" />
                <div className="skeleton mx-auto h-4 w-1/2" />
                <div className="skeleton mx-auto h-10 w-2/3" />
                <p className="pt-2 text-center text-sm text-fg-muted">Loading claim...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <StatusGlyph tone="danger" icon={Icon.Warning} />
                <p className="text-danger break-words">{error}</p>
              </div>
            ) : claim && claimResult ? (
              /* ── Success ── */
              <div className="text-center py-4">
                <StatusGlyph tone="success" icon={Icon.Check} />
                <h2 className="text-h3 font-semibold text-success mb-2">USDC Claimed!</h2>
                <p className="text-fg-muted mb-1">
                  <span className="text-fg font-semibold font-mono text-2xl">${claim.amount_usdc.toFixed(2)}</span> USDC
                </p>
                <p className="text-fg-subtle text-sm mb-4 break-all">
                  From {claim.sender} → {formatHandle(claimResult.handle || claimResult.claimer)}
                </p>
                {claimResult.new_account && (
                  <div className="card-inset mb-4 text-left text-sm">
                    <p className="flex items-center gap-2 font-medium text-fg">
                      <Icon.Spark size={16} className="text-[#7da2ff]" /> Welcome to BaseMail!
                    </p>
                    <p className="mt-1 text-xs text-fg-muted break-all">
                      A new account was created for you: <span className="font-mono text-fg">{formatHandle(claimResult.handle)}@basemail.ai</span>
                    </p>
                  </div>
                )}
                {claimResult.release_tx && (
                  <a href={`${explorerBase}/tx/${claimResult.release_tx}`}
                    target="_blank" rel="noopener noreferrer"
                    className="link mb-4 inline-flex items-center gap-1 text-xs">
                    View transaction on BaseScan <Icon.ExternalLink size={12} />
                  </a>
                )}
                <p className="text-fg-subtle text-xs mb-4">
                  A receipt email has been delivered to your BaseMail inbox.
                </p>
                <button type="button" onClick={() => navigate('/dashboard')} className="btn btn-primary btn-lg w-full">
                  Open Dashboard
                </button>
              </div>
            ) : claim ? (
              /* ── Claim Card ── */
              <>
                <div className="text-center mb-6">
                  <StatusGlyph tone="accent" icon={Icon.Credits} />
                  <p className="text-fg-muted text-sm break-all">
                    <span className="text-fg font-medium">{claim.sender}</span> sent you
                  </p>
                  <p className="mt-2 text-h1 font-semibold font-mono tracking-tight text-fg">
                    ${claim.amount_usdc.toFixed(2)} <span className="font-sans text-lg font-medium text-fg-muted">USDC</span>
                  </p>
                  <p className="text-fg-subtle text-xs mt-2 break-all">
                    To: {claim.recipient_email} · {networkLabel}
                  </p>
                </div>

                {isClaimed && (
                  <div className="card-inset border-success/30 text-center mb-4">
                    <span className="inline-flex items-center gap-1.5 font-medium text-success">
                      <Icon.Check size={16} /> Already claimed
                    </span>
                  </div>
                )}
                {isExpired && !isClaimed && (
                  <div className="card-inset border-danger/30 text-center mb-4">
                    <span className="inline-flex items-center gap-1.5 font-medium text-danger">
                      <Icon.Warning size={16} className="shrink-0" /> Expired — USDC can be refunded to sender
                    </span>
                  </div>
                )}

                {isPending && (
                  <>
                    <div className="card-inset mb-4 space-y-1 text-xs text-fg-subtle">
                      <p>Expires: <span className="text-fg-muted">{expiryDate}</span></p>
                      <p>Claimed USDC will appear as a receipt email in your BaseMail inbox.</p>
                    </div>

                    {!isConnected ? (
                      /* Connect wallet */
                      <div className="space-y-2">
                        {connectors.map((connector) => (
                          <button key={connector.id} type="button"
                            onClick={() => connect({ connector })}
                            className="btn btn-primary btn-lg w-full">
                            <Icon.Wallet size={18} /> Connect {connector.name}
                          </button>
                        ))}
                      </div>
                    ) : status ? (
                      /* Processing */
                      <div className="flex items-center justify-center gap-2 py-4 text-fg-muted">
                        <Icon.Refresh size={16} className="animate-spin" /> {status}
                      </div>
                    ) : (
                      /* One button does everything: auth + claim */
                      <button type="button" onClick={handleAuthAndClaim}
                        className="btn btn-primary btn-lg w-full">
                        <Icon.Check size={18} /> Claim ${claim.amount_usdc.toFixed(2)} USDC
                      </button>
                    )}

                    {statusError && <p className="mt-3 text-sm text-danger break-words">{statusError}</p>}
                  </>
                )}
              </>
            ) : null}
          </div>

          <p className="mt-4 text-center text-xs text-fg-subtle">
            Powered by <a href="https://basemail.ai" className="link">BaseMail.ai</a> — Email for AI agents on Base
          </p>
        </div>
      </main>
    </div>
  );
}
