#!/usr/bin/env node
/**
 * Build blog markdown → static HTML in dist/blog/
 * Run AFTER vite build (dist/ must exist).
 *
 * Outputs (per post `<slug>`):
 *   dist/blog/<slug>/index.html   rendered page (design-system styled)
 *   dist/blog/<slug>/index.md     raw markdown source (for text/markdown content negotiation)
 * Plus:
 *   dist/blog/index.html          blog index
 *   dist/blog/index.md            markdown index
 *   dist/blog/posts.json          [{slug,title,description,published,tags,heroImage}] for the sitemap
 *
 * Usage: node scripts/build-blog.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const CONTENT_DIR = join(import.meta.dirname, '..', 'content', 'blog');
const DIST_DIR = join(import.meta.dirname, '..', 'dist', 'blog');

const SITE = 'https://basemail.ai';
const OG_FALLBACK = `${SITE}/og-image.png`;
const LOGO_URL = `${SITE}/logo.png`;
const ORG_ID = `${SITE}/#organization`;
// Meta descriptions: ≤155 chars, cut on a word boundary.
function metaDesc(text, max = 155) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ') > 80 ? cut.lastIndexOf(' ') : cut.length).replace(/[,;:\-–—]$/, '') + '…';
}

// Simple markdown → HTML (no dependencies)
function md2html(md) {
  // Fenced code is opaque: stash it before any heading/list/inline regex runs.
  const fences = [];
  md = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    fences.push(`<pre><code class="language-${lang || 'text'}">${esc(code.trim())}</code></pre>`);
    return `\n\n@@FENCE${fences.length - 1}@@\n\n`;
  });
  const isInternal = (href) => href.startsWith('/') || /^https?:\/\/(api\.)?basemail\.ai(\/|$)/.test(href);
  let html = md
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Images (must run before links)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => isInternal(href) ? `<a href="${href}">${label}</a>` : `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    // Horizontal rules
    .replace(/^---+$/gm, '<hr />')
    // Tables
    .replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (_, header, _sep, body) => {
      const heads = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('\n');
      return `<div class="table-wrapper"><table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Checkboxes
    .replace(/✅/g, '✅').replace(/❌/g, '❌')
    // Paragraphs (lines not already wrapped)
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|pre|table|div|hr|section|img)/.test(block)) return block;
      return `<p>${block}</p>`;
    })
    .join('\n\n');

  html = html.replace(/(?:<p>)?@@FENCE(\d+)@@(?:<\/p>)?/g, (_, k) => fences[Number(k)]);
  return html;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Attribute-safe escape (adds quote escaping on top of esc)
function escAttr(s) {
  return esc(String(s)).replace(/"/g, '&quot;');
}

// Safe to inline inside <script type="application/ld+json">
function jsonForScript(obj) {
  return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

// Parse frontmatter from markdown
function parseFrontmatter(md) {
  const lines = md.split('\n');
  const meta = {};
  let contentStart = 0;
  
  // Title is first # line
  if (lines[0]?.startsWith('# ')) {
    meta.title = lines[0].slice(2).trim();
    contentStart = 1;
  }
  
  // Parse **Key:** Value lines after title
  for (let i = contentStart; i < lines.length; i++) {
    const m = lines[i].match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (m) {
      meta[m[1].toLowerCase()] = m[2].trim();
      contentStart = i + 1;
    } else if (lines[i].trim() === '' || lines[i].trim() === '---') {
      if (lines[i].trim() === '---') contentStart = i + 1;
      continue;
    } else {
      break;
    }
  }
  
  return { meta, content: lines.slice(contentStart).join('\n') };
}

/* ─────────────────────────────────────────────────────────────────
   Shared chrome — mirrors src/components/SiteHeader.tsx / SiteFooter.tsx
   and the tokens in src/index.css (kept inline: these pages are standalone).
   ───────────────────────────────────────────────────────────────── */

const NAV = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#attn', label: '$ATTN' },
  { href: '/developers', label: 'Developers' },
  { href: '/blog/', label: 'Blog' },
  { href: '/about', label: 'About' },
];

const FOOTER_COLS = [
  {
    title: 'Product',
    links: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/developers', label: 'Developers' },
      { href: 'https://api.basemail.ai/api/openapi.json', label: 'OpenAPI spec', external: true },
      { href: '/blog/', label: 'Blog' },
      { href: '/llms.txt', label: 'llms.txt' },
    ],
  },
  {
    title: 'Standards',
    links: [
      { href: 'https://eips.ethereum.org/EIPS/eip-8004', label: 'ERC-8004', external: true },
      { href: 'https://login.xyz', label: 'SIWE (EIP-4361)', external: true },
      { href: 'https://www.base.org/names', label: 'Basenames', external: true },
      { href: 'https://lens.xyz', label: 'Lens Protocol', external: true },
      { href: 'https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/', label: 'CO-QAF paper', external: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
      { href: 'https://github.com/dAAAb/BaseMail', label: 'GitHub', external: true },
      { href: 'https://x.com/Basemail_ai', label: 'X (Twitter)', external: true },
    ],
  },
];

const FONTS_HTML = `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />`;

// Same mark as Icon.Logo in src/components/Icons.tsx
const LOGO_SVG = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="#0052FF"/><path d="M6.5 15.5v-7l5.5 4 5.5-4v7" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function headerHtml() {
  const links = NAV.map(n => `<a class="btn btn-ghost" href="${n.href}">${n.label}</a>`).join('\n        ');
  return `<header class="site-header">
    <div class="container">
      <a class="logo" href="/" aria-label="BaseMail home">${LOGO_SVG}<span>BaseMail</span></a>
      <nav class="site-nav" aria-label="Primary">
        ${links}
      </nav>
      <a class="btn btn-primary cta" href="/dashboard">Open Dashboard</a>
    </div>
  </header>`;
}

function footerHtml() {
  const cols = FOOTER_COLS.map(col => `<div class="footer-col">
          <h3 class="eyebrow">${col.title}</h3>
          <ul>
            ${col.links.map(l => `<li><a href="${l.href}"${l.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${l.label}</a></li>`).join('\n            ')}
          </ul>
        </div>`).join('\n        ');
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="logo" href="/" aria-label="BaseMail home">${LOGO_SVG}<span>BaseMail</span></a>
          <p>Email for AI agents, on Base. A wallet signature is the only credential your agent needs.</p>
          <p class="email"><a href="mailto:cloudlobst3r@basemail.ai"><!--email_off-->cloudlobst3r@basemail.ai<!--/email_off--></a></p>
        </div>
        ${cols}
      </div>
      <div class="footer-bottom">
        <p>© ${new Date().getFullYear()} BaseMail — Email for AI agents on Base. Built on Base and Cloudflare Workers.</p>
        <p class="mono">api.basemail.ai · ERC-8004 · SIWE</p>
      </div>
    </div>
  </footer>`;
}

// Tokens + reset + header/footer/buttons. Values copied from src/index.css / tailwind.config.js.
const BASE_CSS = `
:root{--bg:#0a0b0d;--surface:#111316;--surface-2:#181b20;--line:rgba(255,255,255,.08);--line-strong:rgba(255,255,255,.16);--fg:#f2f3f5;--fg-muted:#9aa0a9;--fg-subtle:#6b7280;--accent:#0052ff;--accent-hover:#2e6bff;--accent-soft:rgba(0,82,255,.12);--accent-text:#7da2ff;--success:#22c55e;--warning:#f59e0b;--danger:#ef4444;--attn:#8b5cf6;--sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss01","ss03";overflow-x:hidden;line-height:1.6;font-size:clamp(1rem,.95rem + .2vw,1.0625rem);min-height:100vh;display:flex;flex-direction:column}
main{flex:1}
a{color:inherit;text-decoration:none}
img,svg{max-width:100%;height:auto;display:block}
code,kbd,pre,samp{font-family:var(--mono)}
::selection{background:rgba(0,82,255,.35)}
:focus-visible{outline:none;box-shadow:0 0 0 2px var(--bg),0 0 0 4px rgba(0,82,255,.6);border-radius:6px}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important;scroll-behavior:auto!important}}
.container{margin:0 auto;width:100%;max-width:72rem;padding-left:1.25rem;padding-right:1.25rem}
@media(min-width:640px){.container{padding-left:2rem;padding-right:2rem}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;height:2.25rem;padding:0 1rem;border-radius:.5rem;font-size:.875rem;font-weight:500;white-space:nowrap;user-select:none;transition:color .15s,background-color .15s,border-color .15s}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:var(--accent-hover)}
.btn-secondary{background:var(--surface-2);color:var(--fg);border:1px solid var(--line)}.btn-secondary:hover{border-color:var(--line-strong)}
.btn-ghost{background:transparent;color:var(--fg-muted);padding:0 .75rem}.btn-ghost:hover{color:var(--fg);background:var(--surface-2)}
.eyebrow{font-size:.75rem;font-weight:500;text-transform:uppercase;letter-spacing:.14em;color:var(--fg-subtle)}
.badge{display:inline-flex;align-items:center;gap:.25rem;border-radius:9999px;padding:.125rem .5rem;font-size:.75rem;font-weight:500;line-height:1.25rem;white-space:nowrap;background:rgba(255,255,255,.06);color:var(--fg-muted)}
.logo{display:inline-flex;align-items:center;gap:.5rem;font-weight:600;letter-spacing:-.01em;color:var(--fg)}
.logo svg{width:26px;height:26px;flex-shrink:0}
/* Header — same structure as SiteHeader; on small screens the nav wraps to a second row (no JS) */
.site-header{position:sticky;top:0;z-index:40;border-bottom:1px solid var(--line);background:rgba(10,11,13,.8);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.site-header .container{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;min-height:4rem;padding-top:.75rem;padding-bottom:.75rem}
.site-header .logo{order:1}
.site-header .cta{order:2;margin-left:auto}
.site-nav{order:3;display:flex;flex-wrap:wrap;gap:.25rem;width:100%;margin:0 -.75rem}
@media(min-width:768px){.site-header .container{flex-wrap:nowrap;justify-content:space-between;height:4rem;padding-top:0;padding-bottom:0}.site-header .logo,.site-header .cta{order:0;margin-left:0}.site-nav{order:0;width:auto;margin:0}}
/* Footer — same columns as SiteFooter */
.site-footer{border-top:1px solid var(--line);margin-top:2rem}
.site-footer .container{padding-top:3rem;padding-bottom:3rem}
@media(min-width:640px){.site-footer .container{padding-top:4rem;padding-bottom:4rem}}
.footer-grid{display:grid;gap:2.5rem}
@media(min-width:640px){.footer-grid{grid-template-columns:1fr 1fr}}
@media(min-width:1024px){.footer-grid{grid-template-columns:1.4fr 1fr 1fr 1fr}}
.footer-brand{max-width:20rem}
.footer-brand p{margin-top:.75rem;font-size:.875rem;color:var(--fg-muted);line-height:1.6}
.footer-brand .email{margin-top:1rem;font-size:.75rem;color:var(--fg-subtle);font-family:var(--mono)}
.footer-col h3{margin-bottom:.75rem}
.footer-col ul{list-style:none}
.footer-col li+li{margin-top:.5rem}
.footer-col a{font-size:.875rem;color:var(--fg-muted);transition:color .15s}.footer-col a:hover{color:var(--fg)}
.footer-bottom{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:.5rem;font-size:.75rem;color:var(--fg-subtle)}
@media(min-width:640px){.footer-bottom{flex-direction:row;align-items:center;justify-content:space-between}}
.footer-bottom .mono{font-family:var(--mono)}
/* Page column */
.page{width:100%;max-width:720px;margin:0 auto;padding:2.5rem 1.25rem 5rem}
@media(min-width:640px){.page{padding:4rem 2rem 6rem}}
`;

// Article-only styles (long-form copy; mirrors .prose-basemail + .code-panel)
const ARTICLE_CSS = `
.post-header{margin-bottom:2rem}
.post-header .crumb{display:inline-flex;align-items:center;gap:.375rem;margin-bottom:1rem;color:var(--fg-subtle);transition:color .15s}.post-header .crumb:hover{color:var(--fg)}
.post-header h1{font-size:clamp(1.875rem,1.3rem + 2.2vw,3rem);line-height:1.08;letter-spacing:-.025em;font-weight:600;overflow-wrap:anywhere}
.post-header .lede{margin-top:1rem;font-size:1.0625rem;color:var(--fg-muted);line-height:1.6}
.post-meta{margin-top:1.25rem;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem;font-size:.8125rem;color:var(--fg-muted)}
.post-meta .sep{color:var(--fg-subtle)}
.post-meta .tags{display:flex;flex-wrap:wrap;gap:.375rem;width:100%}
.hero{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:1rem;border:1px solid var(--line);margin-bottom:2rem;background:var(--surface)}
.prose>*+*{margin-top:1rem}
.prose h1,.prose h2{font-size:clamp(1.375rem,1.15rem + .9vw,1.75rem);line-height:1.15;letter-spacing:-.02em;font-weight:600;color:var(--fg);margin-top:3rem;margin-bottom:1rem;overflow-wrap:anywhere}
.prose h3{font-size:1.25rem;line-height:1.3;letter-spacing:-.01em;font-weight:600;color:var(--fg);margin-top:2rem;margin-bottom:.75rem}
.prose p,.prose li{color:var(--fg-muted);line-height:1.7;overflow-wrap:anywhere}
.prose a{color:var(--accent-text);text-underline-offset:4px;transition:color .15s}.prose a:hover{color:#fff;text-decoration:underline}
.prose strong{color:var(--fg);font-weight:600}
.prose em{color:var(--fg)}
.prose ul,.prose ol{padding-left:1.375rem}
.prose li+li{margin-top:.375rem}
.prose code{font-size:.875em;background:var(--surface-2);color:var(--fg);padding:.125rem .375rem;border-radius:.375rem;overflow-wrap:anywhere}
.prose pre{border-radius:1rem;border:1px solid var(--line);background:var(--surface);padding:1.25rem;font-size:13px;line-height:24px;overflow-x:auto;color:var(--fg-muted);margin:1.25rem 0;-webkit-overflow-scrolling:touch}
.prose pre code{background:none;padding:0;border-radius:0;color:inherit;font-size:inherit;overflow-wrap:normal;white-space:pre}
.prose hr{border:0;border-top:1px solid var(--line);margin:2.5rem 0}
.prose img{border-radius:1rem;border:1px solid var(--line);margin:1.5rem 0}
.table-wrapper{overflow-x:auto;margin:1.25rem -1.25rem;padding:0 1.25rem;-webkit-overflow-scrolling:touch}
@media(min-width:640px){.table-wrapper{margin:1.25rem 0;padding:0}}
table{width:100%;min-width:480px;border-collapse:collapse;font-size:.875rem}
th{text-align:left;padding:.625rem 1rem;color:var(--fg);font-weight:600;border-bottom:1px solid var(--line-strong);white-space:nowrap}
td{padding:.625rem 1rem;color:var(--fg-muted);border-bottom:1px solid var(--line);vertical-align:top}
tr:hover td{background:rgba(255,255,255,.02)}
.post-footer{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--line)}
.post-cta{background:var(--surface);border:1px solid var(--line);border-radius:1rem;padding:1.5rem;display:flex;flex-direction:column;gap:1rem}
@media(min-width:640px){.post-cta{flex-direction:row;align-items:center;justify-content:space-between}}
.post-cta h3{font-size:1.125rem;font-weight:600;letter-spacing:-.01em}
.post-cta p{margin-top:.25rem;font-size:.875rem;color:var(--fg-muted)}
.post-cta .btn{flex-shrink:0}
.post-back{margin-top:1.5rem;font-size:.875rem}
.post-back a{color:var(--fg-muted);transition:color .15s}.post-back a:hover{color:var(--fg)}
`;

// Index-only styles
const INDEX_CSS = `
.index-header{margin-bottom:2.5rem}
.index-header h1{margin-top:.75rem;font-size:clamp(1.875rem,1.3rem + 2.2vw,3rem);line-height:1.08;letter-spacing:-.025em;font-weight:600}
.index-header .subtitle{margin-top:1rem;max-width:42rem;color:var(--fg-muted);line-height:1.6}
.posts{display:grid;gap:1.25rem}
.post{display:block;background:var(--surface);border:1px solid var(--line);border-radius:1rem;overflow:hidden;transition:border-color .15s}
.post:hover{border-color:var(--line-strong)}
.post .hero{width:100%;aspect-ratio:3/2;object-fit:cover;background:var(--surface-2)}
.post .content{padding:1.25rem}
@media(min-width:640px){.post .content{padding:1.5rem}}
.post h2{font-size:1.25rem;line-height:1.3;letter-spacing:-.01em;font-weight:600;color:var(--fg);overflow-wrap:anywhere}
.post p{margin-top:.5rem;font-size:.9375rem;color:var(--fg-muted);line-height:1.6}
.post .meta{margin-top:.75rem;display:flex;flex-wrap:wrap;align-items:center;gap:.375rem .5rem;font-size:.75rem;color:var(--fg-subtle)}
.post .meta time{font-family:var(--mono)}
`;

// Blog page template
function blogTemplate(meta, bodyHtml, slug, heroImage) {
  const title = meta.title || 'Blog Post';
  const description = metaDesc(meta.description || title);
  const published = meta.published || new Date().toISOString().slice(0, 10);
  const author = meta.author || 'BaseMail Team';
  const tags = meta.tags || '';
  const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
  const keywords = tagList.join(', ');
  const url = `${SITE}/blog/${slug}/`;
  const ogImage = heroImage ? `${SITE}${heroImage}` : OG_FALLBACK;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    datePublished: published,
    dateModified: meta.updated || published,
    author: { '@id': ORG_ID },
    publisher: { '@type': 'Organization', '@id': ORG_ID, name: 'BaseMail', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: LOGO_URL } },
    isPartOf: { '@type': 'Blog', '@id': `${SITE}/blog/#blog`, name: 'BaseMail Blog' },
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(heroImage ? { image: `${SITE}${heroImage}` } : {}),
    ...(keywords ? { keywords } : {}),
    about: ['AI Agent Email', 'ERC-8004', 'Onchain Identity'],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} | BaseMail Blog</title>
  <meta name="description" content="${escAttr(description)}" />
  <meta name="keywords" content="BaseMail, AI agent email, ${escAttr(keywords)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <link rel="alternate" type="text/markdown" href="/blog/${slug}/index.md" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="BaseMail" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="${heroImage ? 1536 : 1200}" />
  <meta property="og:image:height" content="${heroImage ? 1024 : 630}" />
  <meta name="twitter:site" content="@Basemail_ai" />
  <meta property="article:published_time" content="${published}" />
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'BaseMail', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog/` },
    { '@type': 'ListItem', position: 3, name: title, item: url },
  ] }).replace(/</g, '\\u003c')}</script>

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />
  <meta name="twitter:image" content="${ogImage}" />

  <script type="application/ld+json">
  ${jsonForScript(jsonLd)}
  </script>

  ${FONTS_HTML}
  <style>${BASE_CSS}${ARTICLE_CSS}</style>
</head>
<body>
  ${headerHtml()}

  <main class="page">
    <article>
      <header class="post-header">
        <a class="crumb eyebrow" href="/blog/">Blog</a>
        <h1>${esc(title)}</h1>
        ${meta.description ? `<p class="lede">${esc(meta.description)}</p>` : ''}
        <div class="post-meta">
          <time datetime="${published}">${published}</time>
          <span class="sep">·</span>
          <span>${esc(author)}</span>
          ${tagList.length ? `<div class="tags">${tagList.map(t => `<span class="badge">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </header>

      ${heroImage ? `<img class="hero" src="${heroImage}" alt="${escAttr(title)}" width="1536" height="1024" />` : ''}

      <div class="prose">
        ${bodyHtml}
      </div>

      <footer class="post-footer">
        <div class="post-cta">
          <div>
            <h3>Give your agent an inbox</h3>
            <p>Register an ERC-8004 identity and start sending email in minutes.</p>
          </div>
          <a class="btn btn-primary" href="/dashboard">Open Dashboard</a>
        </div>
        <p class="post-back"><a href="/blog/">← All posts</a></p>
      </footer>
    </article>
  </main>

  ${footerHtml()}
</body>
</html>`;
}

// Blog index template
function indexTemplate(posts) {
  const url = `${SITE}/blog/`;
  const description = 'Articles about AI agent identity, onchain email, ERC-8004, Attention Bonds, and the future of agent-to-agent communication.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Blog | BaseMail</title>
  <meta name="description" content="${escAttr(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <link rel="alternate" type="text/markdown" href="/blog/index.md" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

  <meta property="og:title" content="BaseMail Blog" />
  <meta property="og:description" content="Articles about AI agent identity, onchain email, and the future of agent communication." />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="BaseMail" />
  <meta property="og:image" content="${OG_FALLBACK}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="BaseMail Blog" />
  <meta name="twitter:description" content="${escAttr(description)}" />
  <meta name="twitter:image" content="${OG_FALLBACK}" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:site" content="@Basemail_ai" />
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'Blog', '@id': `${SITE}/blog/#blog`, url, name: 'BaseMail Blog', description, publisher: { '@id': ORG_ID }, inLanguage: 'en',
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE}/blog/${p.slug}/`, datePublished: p.published, ...(p.heroImage ? { image: `${SITE}${p.heroImage}` } : {}) })) },
    { '@type': 'BreadcrumbList', itemListElement: [ { '@type': 'ListItem', position: 1, name: 'BaseMail', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: 'Blog', item: url } ] },
  ] }).replace(/</g, '\\u003c')}</script>

  ${FONTS_HTML}
  <style>${BASE_CSS}${INDEX_CSS}</style>
</head>
<body>
  ${headerHtml()}

  <main class="page">
    <header class="index-header">
      <span class="eyebrow">BaseMail</span>
      <h1>Blog</h1>
      <p class="subtitle">Thoughts on AI agent identity, onchain email, and the future of agent communication.</p>
    </header>

    <div class="posts">
      ${posts.map(p => `<a href="/blog/${p.slug}/" class="post">
        ${p.heroImage ? `<img class="hero" src="${p.heroImage}" alt="${escAttr(p.title)}" width="1536" height="1024" loading="lazy" />` : ''}
        <div class="content">
          <h2>${esc(p.title)}</h2>
          <p>${esc(p.description)}</p>
          <div class="meta"><time datetime="${p.published}">${p.published}</time>${p.tags ? `<span>·</span><span>${esc(p.tags)}</span>` : ''}</div>
        </div>
      </a>`).join('\n      ')}
    </div>
  </main>

  ${footerHtml()}
</body>
</html>`;
}

// Markdown index (served for text/markdown content negotiation at /blog/index.md)
function indexMarkdown(posts) {
  const lines = posts.map(p => {
    const desc = p.description ? `: ${p.description}` : '';
    const date = p.published ? ` (${p.published})` : '';
    return `- [${p.title}](${SITE}/blog/${p.slug}/)${desc}${date}`;
  });
  return `# BaseMail Blog\n\n${lines.join('\n')}\n`;
}

// Main
function build() {
  if (!existsSync(CONTENT_DIR)) {
    console.log('No content/blog directory found');
    return;
  }
  
  mkdirSync(DIST_DIR, { recursive: true });
  
  const files = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  const posts = [];
  
  for (const file of files) {
    const md = readFileSync(join(CONTENT_DIR, file), 'utf-8');
    const { meta, content } = parseFrontmatter(md);
    const slug = basename(file, '.md');
    const bodyHtml = md2html(content);

    // Check if hero image exists
    const heroPath = join(import.meta.dirname, '..', 'public', 'blog', `${slug}.webp`);
    const heroImage = existsSync(heroPath) ? `/blog/${slug}.webp` : null;
    
    const html = blogTemplate(meta, bodyHtml, slug, heroImage);
    const outDir = join(DIST_DIR, slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'index.html'), html);
    // Raw markdown source alongside the page (frontmatter lines intact)
    writeFileSync(join(outDir, 'index.md'), md);
    
    posts.push({
      slug,
      title: meta.title || slug,
      description: meta.description || '',
      published: meta.published || '',
      tags: meta.tags || '',
      heroImage,
    });
    
    console.log(`✅ ${slug}/index.html + index.md`);
  }
  
  // Sort by date descending
  posts.sort((a, b) => b.published.localeCompare(a.published));
  
  // Write index (HTML + markdown) and the posts manifest for the sitemap
  writeFileSync(join(DIST_DIR, 'index.html'), indexTemplate(posts));
  writeFileSync(join(DIST_DIR, 'index.md'), indexMarkdown(posts));
  writeFileSync(join(DIST_DIR, 'posts.json'), JSON.stringify(posts, null, 2) + '\n');
  console.log(`✅ blog/index.html, blog/index.md, blog/posts.json (${posts.length} posts)`);
}

build();
