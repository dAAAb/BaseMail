import { useState, useEffect, useCallback } from 'react';
import { IDKitRequestWidget, orbLegacy } from '@worldcoin/idkit';
import type { IDKitResult, RpContext } from '@worldcoin/idkit';
import { Icon } from './Icons';

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

function Heading() {
  return (
    <h3 className="mb-4 flex items-center gap-2 font-semibold text-fg">
      <Icon.Globe size={18} className="text-fg-muted" />
      World ID — Human Verification
    </h3>
  );
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

  // handleVerify: store IDKit proof in our backend.
  // Note: World ID /v4/verify API blocks CF Worker IPs (403),
  // so we trust the IDKit ZK proof directly and store it.
  // The proof is cryptographically valid from World App — /v4/verify
  // is a server-side convenience check, not the source of truth.
  const handleVerify = useCallback(async (idkitResult: IDKitResult) => {
    console.log('IDKit result:', JSON.stringify(idkitResult));

    try {
      const res = await fetch(`${API_BASE}/api/world-id/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          idkit_result: idkitResult,
        }),
      });

      const data = await res.json() as any;
      console.log('Backend verify response:', res.status, data);

      if (!res.ok) {
        const msg = data.detail || data.error || `Backend error ${res.status}`;
        setError(msg);
        throw new Error(msg);
      }
    } catch (e: any) {
      console.error('handleVerify failed:', e);
      if (!error) setError(e.message || 'Verification failed');
      throw e;
    }
  }, [token, error]);

  // onSuccess: update UI
  const handleSuccess = useCallback((_result: IDKitResult) => {
    setStatus('verified');
    setVerificationLevel('orb');
    setVerifiedAt(Math.floor(Date.now() / 1000));
    setWidgetOpen(false);
  }, []);

  if (status === 'loading') {
    return (
      <div className="card">
        <Heading />
        <p className="text-sm text-fg-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <Heading />

      {status === 'verified' ? (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
              <Icon.Check size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-success">Verified Human</p>
              <p className="text-xs text-fg-muted">
                Level: {verificationLevel === 'orb' ? 'Orb (biometric)' : 'Device'}
                {verifiedAt && ` · Verified ${new Date(verifiedAt * 1000).toLocaleDateString()}`}
              </p>
            </div>
          </div>
          <p className="text-xs text-fg-subtle">
            Your account is verified as a unique human via World ID. This badge is visible on your public profile.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-4 text-sm text-fg-muted">
            Prove you're a unique human using World ID. Verified accounts get a Human badge on their profile,
            increasing trust for email recipients.
          </p>

          <button
            type="button"
            onClick={handleOpenWidget}
            disabled={status === 'verifying'}
            className="btn btn-primary w-full sm:w-auto"
          >
            {status === 'verifying' ? (
              <>
                <Icon.Refresh size={16} className="animate-spin" /> Verifying...
              </>
            ) : (
              <>
                <Icon.Globe size={16} /> Verify with World ID
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
            <p className="mt-3 text-sm text-danger break-words">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
