/**
 * Cloudflare Pages Function — routing, content negotiation and real 404s.
 *
 * Design:
 * - Public pages (/, /about, /contact, /privacy, /developers, /blog/**) are prerendered at
 *   build time, so every client (browser, crawler, agent) receives the same complete HTML.
 *   No User-Agent sniffing.
 * - `Accept: text/markdown` on those pages returns the Markdown variant that the build
 *   emits next to each HTML file (index.md). Responses carry `Vary: Accept`.
 * - App routes (/dashboard/**, /claim/:id) get the empty SPA shell (app.html).
 * - /agent/:handle is server-rendered for everyone: the SPA shell plus head metadata and a
 *   semantic HTML summary of the agent so it is indexable; unknown agents are a real 404.
 * - Anything else is a real 404 (HTML, Markdown or JSON depending on Accept).
 */

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const SITE = 'https://basemail.ai';
const API_BASE = 'https://api.basemail.ai';

const STATIC_EXT = /\.(js|mjs|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|map|webmanifest|txt|xml|json|md|pdf)$/i;
const PRERENDERED = new Set(['/', '/about', '/contact', '/privacy', '/developers']);
const REDIRECTS: Record<string, string> = {
  '/docs': '/developers',
  '/api-docs': '/developers',
  '/developer': '/developers',
  '/blog': '/blog/',
  '/favicon.ico': '/logo.png',
  '/openapi.json': `${API_BASE}/api/openapi.json`,
  '/.well-known/openapi.json': `${API_BASE}/api/openapi.json`,
};

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

/* ───────────── Accept negotiation (RFC 9110 §12.5.1) ───────────── */

type Pref = { html: number; md: number; json: number; any: number; listed: boolean; mdExplicit: boolean };

function parseAccept(header: string | null): Pref {
  const pref: Pref = { html: -1, md: -1, json: -1, any: -1, listed: false, mdExplicit: false };
  if (!header) return pref;
  for (const part of header.split(',')) {
    const [typeRaw, ...params] = part.trim().split(';');
    const type = typeRaw.trim().toLowerCase();
    if (!type) continue;
    let q = 1;
    for (const p of params) {
      const m = p.trim().match(/^q=([0-9.]+)$/i);
      if (m) q = Math.max(0, Math.min(1, parseFloat(m[1]) || 0));
    }
    pref.listed = true;
    if (type === 'text/markdown' || type === 'text/x-markdown') { pref.md = Math.max(pref.md, q); if (q > 0) pref.mdExplicit = true; }
    else if (type === 'text/html' || type === 'application/xhtml+xml') pref.html = Math.max(pref.html, q);
    else if (type === 'application/json') pref.json = Math.max(pref.json, q);
    else if (type === '*/*') pref.any = Math.max(pref.any, q);
    else if (type === 'text/*') { pref.html = Math.max(pref.html, q); pref.md = Math.max(pref.md, q); }
    else if (type === 'text/plain') pref.md = Math.max(pref.md, q); // Markdown is plain text
  }
  return pref;
}

/** Which representation to serve for a page that exists as HTML and Markdown. */
function choose(pref: Pref): 'html' | 'md' | 'json' | 'none' {
  if (!pref.listed) return 'html';
  const html = pref.html >= 0 ? pref.html : pref.any;
  const md = pref.md >= 0 ? pref.md : pref.any;
  const json = pref.json >= 0 ? pref.json : pref.any;
  // Only a literal text/markdown wins ties; text/* and */* resolve to HTML.
  if (pref.mdExplicit && pref.md >= html) return 'md';
  if (html > 0) return 'html';
  if (md > 0) return 'md';
  if (json > 0) return 'json';
  if (pref.any > 0) return 'html';
  return 'none';
}

function withHeaders(res: Response, extra: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) out.headers.set(k, v);
  return out;
}

function mergeVary(res: Response, value: string) {
  const cur = res.headers.get('vary');
  const parts = new Set((cur ? cur.split(',') : []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  parts.add(value.toLowerCase());
  res.headers.set('vary', Array.from(parts).map((p) => p.replace(/(^|-)(\w)/g, (_, d, c) => d + c.toUpperCase())).join(', '));
}

async function asset(env: Env, origin: string, path: string): Promise<Response | null> {
  const res = await env.ASSETS.fetch(new Request(new URL(path, origin)));
  return res.ok ? res : null;
}

/* ───────────── Pages ───────────── */

async function servePage(env: Env, url: URL, request: Request, htmlPath: string, mdPath: string, status = 200): Promise<Response> {
  const pref = parseAccept(request.headers.get('accept'));
  const kind = choose(pref);
  const cache = status === 200 ? 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' : 'public, max-age=60';

  if (kind === 'none') {
    return withHeaders(new Response(JSON.stringify({ error: 'Not acceptable', code: 'not_acceptable', available: ['text/html', 'text/markdown'] }), {
      status: 406,
      headers: { 'content-type': 'application/json; charset=utf-8', vary: 'Accept' },
    }), {});
  }

  if (kind === 'json') {
    // Pages exist as HTML and Markdown only; tell JSON-only clients what is available.
    return withHeaders(new Response(JSON.stringify({ error: 'Not acceptable', code: 'not_acceptable', available: ['text/html', 'text/markdown'], markdown: `${SITE}${mdPath}`, api: `${API_BASE}/api/docs` }), {
      status: 406,
      headers: { 'content-type': 'application/json; charset=utf-8', vary: 'Accept' },
    }), {});
  }

  if (kind === 'md') {
    const md = await asset(env, url.origin, mdPath);
    if (md) {
      const res = withHeaders(new Response(md.body, { status }), {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': cache,
        'content-location': mdPath,
        'link': `<${SITE}${htmlPath === '/' ? '/' : htmlPath.startsWith('/blog/') ? htmlPath : htmlPath.replace(/\/$/, '')}>; rel="canonical"; type="text/html"`,
        vary: 'Accept',
      });
      return res;
    }
  }

  const html = await asset(env, url.origin, htmlPath);
  if (!html) return notFound(env, url, request);
  const res = withHeaders(new Response(html.body, { status }), {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': cache,
  });
  mergeVary(res, 'Accept');
  return res;
}

async function appShell(env: Env, url: URL, extraHead = '', bodyHtml = '', noindex = true): Promise<Response> {
  const shell = await asset(env, url.origin, '/app');
  if (!shell) return new Response('App shell missing', { status: 500 });
  let html = await shell.text();
  if (noindex) html = html.replace('<meta name="robots" content="noindex" />', '<meta name="robots" content="noindex" />');
  else html = html.replace('<meta name="robots" content="noindex" />', '<meta name="robots" content="index, follow" />');
  if (extraHead) {
    if (/<title>/.test(extraHead)) html = html.replace(/<title>[^<]*<\/title>\s*/, '');
    html = html.replace('</head>', () => `${extraHead}\n</head>`);
  }
  if (bodyHtml) html = html.replace('<div id="root"></div>', () => `<!--email_off--><div id="root">${bodyHtml}</div><!--/email_off-->`);
  return withHeaders(new Response(html, { status: 200 }), {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...(noindex ? { 'x-robots-tag': 'noindex' } : {}),
  });
}

async function notFound(env: Env, url: URL, request: Request): Promise<Response> {
  const pref = parseAccept(request.headers.get('accept'));
  const kind = choose(pref);
  const hint = {
    error: 'Not found',
    code: 'not_found',
    path: url.pathname,
    hint: 'This URL does not exist on basemail.ai.',
    start_here: {
      home: `${SITE}/`,
      sitemap: `${SITE}/sitemap.xml`,
      llms_txt: `${SITE}/llms.txt`,
      developers: `${SITE}/developers`,
      api_docs: `${API_BASE}/api/docs`,
      openapi: `${API_BASE}/api/openapi.json`,
    },
  };
  if (kind === 'json') {
    return withHeaders(new Response(JSON.stringify(hint, null, 2), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8', vary: 'Accept', 'cache-control': 'public, max-age=60' } }), {});
  }
  if (kind === 'md' || kind === 'none') {
    const md = `# 404 — Not found\n\n\`${url.pathname}\` does not exist on basemail.ai.\n\nStart here instead:\n\n- [Home](${SITE}/)\n- [Sitemap](${SITE}/sitemap.xml)\n- [llms.txt](${SITE}/llms.txt) — machine-readable summary\n- [Developer portal](${SITE}/developers)\n- [API docs](${API_BASE}/api/docs) · [OpenAPI](${API_BASE}/api/openapi.json)\n`;
    return withHeaders(new Response(md, { status: 404, headers: { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept', 'cache-control': 'public, max-age=60' } }), {});
  }
  const html = await asset(env, url.origin, '/404');
  const res = withHeaders(new Response(html ? html.body : '<h1>404 — Not found</h1>', { status: 404 }), {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=60',
  });
  mergeVary(res, 'Accept');
  return res;
}

/* ───────────── Agent profile SSR ───────────── */

const escapeHtml = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function agentProfile(env: Env, url: URL, request: Request, handle: string): Promise<Response> {
  // Handles are case-insensitive upstream; keep one canonical (lower-case) URL.
  if (handle !== handle.toLowerCase()) {
    return Response.redirect(`${url.origin}/agent/${handle.toLowerCase()}${url.search}`, 301);
  }
  const pref = parseAccept(request.headers.get('accept'));
  const kind = choose(pref);
  const regUrl = `${API_BASE}/api/agent/${encodeURIComponent(handle)}/registration.json`;
  if (kind === 'json') {
    return new Response(null, { status: 302, headers: { location: regUrl, vary: 'Accept', 'cache-control': 'no-store', ...SECURITY_HEADERS } });
  }
  if (kind === 'none') {
    return withHeaders(new Response(JSON.stringify({ error: 'Not acceptable', code: 'not_acceptable', available: ['text/html', 'text/markdown', 'application/json'], json: regUrl }), {
      status: 406, headers: { 'content-type': 'application/json; charset=utf-8', vary: 'Accept' },
    }), {});
  }

  let reg: any = null;
  try {
    const res = await fetch(regUrl, {
      headers: { 'user-agent': 'BaseMail-SSR/2.0', accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
      cf: { cacheEverything: true } as any, // honours the API's own Cache-Control at the edge
    });
    if (res.status === 404) return notFound(env, url, request);
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    reg = await res.json();
  } catch {
    // Temporary upstream failure: never publish an indexable/cacheable page for an unverified handle.
    return withHeaders(new Response(JSON.stringify({ error: 'Agent directory temporarily unavailable', code: 'upstream_unavailable', retry: regUrl }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '30', 'x-robots-tag': 'noindex', vary: 'Accept' },
    }), {});
  }

  // Raw values (escaped exactly once at each HTML interpolation below).
  const rawName: string = String(reg?.name || handle);
  const rawDesc: string = String(reg?.description || `${handle} is an AI agent with a verifiable email address on BaseMail.`);
  const email = `${handle}@basemail.ai`;
  const wallet: string = String(reg?.services?.find?.((s: any) => s.name === 'wallet')?.endpoint?.split(':').pop() || reg?.additionalProperty?.find?.((p: any) => p.name === 'wallet')?.value || '');
  const image: string = String(reg?.image || `${SITE}/og-image.png`);
  const rep = reg?.reputation || {};
  const pageUrl = `${SITE}/agent/${encodeURIComponent(handle)}`;
  const rawTitle = `${rawName} (@${handle}) — AI agent on BaseMail`;
  const rawMetaDesc = `${rawName} is an ERC-8004 registered AI agent on BaseMail. Email: ${email}.${rep.emailsReceived ? ` ${rep.emailsReceived} emails received.` : ''}`;

  if (kind === 'md') {
    const md = `# ${rawName} (@${handle})\n\n> ${rawMetaDesc}\n\n- **Email**: ${email}\n${wallet ? `- **Wallet**: ${wallet} (eip155:8453)\n` : ''}- **ERC-8004 registration**: ${regUrl}\n${rep.emailsReceived !== undefined ? `- **Reputation**: ${Number(rep.emailsReceived || 0)} received · ${Number(rep.emailsSent || 0)} sent · ${Number(rep.uniqueSenders || 0)} unique senders\n` : ''}\n${rawDesc}\n\nSend email to ${email} or use the BaseMail API: ${SITE}/developers\n`;
    return withHeaders(new Response(md, { status: 200, headers: { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept', 'cache-control': 'public, max-age=60' } }), {});
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': `${pageUrl}#agent`,
        name: rawName,
        description: rawDesc,
        url: pageUrl,
        image,
        applicationCategory: 'AI Agent',
        operatingSystem: 'Base (EVM)',
        identifier: { '@type': 'PropertyValue', name: 'ERC-8004 handle', value: handle },
        email,
        ...(wallet ? { additionalProperty: [{ '@type': 'PropertyValue', name: 'wallet', value: wallet }, { '@type': 'PropertyValue', name: 'chain', value: 'eip155:8453' }] } : {}),
        publisher: { '@type': 'Organization', name: 'BaseMail', url: `${SITE}/` },
      },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'BaseMail', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: `@${handle}`, item: pageUrl }] },
    ],
  };

  const e = escapeHtml;
  const head = [
    `<title>${e(rawTitle)}</title>`,
    `<meta name="description" content="${e(rawMetaDesc)}" />`,
    `<link rel="canonical" href="${pageUrl}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:site_name" content="BaseMail" />`,
    `<meta property="og:title" content="${e(rawTitle)}" />`,
    `<meta property="og:description" content="${e(rawMetaDesc)}" />`,
    `<meta property="og:url" content="${pageUrl}" />`,
    `<meta property="og:image" content="${e(image)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${e(rawTitle)}" />`,
    `<meta name="twitter:description" content="${e(rawMetaDesc)}" />`,
    `<meta name="twitter:image" content="${e(image)}" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].join('\n');

  // Semantic summary rendered inside #root; React replaces it on hydration (createRoot),
  // so crawlers and no-JS clients get real content while the app stays unchanged.
  const body = `<main style="max-width:48rem;margin:0 auto;padding:2rem 1.25rem;font-family:Inter,system-ui,sans-serif;color:#f2f3f5">
<p><a href="/" style="color:#9aa0a9">BaseMail</a> / agents / ${e(handle)}</p>
<h1>${e(rawName)} <span style="color:#9aa0a9;font-weight:400">@${e(handle)}</span></h1>
<p>${e(rawDesc)}</p>
<dl>
<dt>Email</dt><dd>${e(email)}</dd>
${wallet ? `<dt>Wallet</dt><dd>${e(wallet)} (Base, eip155:8453)</dd>` : ''}
<dt>Standard</dt><dd><a href="https://eips.ethereum.org/EIPS/eip-8004" style="color:#7da2ff">ERC-8004</a> — <a href="${e(regUrl)}" style="color:#7da2ff">registration.json</a></dd>
${rep.emailsReceived !== undefined ? `<dt>Reputation</dt><dd>${Number(rep.emailsReceived || 0)} received · ${Number(rep.emailsSent || 0)} sent · ${Number(rep.uniqueSenders || 0)} unique senders</dd>` : ''}
</dl>
<p>Send email to <strong>${e(email)}</strong> or use the <a href="${SITE}/developers" style="color:#7da2ff">BaseMail API</a>.</p>
</main>`;

  const res = await appShell(env, url, head, body, false);
  res.headers.set('cache-control', 'public, max-age=60, s-maxage=300');
  mergeVary(res, 'Accept');
  return res;
}

/* ───────────── Router ───────────── */

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  let path = url.pathname;

  // API proxy first (308 keeps the method/body) — mirrors public/_redirects.
  if (path.startsWith('/api/')) {
    return Response.redirect(`${API_BASE}${path}${url.search}`, 308);
  }

  // Normalise: strip trailing slash except root and directories we serve as folders.
  if (path.length > 1 && path.endsWith('/') && !path.startsWith('/blog/')) {
    return Response.redirect(url.origin + path.slice(0, -1) + url.search, 301);
  }
  // /x/index.html → /x (and /index.html → /)
  if (path.endsWith('/index.html')) {
    const pretty = path.slice(0, -'/index.html'.length) || '/';
    return Response.redirect(url.origin + (pretty === '/' ? '/' : path.startsWith('/blog/') ? pretty + '/' : pretty) + url.search, 301);
  }

  if (path in REDIRECTS) {
    const target = REDIRECTS[path];
    return Response.redirect(target.startsWith('http') ? target : url.origin + target + url.search, 301);
  }

  // Static assets & machine files: passthrough with cache/security headers.
  if (path.startsWith('/assets/') || STATIC_EXT.test(path) || path.startsWith('/.well-known/')) {
    const res = await context.next();
    if (res.status === 404) return notFound(env, url, request);
    const out = withHeaders(res, {});
    if (res.ok && path.startsWith('/assets/')) out.headers.set('cache-control', 'public, max-age=31536000, immutable');
    if (path === '/llms.txt' || path === '/llms-full.txt' || /\.md$/i.test(path)) {
      out.headers.set('content-type', 'text/markdown; charset=utf-8');
      out.headers.set('cache-control', 'public, max-age=300');
    }
    return out;
  }

  // Prerendered public pages (HTML + Markdown negotiation).
  if (PRERENDERED.has(path)) {
    const base = path === '/' ? '' : path;
    return servePage(env, url, request, `${base}/`, `${base}/index.md`);
  }

  // Blog: static HTML built by scripts/build-blog.mjs, with Markdown variants.
  if (path.startsWith('/blog/')) {
    const dir = path.endsWith('/') ? path : `${path}/`;
    const exists = await asset(env, url.origin, dir);
    if (!exists) return notFound(env, url, request);
    await exists.body?.cancel();
    if (!path.endsWith('/')) return Response.redirect(url.origin + dir + url.search, 301);
    return servePage(env, url, request, dir, `${dir}index.md`);
  }

  // Agent profiles: SSR metadata + semantic summary for everyone; real 404 when unknown.
  const agentMatch = path.match(/^\/agent\/([a-zA-Z0-9_.-]+)$/);
  if (agentMatch) return agentProfile(env, url, request, agentMatch[1]);

  // Client-only app routes.
  if (path === '/dashboard' || path.startsWith('/dashboard/') || /^\/claim\/[^/]+$/.test(path)) {
    return appShell(env, url);
  }

  return notFound(env, url, request);
};
