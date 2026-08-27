import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Reveal — fades/raises children into view when they enter the viewport.
 *
 * SSR-safe by construction: the prerendered HTML carries no hiding class, so
 * crawlers and no-JS readers always get fully visible content. The hiding class
 * is applied in a layout effect (before first paint after hydration), and only
 * for elements that are still below the fold, so there is no flash.
 */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function Reveal({ children, className = '', as: Tag = 'div', delay = 0 }: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) return; // already visible — never hide
    el.classList.add('reveal-init');
    el.style.transitionDelay = `${delay}ms`;
    const show = () => { el.classList.add('reveal-in'); io.disconnect(); clearTimeout(timer); };
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) show(); }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    // Safety net: never leave content hidden (headless renderers, print, IO quirks).
    const timer = window.setTimeout(show, 2500);
    window.addEventListener('beforeprint', show, { once: true });
    return () => { io.disconnect(); clearTimeout(timer); window.removeEventListener('beforeprint', show); };
  }, [delay]);

  const T = Tag as any;
  return <T ref={ref} className={className}>{children}</T>;
}
