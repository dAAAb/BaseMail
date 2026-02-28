#!/usr/bin/env node
/**
 * Build blog markdown → static HTML in dist/blog/
 * Run AFTER vite build (dist/ must exist).
 * 
 * Usage: node scripts/build-blog.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const CONTENT_DIR = join(import.meta.dirname, '..', 'content', 'blog');
const DIST_DIR = join(import.meta.dirname, '..', 'dist', 'blog');

// Simple markdown → HTML (no dependencies)
function md2html(md) {
  let html = md
    // Code blocks (fenced)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="language-${lang || 'text'}">${esc(code.trim())}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
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
      if (/^<(h[1-6]|ul|ol|pre|table|div|hr|section)/.test(block)) return block;
      return `<p>${block}</p>`;
    })
    .join('\n\n');

  return html;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// Blog page template
function blogTemplate(meta, bodyHtml, slug, heroImage) {
  const title = meta.title || 'Blog Post';
  const description = meta.description || title;
  const published = meta.published || new Date().toISOString().slice(0, 10);
  const tags = meta.tags || '';
  const keywords = tags.split(',').map(t => t.trim()).filter(Boolean).join(', ');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} | BaseMail Blog</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="keywords" content="BaseMail, Æmail, AI agent email, ${esc(keywords)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://basemail.ai/blog/${slug}" />
  
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="https://basemail.ai/blog/${slug}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="BaseMail Blog" />
  <meta property="article:published_time" content="${published}" />
  
  ${heroImage ? `<meta property="og:image" content="https://basemail.ai${heroImage}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  ${heroImage ? `<meta name="twitter:image" content="https://basemail.ai${heroImage}" />` : ''}
  
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": title,
    "description": description,
    "datePublished": published,
    "author": { "@type": "Organization", "name": "BaseMail" },
    "publisher": { "@type": "Organization", "name": "BaseMail", "url": "https://basemail.ai" },
    "url": `https://basemail.ai/blog/${slug}`,
    "about": ["AI Agent Email", "ERC-8004", "Onchain Identity"],
  }, null, 2)}
  </script>
  
  <style>
    :root { --bg: #0a0a0a; --fg: #e5e5e5; --muted: #888; --blue: #0052FF; --card: #141414; --border: #222; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; font-size: 15px; }
    .nav { max-width: 680px; margin: 0 auto; padding: 24px 20px; display: flex; justify-content: space-between; align-items: center; }
    .nav a { color: var(--muted); text-decoration: none; font-size: 14px; }
    .nav a:hover { color: white; }
    .logo { display: flex; align-items: center; gap: 8px; font-weight: bold; color: white; text-decoration: none; font-size: 18px; }
    .logo span { background: var(--blue); color: white; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; }
    
    article { max-width: 680px; margin: 0 auto; padding: 20px 20px 80px; }
    article h1 { font-size: 1.8em; line-height: 1.2; margin-bottom: 10px; }
    .meta { color: var(--muted); font-size: 13px; margin-bottom: 32px; }
    article h2 { font-size: 1.3em; margin: 32px 0 12px; color: white; }
    article h3 { font-size: 1.1em; margin: 24px 0 8px; color: white; }
    article p { margin-bottom: 12px; color: #ccc; line-height: 1.6; }
    article a { color: var(--blue); text-decoration: underline; }
    article ul, article ol { margin: 0 0 12px 20px; color: #ccc; }
    article li { margin-bottom: 3px; }
    article strong { color: white; }
    article code { background: var(--card); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; color: #ddd; }
    article pre { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin: 16px 0; overflow-x: auto; }
    article pre code { background: none; padding: 0; font-size: 13px; line-height: 1.6; }
    article hr { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
    .table-wrapper { overflow-x: auto; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 10px 16px; background: var(--card); border-bottom: 2px solid var(--border); color: white; font-weight: 600; }
    td { padding: 10px 16px; border-bottom: 1px solid var(--border); color: #ccc; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    
    .cta { background: linear-gradient(135deg, rgba(0,82,255,0.1), rgba(0,82,255,0.05)); border: 1px solid rgba(0,82,255,0.2); border-radius: 12px; padding: 32px; text-align: center; margin-top: 40px; }
    .cta h3 { color: white; margin-bottom: 8px; }
    .cta p { color: var(--muted); margin-bottom: 16px; }
    .cta a.btn { display: inline-block; background: var(--blue); color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 4px; }
    .cta a.btn:hover { background: #0040cc; }
    
    footer { border-top: 1px solid var(--border); padding: 24px 20px; text-align: center; color: var(--muted); font-size: 12px; max-width: 720px; margin: 0 auto; }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/" class="logo"><span>BM</span> BaseMail</a>
    <div style="display:flex;gap:16px">
      <a href="/blog">Blog</a>
      <a href="https://api.basemail.ai/api/docs">API</a>
      <a href="/dashboard">Dashboard</a>
    </div>
  </nav>
  
  <article>
    ${heroImage ? `<img src="${heroImage}" alt="${esc(title)}" style="width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:12px;margin-bottom:24px" />` : ''}
    <h1>${esc(title)}</h1>
    <div class="meta">${published} · ${meta.author || 'BaseMail Team'}${tags ? ` · ${tags}` : ''}</div>
    ${bodyHtml}
  </article>
  
  <footer>
    <p>BaseMail.ai — Æmail for AI Agents on Base Chain</p>
  </footer>
</body>
</html>`;
}

// Blog index template
function indexTemplate(posts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Blog | BaseMail — Æmail for AI Agents</title>
  <meta name="description" content="Articles about AI agent identity, onchain email, ERC-8004, Attention Bonds, and the future of agent-to-agent communication." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://basemail.ai/blog" />
  
  <meta property="og:title" content="BaseMail Blog" />
  <meta property="og:description" content="Articles about AI agent identity, onchain email, and the future of agent communication." />
  <meta property="og:url" content="https://basemail.ai/blog" />
  <meta property="og:type" content="website" />
  
  <style>
    :root { --bg: #0a0a0a; --fg: #e5e5e5; --muted: #888; --blue: #0052FF; --card: #141414; --border: #222; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; }
    .nav { max-width: 720px; margin: 0 auto; padding: 24px 20px; display: flex; justify-content: space-between; align-items: center; }
    .nav a { color: var(--muted); text-decoration: none; font-size: 14px; }
    .nav a:hover { color: white; }
    .logo { display: flex; align-items: center; gap: 8px; font-weight: bold; color: white; text-decoration: none; font-size: 18px; }
    .logo span { background: var(--blue); color: white; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
    
    main { max-width: 720px; margin: 0 auto; padding: 20px 20px 80px; }
    h1 { font-size: 2.5em; margin-bottom: 8px; }
    .subtitle { color: var(--muted); margin-bottom: 40px; font-size: 16px; }
    
    .post { display: block; background: var(--card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 24px; text-decoration: none; transition: border-color 0.2s; overflow: hidden; }
    .post:hover { border-color: rgba(0,82,255,0.4); }
    .post .hero { width: 100%; aspect-ratio: 3/2; object-fit: cover; display: block; }
    .post .content { padding: 24px; }
    .post h2 { color: white; font-size: 1.3em; margin-bottom: 8px; }
    .post p { color: var(--muted); font-size: 14px; margin-bottom: 8px; }
    .post .date { color: #555; font-size: 12px; }
    
    footer { border-top: 1px solid var(--border); padding: 24px 20px; text-align: center; color: var(--muted); font-size: 12px; max-width: 720px; margin: 0 auto; }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/" class="logo"><span>BM</span> BaseMail</a>
    <div style="display:flex;gap:16px">
      <a href="/blog">Blog</a>
      <a href="https://api.basemail.ai/api/docs">API</a>
      <a href="/dashboard">Dashboard</a>
    </div>
  </nav>
  
  <main>
    <h1>Blog</h1>
    <p class="subtitle">Thoughts on AI agent identity, onchain email, and the future of agent communication.</p>
    
    ${posts.map(p => `
    <a href="/blog/${p.slug}" class="post">
      ${p.heroImage ? `<img class="hero" src="${p.heroImage}" alt="${esc(p.title)}" loading="lazy" />` : ''}
      <div class="content">
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.description)}</p>
        <div class="date">${p.published}${p.tags ? ` · ${p.tags}` : ''}</div>
      </div>
    </a>`).join('\n')}
  </main>
  
  <footer>
    <p>BaseMail.ai — Æmail for AI Agents on Base Chain</p>
  </footer>
</body>
</html>`;
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
    
    posts.push({
      slug,
      title: meta.title || slug,
      description: meta.description || '',
      published: meta.published || '',
      tags: meta.tags || '',
      heroImage,
    });
    
    console.log(`✅ ${slug}/index.html`);
  }
  
  // Sort by date descending
  posts.sort((a, b) => b.published.localeCompare(a.published));
  
  // Write index
  writeFileSync(join(DIST_DIR, 'index.html'), indexTemplate(posts));
  console.log(`✅ blog/index.html (${posts.length} posts)`);
}

build();
