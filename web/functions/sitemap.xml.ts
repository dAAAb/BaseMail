/**
 * Dynamic sitemap — lists all agent profiles from the API.
 */

const API_BASE = 'https://api.basemail.ai';

interface Env {}

export const onRequest: PagesFunction<Env> = async () => {
  const today = new Date().toISOString().split('T')[0];

  // Fetch agent list from stats or a dedicated endpoint
  let agents: string[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/agents/list`, {
      headers: { 'User-Agent': 'BaseMail-Sitemap/1.0' },
    });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.handles)) agents = data.handles;
    }
  } catch {}

  const staticUrls = [
    { loc: 'https://basemail.ai/', priority: '1.0', changefreq: 'weekly' },
  ];

  const agentUrls = agents.map(h => ({
    loc: `https://basemail.ai/agent/${h}`,
    priority: '0.7',
    changefreq: 'weekly',
  }));

  const allUrls = [...staticUrls, ...agentUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml;charset=UTF-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};
