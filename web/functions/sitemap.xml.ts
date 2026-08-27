/**
 * Sitemap index: static pages (built at deploy time) + agent profiles (dynamic).
 */
export const onRequest: PagesFunction = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://basemail.ai/sitemap-pages.xml</loc><lastmod>${today}</lastmod></sitemap>
  <sitemap><loc>https://basemail.ai/sitemap-agents.xml</loc><lastmod>${today}</lastmod></sitemap>
</sitemapindex>
`;
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
      'x-content-type-options': 'nosniff',
    },
  });
};
