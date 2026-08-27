/**
 * Server-side entry used by scripts/prerender.mjs at build time.
 * Renders the public pages to static HTML (same markup the client hydrates)
 * and returns their <head> metadata + JSON-LD from one source of truth.
 */
import { Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import Landing, { FAQ, LANDING_META } from './pages/Landing';
import {
  About, Contact, Privacy, Developers, NotFoundPage,
  ABOUT_META, CONTACT_META, PRIVACY_META, DEVELOPERS_META, NOTFOUND_META,
  type PageMeta,
} from './pages/StaticPages';

const SITE = 'https://basemail.ai';

const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'BaseMail',
  url: `${SITE}/`,
  logo: { '@type': 'ImageObject', url: `${SITE}/logo.png`, width: 512, height: 512 },
  description: 'Email and identity layer for AI agents on Base.',
  foundingDate: '2026',
  email: 'cloudlobst3r@basemail.ai',
  contactPoint: [
    { '@type': 'ContactPoint', contactType: 'customer support', email: 'cloudlobst3r@basemail.ai', url: `${SITE}/contact`, availableLanguage: ['en', 'zh-Hant'] },
    { '@type': 'ContactPoint', contactType: 'technical support', email: 'cloudlobst3r@basemail.ai', url: `${SITE}/developers` },
  ],
  address: { '@type': 'PostalAddress', addressLocality: 'Taipei', addressCountry: 'TW' },
  sameAs: ['https://github.com/dAAAb/BaseMail', 'https://x.com/Basemail_ai'],
};

const WEBSITE = {
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  url: `${SITE}/`,
  name: 'BaseMail',
  publisher: { '@id': `${SITE}/#organization` },
  inLanguage: 'en',
};

const SOFTWARE = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE}/#software`,
  name: 'BaseMail',
  url: `${SITE}/`,
  description: LANDING_META.description,
  applicationCategory: 'CommunicationApplication',
  operatingSystem: 'Any',
  softwareVersion: '2.0.0',
  offers: [
    { '@type': 'Offer', name: 'Internal email', price: '0', priceCurrency: 'USD', description: 'Email between @basemail.ai addresses is free and unlimited.' },
    { '@type': 'Offer', name: 'External email credit', price: '0.002', priceCurrency: 'USD', description: 'One credit per email delivered to an external provider; 10 free credits per account.' },
  ],
  featureList: ['Sign-In with Ethereum authentication', 'ERC-8004 agent identity', 'Basename handles', 'Lens Protocol social graph', '$ATTN attention economy', 'OpenAPI 3.1 API', 'MCP server'],
  author: { '@id': `${SITE}/#organization` },
  publisher: { '@id': `${SITE}/#organization` },
  potentialAction: [
    { '@type': 'RegisterAction', name: 'Register an agent', target: 'https://api.basemail.ai/api/auth/agent-register' },
    { '@type': 'SendAction', name: 'Send email', target: 'https://api.basemail.ai/api/send' },
  ],
};

function faqJsonLd() {
  return {
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

function webPage(meta: PageMeta, extra: Record<string, unknown> = {}) {
  return {
    '@type': 'WebPage',
    '@id': `${SITE}${meta.path === '/404' ? '/404' : meta.path}#webpage`,
    url: `${SITE}${meta.path}`,
    name: meta.title,
    description: meta.description,
    isPartOf: { '@id': `${SITE}/#website` },
    about: { '@id': `${SITE}/#organization` },
    inLanguage: 'en',
    ...extra,
  };
}

function breadcrumb(meta: PageMeta, label: string) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'BaseMail', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: label, item: `${SITE}${meta.path}` },
    ],
  };
}

export type RenderedPage = {
  path: string;          // URL path
  outFile: string;       // file inside dist/
  html: string;          // #root inner HTML
  meta: PageMeta;
  jsonLd: unknown;       // full JSON-LD graph for <head>
  status: number;
};

function render(element: React.ReactElement, path: string) {
  // Mirror main.tsx: the client tree wraps routes in <Suspense>, so the server must emit
  // the matching boundary markers or React 19 reports a hydration mismatch (#418).
  return renderToString(<StaticRouter location={path}><Suspense fallback={null}>{element}</Suspense></StaticRouter>);
}

export function renderAll(): RenderedPage[] {
  const pages: RenderedPage[] = [];

  pages.push({
    path: '/',
    outFile: 'index.html',
    html: render(<Landing />, '/'),
    meta: { path: '/', title: LANDING_META.title, description: LANDING_META.description },
    jsonLd: { '@context': 'https://schema.org', '@graph': [ORGANIZATION, WEBSITE, SOFTWARE, webPage({ path: '/', title: LANDING_META.title, description: LANDING_META.description }, { mainEntity: { '@id': `${SITE}/#software` } }), faqJsonLd()] },
    status: 200,
  });

  const statics: [PageMeta, React.ReactElement, string][] = [
    [ABOUT_META, <About />, 'About'],
    [CONTACT_META, <Contact />, 'Contact'],
    [PRIVACY_META, <Privacy />, 'Privacy'],
    [DEVELOPERS_META, <Developers />, 'Developers'],
  ];
  for (const [meta, el, label] of statics) {
    pages.push({
      path: meta.path,
      outFile: `${meta.path.slice(1)}/index.html`,
      html: render(el, meta.path),
      meta,
      jsonLd: { '@context': 'https://schema.org', '@graph': [ORGANIZATION, WEBSITE, webPage(meta), breadcrumb(meta, label)] },
      status: 200,
    });
  }

  pages.push({
    path: '/404',
    outFile: '404.html',
    html: render(<NotFoundPage />, '/this-page-does-not-exist'),
    meta: NOTFOUND_META,
    jsonLd: { '@context': 'https://schema.org', '@graph': [ORGANIZATION, WEBSITE] },
    status: 404,
  });

  return pages;
}
