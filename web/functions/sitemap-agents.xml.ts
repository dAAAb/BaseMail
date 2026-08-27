/**
 * Dynamic sitemap of public agent profiles (/agent/:handle).
 */
const API_BASE = 'https://api.basemail.ai';

export const onRequest: PagesFunction = async () => {
  const today = new Date().toISOString().slice(0, 10);
  let handles: string[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/agents/list`, { headers: { 'user-agent': 'BaseMail-Sitemap/2.0' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { handles?: string[] };
      if (Array.isArray(data.handles)) handles = data.handles.filter((h) => /^[a-zA-Z0-9_.-]+$/.test(h));
    }
  } catch { /* empty sitemap is still valid */ }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${handles.map((h) => `  <url><loc>https://basemail.ai/agent/${encodeURIComponent(h)}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
      'x-content-type-options': 'nosniff',
    },
  });
};
