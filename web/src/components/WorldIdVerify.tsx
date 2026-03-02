import { useState, useEffect, useCallback } from 'react';
import { IDKitRequestWidget, orbLegacy } from '@worldcoin/idkit';
import type { IDKitResult, RpContext } from '@worldcoin/idkit';

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? '' : 'https://api.basemail.ai';
const WORLD_ID_APP_ID = 'app_7099aeba034f8327d91420254b4b660e';
const WORLD_ID_ACTION = 'verify-human';
const WORLD_ID_RP_ID = 'rp_2b23fabfd8dffcaf';

// World ID verify API (called from browser, not CF Worker — CF Workers are IP-blocked)
const WORLD_ID_VERIFY_URL = `https://developer.worldcoin.org/api/v4/verify/${WORLD_ID_RP_ID}`;

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
  const [rpContext, setRpContext] = useState<RpContext | null>(null);

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

  // Fetch RP signature before opening widget
  const handleOpenWidget = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/world-id/rp-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json() as any;
        setError(data.error || 'Failed to get RP signature');
        return;
      }
      const rpSig = await res.json() as { sig: string; nonce: string; created_at: number; expires_at: number };
      setRpContext({
        rp_id: WORLD_ID_RP_ID,
        nonce: rpSig.nonce,
        created_at: rpSig.created_at,
        expires_at: rpSig.expires_at,
        signature: rpSig.sig,
      });
      setWidgetOpen(true);
    } catch (e: any) {
      setError(e.message || 'Network error');
    }
  }, [token]);

  // handleVerify: verify proof with World ID API directly from browser,
  // then store result in our backend
  const handleVerify = useCallback(async (idkitResult: IDKitResult) => {
    console.log('IDKit result:', JSON.stringify(idkitResult));

    // Step 1: Verify with World ID API (from browser — CF Workers are IP-blocked)
    const verifyRes = await fetch(WORLD_ID_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idkitResult),
    });

    const verifyData = await verifyRes.json() as any;
    console.log('World ID verify response:', verifyRes.status, verifyData);

    if (!verifyRes.ok || !verifyData.success) {
      throw new Error(verifyData.detail || verifyData.code || 'World ID verification failed');
    }

    // Step 2: Store in our backend
    const storeRes = await fetch(`${API_BASE}/api/world-id/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        idkit_result: idkitResult,
        verify_result: verifyData,
      }),
    });

    const storeData = await storeRes.json() as any;
    if (!storeRes.ok) {
      throw new Error(storeData.error || 'Failed to store verification');
    }
  }, [token]);

  // onSuccess: update UI
  const handleSuccess = useCallback((_result: IDKitResult) => {
    setStatus('verified');
    setVerificationLevel('orb');
    setVerifiedAt(Math.floor(Date.now() / 1000));
    setWidgetOpen(false);
  }, []);

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
            onClick={handleOpenWidget}
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

          {rpContext && (
            <IDKitRequestWidget
              app_id={WORLD_ID_APP_ID as `app_${string}`}
              action={WORLD_ID_ACTION}
              rp_context={rpContext}
              allow_legacy_proofs={true}
              preset={orbLegacy({ signal: wallet })}
              open={widgetOpen}
              onOpenChange={setWidgetOpen}
              handleVerify={handleVerify}
              onSuccess={handleSuccess}
              onError={(err) => {
                setError(`Verification error: ${err}`);
                setWidgetOpen(false);
              }}
            />
          )}

          {error && (
            <p className="text-red-400 text-sm mt-3">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
