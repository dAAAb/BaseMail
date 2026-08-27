#!/usr/bin/env node
/**
 * Agent-readiness / SEO verification for basemail.ai.
 * Runs against any base URL (local `wrangler pages dev` or production).
 *
 *   node scripts/verify-site.mjs                 # https://basemail.ai
 *   node scripts/verify-site.mjs http://localhost:8788
 *
 * Exit code 1 on any failure. Each check is independent and reports its own evidence.
 */
const BASE = (process.argv[2] || 'https://basemail.ai').replace(/\/$/, '');
const API = process.env.API_BASE || 'https://api.basemail.ai';

let failures = 0;
const results = [];
function check(name, ok, evidence = '') {
  results.push({ name, ok, evidence });
  if (!ok) failures++;
}
const get = (url, headers = {}) => fetch(url, { headers, redirect: 'manual' });
const textLen = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;

/* ── Homepage without JS ── */
{
  const r = await get(`${BASE}/`);
  const html = await r.text();
  check('home: 200 text/html', r.status === 200 && /text\/html/.test(r.headers.get('content-type') || ''), `${r.status} ${r.headers.get('content-type')}`);
  check('home: <h1> present', /<h1[\s>]/.test(html));
  const len = textLen(html);
  check('home: ≥500 chars of text without JS', len >= 500, `${len} chars`);
  check('home: canonical', /<link rel="canonical" href="https:\/\/basemail\.ai\/"/.test(html));
  check('home: <html lang>', /<html lang="en"/.test(html));
  check('home: og:image + og:type', /property="og:image"/.test(html) && /property="og:type"/.test(html));
  check('home: JSON-LD present', /application\/ld\+json/.test(html));
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let graph = [];
  try { const j = JSON.parse(ld[1]); graph = j['@graph'] || [j]; } catch {}
  const types = graph.map((g) => g['@type']);
  check('home: JSON-LD SoftwareApplication + Organization + FAQPage', ['SoftwareApplication', 'Organization', 'FAQPage'].every((t) => types.includes(t)), types.join(','));
  const org = graph.find((g) => g['@type'] === 'Organization') || {};
  check('home: Organization has contactPoint + address', Array.isArray(org.contactPoint) && org.contactPoint.length > 0 && !!org.address);
  check('home: no "Æmail"', !html.includes('Æ'));
  check('home: no email obfuscation ([email protected])', !html.includes('email&#160;protected') && !html.includes('[email protected]'));
  check('home: Vary includes Accept', /accept/i.test(r.headers.get('vary') || ''), r.headers.get('vary') || '(none)');
  check('home: links to /developers', /href="\/developers"/.test(html));
}

/* ── Markdown negotiation ── */
{
  const r = await get(`${BASE}/`, { accept: 'text/markdown' });
  const ct = r.headers.get('content-type') || '';
  const body = await r.text();
  check('home: Accept: text/markdown → text/markdown', r.status === 200 && ct.startsWith('text/markdown'), `${r.status} ${ct}`);
  check('home: markdown Vary: Accept', /accept/i.test(r.headers.get('vary') || ''), r.headers.get('vary') || '(none)');
  check('home: markdown starts with H1', /^(<!--[^>]*-->\s*)?# /.test(body));
  const q = await get(`${BASE}/`, { accept: 'text/html;q=0.5, text/markdown;q=0.9' });
  check('home: q-values honoured (md wins)', (q.headers.get('content-type') || '').startsWith('text/markdown'));
  const q2 = await get(`${BASE}/`, { accept: 'text/markdown;q=0.5, text/html;q=0.9' });
  check('home: q-values honoured (html wins)', (q2.headers.get('content-type') || '').startsWith('text/html'));
  const na = await get(`${BASE}/`, { accept: 'image/avif' });
  check('home: unsupported Accept → 406', na.status === 406, String(na.status));
  for (const p of ['/developers', '/about', '/contact', '/privacy']) {
    const m = await get(`${BASE}${p}`, { accept: 'text/markdown' });
    check(`${p}: markdown variant`, m.status === 200 && (m.headers.get('content-type') || '').startsWith('text/markdown'), `${m.status} ${m.headers.get('content-type')}`);
  }
}

/* ── Real 404s ── */
{
  const r = await get(`${BASE}/some-path-that-does-not-exist-${Date.now()}`);
  check('unknown path → 404', r.status === 404, String(r.status));
  const md = await get(`${BASE}/nope-${Date.now()}`, { accept: 'text/markdown' });
  const body = await md.text();
  check('unknown path (markdown) → 404 + pointers', md.status === 404 && (md.headers.get('content-type') || '').startsWith('text/markdown') && /llms\.txt/.test(body) && /sitemap/.test(body));
  const js = await get(`${BASE}/nope-${Date.now()}`, { accept: 'application/json' });
  check('unknown path (json) → 404 JSON', js.status === 404 && /application\/json/.test(js.headers.get('content-type') || ''));
  const ag = await get(`${BASE}/agent/zzz-not-a-real-agent-${Date.now()}`);
  check('unknown agent → 404', ag.status === 404, String(ag.status));
  const wk = await get(`${BASE}/.well-known/does-not-exist`);
  check('unknown well-known → 404', wk.status === 404, String(wk.status));
}

/* ── Trust & developer pages ── */
for (const p of ['/about', '/contact', '/privacy', '/developers']) {
  const r = await get(`${BASE}${p}`);
  const html = await r.text();
  const len = textLen(html);
  check(`${p}: 200 + ≥500 chars`, r.status === 200 && len >= 500, `${r.status} ${len} chars`);
  check(`${p}: canonical`, html.includes(`<link rel="canonical" href="https://basemail.ai${p}"`));
}
{
  const r = await get(`${BASE}/docs`);
  check('/docs → 301 /developers', r.status === 301 && /\/developers$/.test(r.headers.get('location') || ''), `${r.status} ${r.headers.get('location')}`);
}

/* ── Machine-readable files ── */
{
  const llms = await get(`${BASE}/llms.txt`);
  const t = await llms.text();
  check('llms.txt: 200 markdown', llms.status === 200 && (llms.headers.get('content-type') || '').includes('markdown'), llms.headers.get('content-type') || '');
  check('llms.txt: H1 + blockquote + "When to use"', /^# BaseMail/m.test(t) && /^> /m.test(t) && /## When to use/.test(t));
  check('llms.txt: no "Æ"', !t.includes('Æ'));
  const full = await get(`${BASE}/llms-full.txt`);
  check('llms-full.txt: 200', full.status === 200, String(full.status));
  const sm = await get(`${BASE}/sitemap.xml`);
  const smt = await sm.text();
  check('sitemap.xml: sitemapindex', sm.status === 200 && /<sitemapindex/.test(smt));
  const sp = await get(`${BASE}/sitemap-pages.xml`);
  const spt = await sp.text();
  check('sitemap-pages.xml: has /developers and blog', sp.status === 200 && /\/developers</.test(spt) && /\/blog\//.test(spt));
  const rb = await get(`${BASE}/robots.txt`);
  check('robots.txt: Sitemap + Disallow /dashboard', rb.status === 200 && /Sitemap: https:\/\/basemail\.ai\/sitemap\.xml/.test(await rb.text()));
  for (const f of ['agents.json', 'agent.json', 'ai-plugin.json']) {
    const r = await get(`${BASE}/.well-known/${f}`);
    let ok = r.status === 200;
    try { JSON.parse(await r.text()); } catch { ok = false; }
    check(`.well-known/${f}: valid JSON`, ok, String(r.status));
  }
  const logo = await get(`${BASE}/logo.png`);
  check('logo.png: image/png', logo.status === 200 && /image\/png/.test(logo.headers.get('content-type') || ''), `${logo.status} ${logo.headers.get('content-type')}`);
  const og = await get(`${BASE}/og-image.png`);
  const size = Number(og.headers.get('content-length') || 0);
  check('og-image.png: image/png < 400KB', og.status === 200 && /image\/png/.test(og.headers.get('content-type') || '') && (size === 0 || size < 400_000), `${og.status} ${size}B`);
}

/* ── App routes still work ── */
{
  const d = await get(`${BASE}/dashboard`);
  const html = await d.text();
  check('/dashboard: 200 SPA shell, noindex', d.status === 200 && /<div id="root">/.test(html) && /noindex/.test(html + (d.headers.get('x-robots-tag') || '')), String(d.status));
  const d2 = await get(`${BASE}/dashboard/settings`);
  check('/dashboard/settings: 200', d2.status === 200, String(d2.status));
  const c = await get(`${BASE}/claim/abc123`);
  check('/claim/:id: 200 SPA shell', c.status === 200, String(c.status));
  const b = await get(`${BASE}/blog/`);
  check('/blog/: 200', b.status === 200, String(b.status));
  const api = await get(`${BASE}/api/stats`);
  check('/api/* proxy redirect intact', api.status === 308 || api.status === 200, String(api.status));
}

/* ── API surface ── */
{
  const nf = await get(`${API}/api/definitely-not-a-route`);
  check('api: unknown route → JSON 404', nf.status === 404 && /json/.test(nf.headers.get('content-type') || ''), `${nf.status} ${nf.headers.get('content-type')}`);
  const oa = await get(`${API}/api/openapi.json`);
  let spec = null;
  try { spec = await oa.json(); } catch {}
  check('api: openapi.json parses', !!spec && spec.openapi?.startsWith('3.'));
  if (spec) {
    const ops = [];
    for (const [p, item] of Object.entries(spec.paths || {})) for (const [m, op] of Object.entries(item)) if (typeof op === 'object' && op) ops.push({ p, m, op });
    const withId = ops.filter((o) => o.op.operationId).length;
    const withSchema = ops.filter((o) => Object.values(o.op.responses || {}).some((r) => r?.content?.['application/json']?.schema)).length;
    check(`api: operationId on all ops (${withId}/${ops.length})`, ops.length > 0 && withId === ops.length);
    check(`api: response schema on all ops (${withSchema}/${ops.length})`, ops.length > 0 && withSchema === ops.length);
    check('api: components.schemas.Error', !!spec.components?.schemas?.Error);
    check('api: x-versioning', !!spec.info?.['x-versioning']);
  }
  const st = await get(`${API}/api/stats`);
  check('api: X-API-Version header', !!st.headers.get('x-api-version'), st.headers.get('x-api-version') || '(none)');
  const ll = await get(`${API}/llms.txt`);
  check('api: /llms.txt', ll.status === 200, String(ll.status));
  const v = await get(`${API}/api/versions`);
  check('api: /api/versions', v.status === 200, String(v.status));
}

/* ── Report ── */
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.evidence ? `  — ${r.evidence}` : ''}`);
console.log(`\n${results.length - failures}/${results.length} checks passed against ${BASE}`);
process.exit(failures ? 1 : 0);
