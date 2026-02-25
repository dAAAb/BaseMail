import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useSignMessage } from 'wagmi';

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
      // 1. Check registration
      setStatus('Checking account...');
      const checkRes = await fetch(`${API_BASE}/api/register/check/${address}`);
      const checkData = await checkRes.json();

      if (!checkData.registered) {
        setStatus('');
        setStatusError('No BaseMail account found. Please register at basemail.ai first, then come back to claim.');
        return;
      }

      // 2. SIWE auth
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

      // 3. Claim
      setStatus('Claiming USDC...');
      const claimRes = await fetch(`${API_BASE}/api/claim/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${verifyData.token}` },
      });
      const claimData = await claimRes.json();
      if (!claimRes.ok) throw new Error(claimData.error || 'Claim failed');

      setClaimResult({ ...claimData, handle: verifyData.handle || checkData.handle });
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
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <a href="/" className="text-2xl font-bold text-white">
            <span className="text-purple-400">Base</span>Mail
          </a>
        </div>

        <div className="bg-[#14141f] rounded-2xl border border-gray-800 p-6">
          {loading ? (
            <div className="text-center text-gray-400 py-12 animate-pulse">Loading claim...</div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">❌</div>
              <p className="text-red-400">{error}</p>
            </div>
          ) : claim && claimResult ? (
            /* ── Success ── */
            <div className="text-center py-6">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-green-400 mb-2">USDC Claimed!</h2>
              <p className="text-gray-400 mb-1">
                <span className="text-white font-bold text-2xl">${claim.amount_usdc.toFixed(2)}</span> USDC
              </p>
              <p className="text-gray-500 text-sm mb-4">
                From {claim.sender} → {claimResult.handle || claimResult.claimer}
              </p>
              {claimResult.release_tx && (
                <a href={`${explorerBase}/tx/${claimResult.release_tx}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 text-xs underline block mb-4">
                  View transaction on BaseScan ↗
                </a>
              )}
              <p className="text-gray-500 text-xs mb-4">
                A receipt email has been delivered to your BaseMail inbox.
              </p>
              <button onClick={() => navigate('/dashboard')}
                className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-500 transition">
                Open Dashboard
              </button>
            </div>
          ) : claim ? (
            /* ── Claim Card ── */
            <>
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">💸</div>
                <p className="text-gray-400 text-sm">
                  <span className="text-white font-medium">{claim.sender}</span> sent you
                </p>
                <p className="text-4xl font-bold text-white mt-2">
                  ${claim.amount_usdc.toFixed(2)} <span className="text-lg text-gray-400">USDC</span>
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  To: {claim.recipient_email} · {networkLabel}
                </p>
              </div>

              {isClaimed && (
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 text-center mb-4">
                  <span className="text-green-400 font-medium">Already claimed ✅</span>
                </div>
              )}
              {isExpired && !isClaimed && (
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-center mb-4">
                  <span className="text-red-400 font-medium">Expired — USDC can be refunded to sender</span>
                </div>
              )}

              {isPending && (
                <>
                  <div className="bg-[#0a0a0f] rounded-lg p-3 mb-4 text-xs text-gray-500 space-y-1">
                    <p>Expires: <span className="text-gray-300">{expiryDate}</span></p>
                    <p>Claimed USDC will appear as a receipt email in your BaseMail inbox.</p>
                  </div>

                  {!isConnected ? (
                    /* Connect wallet */
                    <div className="space-y-2">
                      {connectors.map((connector) => (
                        <button key={connector.id}
                          onClick={() => connect({ connector })}
                          className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-500 transition">
                          🔗 Connect {connector.name}
                        </button>
                      ))}
                    </div>
                  ) : status ? (
                    /* Processing */
                    <div className="text-center text-gray-400 py-4 animate-pulse">{status}</div>
                  ) : (
                    /* One button does everything: auth + claim */
                    <button onClick={handleAuthAndClaim}
                      className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-500 transition">
                      ✅ Claim ${claim.amount_usdc.toFixed(2)} USDC
                    </button>
                  )}

                  {statusError && <p className="text-red-400 text-sm mt-3">{statusError}</p>}
                </>
              )}
            </>
          ) : null}
        </div>

        <p className="text-center text-gray-600 text-xs mt-4">
          Powered by <a href="https://basemail.ai" className="text-purple-400 hover:text-purple-300">BaseMail.ai</a> — Æmail for AI Agents on Base
        </p>
      </div>
    </div>
  );
}
