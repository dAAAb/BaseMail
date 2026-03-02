import { useState, useEffect, useCallback } from 'react';

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? '' : 'https://api.basemail.ai';
const WORLD_ID_APP_ID = 'app_7099aeba034f8327d91420254b4b660e';
const WORLD_ID_ACTION = 'verify-human';

interface Props {
  token: string;
  handle: string;
  wallet: string;
}

// Dynamically load IDKit
let idkitLoaded = false;
function loadIDKit(): Promise<any> {
  if (idkitLoaded && (window as any).IDKit) return Promise.resolve((window as any).IDKit);
  return new Promise((resolve, reject) => {
    // Use the CDN-based approach via dynamic import
    // For now we'll use the REST/redirect approach as fallback
    resolve(null);
  });
}

export default function WorldIdVerify({ token, handle, wallet }: Props) {
  const [status, setStatus] = useState<'loading' | 'unverified' | 'verified' | 'verifying' | 'error'>('loading');
  const [verificationLevel, setVerificationLevel] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Check current status
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

  const handleVerify = useCallback(async () => {
    setStatus('verifying');
    setError('');

    try {
      // Use World ID's hosted verification page (World App bridge)
      // This works without npm package — redirect flow
      const callbackUrl = `${window.location.origin}/dashboard/settings`;

      // Build the World ID verification URL
      const params = new URLSearchParams({
        app_id: WORLD_ID_APP_ID,
        action: WORLD_ID_ACTION,
        signal: wallet,
        credential_types: 'orb,device',
        return_to: callbackUrl,
      });

      // For web, we use the miniapp-based bridge URL
      // Or we can use the IDKit JS SDK via script tag
      const scriptUrl = 'https://cdn.worldcoin.org/idkit/v1/idkit.js';

      // Load IDKit script if not loaded
      if (!document.querySelector(`script[src="${scriptUrl}"]`)) {
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load IDKit'));
          document.head.appendChild(script);
        });
      }

      // Wait for IDKit to be available
      await new Promise<void>((resolve) => {
        const check = () => {
          if ((window as any).IDKit) resolve();
          else setTimeout(check, 100);
        };
        check();
      });

      const IDKit = (window as any).IDKit;
      IDKit.init({
        app_id: WORLD_ID_APP_ID,
        action: WORLD_ID_ACTION,
        signal: wallet,
        enableTelemetry: false,
        onSuccess: async (result: any) => {
          // Send proof to our backend
          try {
            const res = await fetch(`${API_BASE}/api/world-id/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                merkle_root: result.merkle_root,
                nullifier_hash: result.nullifier_hash,
                proof: result.proof,
                verification_level: result.verification_level || 'orb',
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
        },
        onError: (err: any) => {
          setError(err?.message || 'World ID verification cancelled');
          setStatus('unverified');
        },
      });

      IDKit.open();
    } catch (e: any) {
      // Fallback: use @worldcoin/idkit React component approach
      // For now, show manual instructions
      setError('IDKit failed to load. Please try again or use World App directly.');
      setStatus('unverified');
    }
  }, [token, wallet]);

  // Handle URL callback from World ID redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const proof = params.get('proof');
    const merkle_root = params.get('merkle_root');
    const nullifier_hash = params.get('nullifier_hash');
    if (proof && merkle_root && nullifier_hash) {
      // Auto-verify from redirect
      setStatus('verifying');
      fetch(`${API_BASE}/api/world-id/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          merkle_root,
          nullifier_hash,
          proof,
          verification_level: params.get('verification_level') || 'orb',
          signal: wallet,
        }),
      })
        .then(r => r.json())
        .then((data: any) => {
          if (data.ok || data.is_human) {
            setStatus('verified');
            setVerificationLevel(data.verification_level || 'orb');
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
          } else {
            setError(data.error || 'Verification failed');
            setStatus('unverified');
          }
        })
        .catch(() => {
          setError('Verification failed');
          setStatus('unverified');
        });
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
            onClick={handleVerify}
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
          {error && (
            <p className="text-red-400 text-sm mt-3">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
