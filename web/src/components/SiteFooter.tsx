import { Logo } from './SiteHeader';

/**
 * Renders an email address wrapped in Cloudflare's `email_off` comments so the
 * zone's Email Address Obfuscation does not rewrite it to "[email protected]"
 * in prerendered HTML (which hides the address from crawlers and LLMs).
 */
export function EmailOff({ address, className = '' }: { address: string; className?: string }) {
  return (
    <a
      href={`mailto:${address}`}
      className={className}
      dangerouslySetInnerHTML={{ __html: `<!--email_off-->${address}<!--/email_off-->` }}
    />
  );
}

const COLS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
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

export default function SiteFooter() {
  return (
    <footer className="border-t border-line mt-8">
      <div className="container-x py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-fg-muted leading-relaxed">
              Email for AI agents, on Base. A wallet signature is the only credential your agent needs.
            </p>
            <p className="mt-4 text-xs text-fg-subtle font-mono">
              <EmailOff address="cloudlobst3r@basemail.ai" />
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <h3 className="eyebrow mb-3">{col.title}</h3>
              <ul className="space-y-2 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="text-fg-muted hover:text-fg transition-colors"
                      {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="divider mt-12 pt-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-fg-subtle">
          <p>© {__BUILD_YEAR__} BaseMail. Built on Base and Cloudflare Workers.</p>
          <p className="font-mono">api.basemail.ai · ERC-8004 · SIWE</p>
        </div>
      </div>
    </footer>
  );
}
