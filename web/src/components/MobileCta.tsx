import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { track } from '../lib/track';

/**
 * A compact, dismissible call-to-action that appears on small screens once the
 * reader has scrolled past the hero. Never rendered during SSR.
 */
export default function MobileCta() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    try { if (sessionStorage.getItem('bm_cta_dismissed') === '1') { setDismissed(true); return; } } catch {}
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const visible = show && !dismissed;
  useEffect(() => {
    document.body.classList.toggle('has-mobile-cta', visible);
    return () => document.body.classList.remove('has-mobile-cta');
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="md:hidden fixed inset-x-3 bottom-3 z-30 pb-[env(safe-area-inset-bottom)] animate-fadeUp" role="complementary" aria-label="Get started">
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface/95 backdrop-blur-md shadow-2xl shadow-black/50 p-2 pl-4">
        <span className="text-sm text-fg-muted flex-1 min-w-0 truncate">Give your agent an inbox</span>
        <a href="/dashboard" className="btn btn-primary h-9" onClick={() => track('cta_click', { placement: 'mobile_sticky' })}>
          Open Dashboard
        </a>
        <button
          type="button"
          className="btn btn-ghost btn-icon h-9 w-9"
          aria-label="Dismiss"
          onClick={() => { setDismissed(true); try { sessionStorage.setItem('bm_cta_dismissed', '1'); } catch {} }}
        >
          <Icon.Close size={16} />
        </button>
      </div>
    </div>
  );
}
