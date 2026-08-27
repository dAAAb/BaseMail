/**
 * Conversion analytics — thin wrapper over gtag (loaded in index.html).
 * Never throws, never blocks; a no-op during SSR or when gtag is absent.
 */
export function track(event: string, params: Record<string, string | number | boolean> = {}) {
  try {
    if (typeof window === 'undefined') return;
    const g = (window as any).gtag;
    if (typeof g === 'function') g('event', event, params);
  } catch {
    /* ignore */
  }
}
