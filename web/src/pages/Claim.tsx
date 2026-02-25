import { useState, useEffect } from 'react';
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

  // Auth + claim state
  const [token, setToken] = useState('');
  const [handle, setHandle] = useState('');
  const [step, setStep] = useState<'idle' | 'checking' | 'need-register' | 'ready' | 'claiming' | 'success'>('idle');
  const [regHandle, setRegHandle] = useState('');
  const [regError, setRegError] = useState('');
  const [claimResult, setClaimResult] = useState<any>(null);
  const [claimError, setClaimError] = useState('');

  // Fetch claim info
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/api/claim/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setClaim(data);
      })
      .catch(() => setError('Failed to load claim'))
      .finally(() => setLoading(false));
  }, [id]);

  // When wallet connects → auto authenticate
  useEffect(() => {
    if (!address || token) return;
    autoAuth(address);
  }, [address]);

  async function autoAuth(wallet: string) {
    setStep('checking');
    setClaimError('');
    try {
      // 1. Check if registered
      const checkRes = await fetch(`${API_BASE}/api/register/check/${wallet}`);
      const checkData = await checkRes.json();

      if (!checkData.registered || !checkData.handle) {
        setStep('need-register');
        return;
      }

      // 2. SIWE auth
      setHandle(checkData.handle);
      const startRes = await fetch(`${API_BASE}/api/auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet }),
      });
      const { nonce, message } = await startRes.json();
      let signature: string;
      try {
        signature = await signMessageAsync({ message });
      } catch {
        throw new Error('Wallet signature failed — tap the button below to retry');
      }

      const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet, signature, nonce, message }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.token) {
        setToken(verifyData.token);
        if (verifyData.handle) setHandle(verifyData.handle);
        setStep('ready');
      } else {
        throw new Error(verifyData.error || 'Auth failed');
      }
    } catch (e: any) {
      setClaimError(e.message || 'Authentication failed');
      setStep('idle');
    }
  }

  async function handleRegister() {
    if (!address || !regHandle) return;
    setRegError('');
    try {
      // SIWE + register in one flow
      const startRes = await fetch(`${API_BASE}/api/auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const { nonce, message } = await startRes.json();
      const signature = await signMessageAsync({ message });

      const regRes = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, handle: regHandle, signature, nonce }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error || 'Registration failed');

      setToken(regData.token);
      setHandle(regData.handle || regHandle);
      setStep('ready');
    } catch (e: any) {
      setRegError(e.message);
    }
  }

  async function handleClaim() {
    if (!token || !id) return;
    setStep('claiming');
    setClaimError('');
    try {
      const res = await fetch(`${API_BASE}/api/claim/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Claim failed');
      setClaimResult(data);
      setStep('success');
    } catch (e: any) {
      setClaimError(e.message);
      setStep('ready');
    }
  }

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
        {/* Logo */}
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
          ) : claim && step === 'success' && claimResult ? (
            /* ── Success ── */
            <div className="text-center py-6">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-green-400 mb-2">USDC Claimed!</h2>
              <p className="text-gray-400 mb-1">
                <span className="text-white font-bold text-2xl">${claim.amount_usdc.toFixed(2)}</span> USDC
              </p>
              <p className="text-gray-500 text-sm mb-4">
                From {claim.sender} → {claimResult.claimer}
              </p>
              {claimResult.release_tx && (
                <a
                  href={`${explorerBase}/tx/${claimResult.release_tx}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 text-xs underline block mb-4"
                >
                  View transaction on BaseScan ↗
                </a>
              )}
              <p className="text-gray-500 text-xs mb-4">
                A receipt email has been delivered to your BaseMail inbox.
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-500 transition"
              >
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

                  {/* Step 1: Connect wallet */}
                  {!isConnected ? (
                    <div className="space-y-2">
                      {connectors.map((connector) => (
                        <button
                          key={connector.id}
                          onClick={() => connect({ connector })}
                          className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-500 transition"
                        >
                          🔗 Connect {connector.name}
                        </button>
                      ))}
                    </div>
                  ) : step === 'checking' ? (
                    <div className="text-center text-gray-400 py-4 animate-pulse">
                      Checking account...
                    </div>
                  ) : step === 'need-register' ? (
                    /* Register new account */
                    <div>
                      <p className="text-gray-400 text-sm mb-3">
                        Create a free BaseMail account to claim your USDC:
                      </p>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={regHandle}
                          onChange={(e) => setRegHandle(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                          placeholder="choose a handle"
                          className="flex-1 bg-[#0a0a0f] border border-gray-700 rounded-lg px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-purple-500"
                        />
                        <span className="text-gray-500 text-sm self-center">@basemail.ai</span>
                      </div>
                      {regError && <p className="text-red-400 text-xs mb-2">{regError}</p>}
                      <button
                        onClick={handleRegister}
                        disabled={!regHandle || regHandle.length < 3}
                        className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-500 transition disabled:opacity-50"
                      >
                        Create Account & Claim
                      </button>
                    </div>
                  ) : step === 'ready' ? (
                    /* Authenticated — claim button */
                    <div>
                      <p className="text-gray-400 text-sm mb-3">
                        Claiming as <span className="text-white font-mono">{handle}@basemail.ai</span>
                      </p>
                      <button
                        onClick={handleClaim}
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-500 transition"
                      >
                        ✅ Claim ${claim.amount_usdc.toFixed(2)} USDC
                      </button>
                    </div>
                  ) : step === 'claiming' ? (
                    <div className="text-center text-gray-400 py-4 animate-pulse">
                      Claiming USDC...
                    </div>
                  ) : (
                    /* idle — retry auth */
                    <div>
                      <button
                        onClick={() => address && autoAuth(address)}
                        className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-500 transition"
                      >
                        ✍️ Authenticate & Claim
                      </button>
                    </div>
                  )}

                  {claimError && <p className="text-red-400 text-sm mt-3">{claimError}</p>}
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
