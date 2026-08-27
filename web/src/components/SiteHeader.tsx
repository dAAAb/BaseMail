import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

const NAV = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#attn', label: '$ATTN' },
  { href: '/developers', label: 'Developers' },
  { href: '/blog/', label: 'Blog' },
  { href: '/about', label: 'About' },
];

export function Logo({ className = '' }: { className?: string }) {
  return (
    <a href="/" className={`inline-flex items-center gap-2 text-fg font-semibold tracking-tight ${className}`} aria-label="BaseMail home">
      <Icon.Logo size={26} />
      <span>BaseMail</span>
    </a>
  );
}

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      // Keep Tab inside the drawer while it is open.
      if (e.key === 'Tab' && navRef.current) {
        const items = navRef.current.querySelectorAll<HTMLElement>('a, button');
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    navRef.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      toggleRef.current?.focus();
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 btn btn-primary">Skip to content</a>
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="btn btn-ghost h-9 px-3 text-sm">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href="/dashboard" className="btn btn-primary h-9 hidden sm:inline-flex">
            Open Dashboard
          </a>
          <button
            type="button"
            ref={toggleRef}
            className="btn btn-ghost btn-icon md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <Icon.Close /> : <Icon.Menu />}
          </button>
        </div>
      </div>

      {/* Mobile drawer (kept mounted so aria-controls always resolves) */}
      <div className="md:hidden" hidden={!open}>
        {open && <div className="fixed inset-0 top-16 z-30 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />}
        <nav
          id="mobile-nav"
          ref={navRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          hidden={!open}
          className="fixed inset-x-0 top-16 z-40 border-b border-line bg-bg p-4 animate-fadeUp"
        >
            <div className="flex flex-col gap-1">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="btn btn-ghost justify-start h-11 text-base" onClick={() => setOpen(false)}>
                  {n.label}
                </a>
              ))}
              <a href="/dashboard" className="btn btn-primary btn-lg mt-2">
                Open Dashboard
              </a>
            </div>
        </nav>
      </div>
    </header>
  );
}
