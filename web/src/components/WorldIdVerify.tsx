import { useState, useEffect, useCallback } from 'react';
import { IDKitRequestWidget, useIDKitRequest, orbLegacy } from '@worldcoin/idkit';
import type { IDKitResult } from '@worldcoin/idkit';

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? '' : 'https://api.basemail.ai';
const WORLD_ID_APP_ID = 'app_7099aeba034f8327d91420254b4b660e';
const WORLD_ID_ACTION = 'verify-human';

interface Props {
  token: string;
  handle: string;
  wallet: string;
}

export default function WorldIdVerify({ token, handle, wallet }: Props) {
  const [status, setStatus] = useState<'loading' | 'unverified' | 'verified' | 'verifying' | 'error'>('loading');
  const [verificationLevel, setVerificationLevel] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [widgetOpen, setWidgetOpen] = useState(false);

  // Check current status on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/world-id/status/${handle}`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.is_human) {
          setStatus('verified');
          setVerificationLevel(data.verification_level);
          setVerifiedAt(data.verified_at);
        } else {
          setStatus('unverified');
        }
      })
      .catch(() => setStatus('unverified'));
  }, [handle]);

  const handleSuccess = useCallback(async (result: IDKitResult) => {
    setStatus('verifying');
    setError('');

    try {
      // Extract v3 legacy proof fields from result
      const v3 = result.responses?.find((r: any) => r.version === 'v3' || r.merkle_root);
      const merkle_root = v3?.merkle_root || (result as any).merkle_root;
      const nullifier_hash = v3?.nullifier_hash || (result as any).nullifier_hash;
      const proof = v3?.proof || (result as any).proof;

      if (!merkle_root || !nullifier_hash || !proof) {
        setError('No valid proof in response');
        setStatus('unverified');
        return;
      }

      const res = await fetch(`${API_BASE}/api/world-id/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          merkle_root,
          nullifier_hash,
          proof,
          verification_level: v3?.verification_level || 'orb',
          signal: wallet,
        }),
      });
      const data = await res.json() as any;
      if (data.ok || data.is_human) {
        setStatus('verified');
        setVerificationLevel(data.verification_level || 'orb');
        setVerifiedAt(Math.floor(Date.now() / 1000));
      } else {
        setError(data.error || 'Verification failed');
        setStatus('unverified');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
      setStatus('unverified');
    }
  }, [token, wallet]);

  if (status === 'loading') {
    return (
      <div className="bg-base-gray rounded-xl p-6 border border-gray-800">
        <h3 className="font-bold mb-4">🌍 World ID — Human Verification</h3>
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-base-gray rounded-xl p-6 border border-gray-800">
      <h3 className="font-bold mb-4">🌍 World ID — Human Verification</h3>

      {status === 'verified' ? (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="text-green-400 font-bold">Verified Human</p>
              <p className="text-gray-400 text-xs">
                Level: {verificationLevel === 'orb' ? '🔮 Orb (biometric)' : '📱 Device'}
                {verifiedAt && ` · Verified ${new Date(verifiedAt * 1000).toLocaleDateString()}`}
              </p>
            </div>
          </div>
          <p className="text-gray-500 text-xs">
            Your account is verified as a unique human via World ID. This badge is visible on your public profile.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-gray-400 text-sm mb-4">
            Prove you're a unique human using World ID. Verified accounts get a ✅ badge on their profile,
            increasing trust for email recipients.
          </p>

          <button
            onClick={() => setWidgetOpen(true)}
            disabled={status === 'verifying'}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold hover:from-purple-500 hover:to-blue-500 transition disabled:opacity-50 flex items-center gap-2"
          >
            {status === 'verifying' ? (
              <>
                <span className="animate-spin">⏳</span> Verifying...
              </>
            ) : (
              <>
                🌍 Verify with World ID
              </>
            )}
          </button>

          <IDKitRequestWidget
            app_id={WORLD_ID_APP_ID as `app_${string}`}
            action={WORLD_ID_ACTION}
            preset={orbLegacy({ signal: wallet })}
            open={widgetOpen}
            onOpenChange={setWidgetOpen}
            onSuccess={handleSuccess}
            onError={(err) => {
              setError(`Verification error: ${err}`);
              setStatus('unverified');
            }}
          />

          {error && (
            <p className="text-red-400 text-sm mt-3">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
