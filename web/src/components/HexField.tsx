import { useEffect, useRef } from 'react';

/**
 * HexField — a quiet, on-theme background for the hero.
 *
 * A grid of monospace glyphs (hex digits, '@', '·') drifts like packets moving
 * through a mail network. Brightness ripples outward from the pointer and from a
 * slow-moving "carrier" so the field feels alive without competing with copy.
 *
 * Performance / SEO guarantees:
 * - Pure canvas, zero dependencies, ~3 KB. Not part of the SSR output (an empty
 *   <canvas aria-hidden>), so crawlers and no-JS users see nothing different.
 * - Runs only while on screen and the tab is visible; capped at 30 fps.
 * - Honours `prefers-reduced-motion` by rendering a single static frame.
 */
export default function HexField({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const GLYPHS = '0123456789abcdef';
    let CELL = 18;             // px per glyph cell (grows on very wide screens)
    const FONT = '11px "JetBrains Mono", ui-monospace, monospace';
    const MAX_PIXELS = 2.5e6;  // backing-store budget (~10 MB RGBA)

    let w = 0, h = 0, cols = 0, rows = 0, dpr = 1, maxRow = 0;
    let rect = { left: 0, top: 0 };
    let cells: { g: string; phase: number; speed: number }[] = [];
    let raf = 0;
    let last = 0;
    let running = false;
    let visible = true;
    const pointer = { x: -9999, y: -9999, active: false };
    const t0 = performance.now();

    function resize() {
      const r = canvas!.getBoundingClientRect();
      rect = { left: r.left, top: r.top };
      w = r.width; h = r.height;
      CELL = w > 1600 ? 24 : 18;
      // Cap DPR so the backing store never exceeds the pixel budget (4K/DPR2 hero would be ~15 MP).
      dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(MAX_PIXELS / Math.max(1, w * h)));
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const nc = Math.ceil(w / CELL) + 1, nr = Math.ceil(h / CELL) + 1;
      if (nc !== cols || nr !== rows) {
        cols = nc; rows = nr;
        cells = Array.from({ length: cols * rows }, () => ({
          g: Math.random() < 0.06 ? '@' : Math.random() < 0.5 ? '·' : GLYPHS[(Math.random() * 16) | 0],
          phase: Math.random() * Math.PI * 2,
          speed: 0.2 + Math.random() * 0.6,
        }));
      }
      // Rows below ~80% height are invisible after the vignette; never iterate them.
      maxRow = Math.min(rows, Math.ceil((rows * 0.82)));
      ctx!.font = FONT;
      ctx!.textBaseline = 'middle';
      ctx!.textAlign = 'center';
    }

    function frame(now: number) {
      raf = 0;
      if (!running) return;
      if (now - last < 33) { raf = requestAnimationFrame(frame); return; }
      last = now;
      draw(now);
      if (!reduced) raf = requestAnimationFrame(frame);
    }

    function draw(now: number) {
      const t = (now - t0) / 1000;
      ctx!.clearRect(0, 0, w, h);
      // Slow carrier that sweeps across the field.
      const cx = ((t * 40) % (w + 400)) - 200;
      const cy = h * 0.5 + Math.sin(t * 0.6) * h * 0.25;
      for (let r = 0; r < maxRow; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r * cols + c];
          const x = c * CELL + CELL / 2;
          const y = r * CELL + CELL / 2;
          // Base twinkle
          let a = 0.03 + 0.04 * (0.5 + 0.5 * Math.sin(t * cell.speed + cell.phase));
          // Carrier glow
          const dc = Math.hypot(x - cx, y - cy);
          if (dc < 220) a += 0.28 * (1 - dc / 220) ** 2;
          // Pointer glow
          if (pointer.active) {
            const dp = Math.hypot(x - pointer.x, y - pointer.y);
            if (dp < 160) a += 0.5 * (1 - dp / 160) ** 2;
          }
          // Vertical vignette so the field fades into the page.
          a *= 1 - Math.min(1, (y / h) ** 1.5);
          if (a < 0.02) continue;
          // Occasionally mutate glyphs so the field feels like moving data.
          if (a > 0.3 && Math.random() < 0.02) cell.g = GLYPHS[(Math.random() * 16) | 0];
          const blue = a > 0.25;
          ctx!.fillStyle = blue ? `rgba(125,162,255,${Math.min(a, 0.8)})` : `rgba(242,243,245,${Math.min(a, 0.22)})`;
          ctx!.fillText(cell.g, x, y);
        }
      }
    }

    function start() {
      if (running || !visible) return;
      running = true;
      last = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onScroll = () => { const r = canvas!.getBoundingClientRect(); rect = { left: r.left, top: r.top }; };
    const onLeave = () => { pointer.active = false; };
    const onVis = () => { document.hidden ? stop() : start(); };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visible ? start() : stop();
    }, { threshold: 0.05 });

    const ro = new ResizeObserver(() => { resize(); if (reduced) draw(performance.now()); });
    const host = canvas.parentElement || canvas;

    ro.observe(canvas); // fires once immediately → initial resize()
    if (reduced) {
      // Static frame only: no animation, no pointer-following glow.
      resize();
      draw(performance.now());
      return () => ro.disconnect();
    }
    io.observe(canvas);
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVis);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 w-full h-full ${className}`}
    />
  );
}
