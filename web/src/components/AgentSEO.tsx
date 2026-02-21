import { useEffect } from 'react';

interface Props {
  handle: string;
  name: string;
  description: string;
  image: string;
  wallet?: string | null;
  lensHandle?: string | null;
  emailsReceived?: number;
  totalBondsUsdc?: number;
}

export default function AgentSEO({
  handle, name, description, image, wallet, lensHandle,
  emailsReceived, totalBondsUsdc,
}: Props) {
  useEffect(() => {
    // Dynamic document title
    document.title = `${name} (@${handle}) — AI Agent Profile | BaseMail ERC-8004`;

    // Meta tags
    const metas: Record<string, string> = {
      description: `${name} is an AI agent on BaseMail with ERC-8004 identity. ${description}${lensHandle ? ` Connected to Lens Protocol (@${lensHandle}).` : ''} Attention Bonds powered by Quadratic Funding.`,
      keywords: `${handle}, ${name}, AI agent, ERC-8004, agent profile, BaseMail, Lens Protocol, attention bonds, quadratic funding, Base chain, onchain identity, agentic email, Æmail${lensHandle ? `, ${lensHandle}, Lens social graph` : ''}`,
      robots: 'index, follow',

      // OpenGraph
      'og:title': `${name} — AI Agent on BaseMail`,
      'og:description': `ERC-8004 registered agent.${emailsReceived ? ` ${emailsReceived} emails received.` : ''}${totalBondsUsdc ? ` $${totalBondsUsdc.toFixed(2)} bonded.` : ''}${lensHandle ? ` Lens: @${lensHandle}` : ''}`,
      'og:image': image,
      'og:url': `https://basemail.ai/agent/${handle}`,
      'og:type': 'profile',
      'og:site_name': 'BaseMail — Æmail for AI Agents',

      // Twitter Card
      'twitter:card': 'summary',
      'twitter:title': `${name} — AI Agent Profile`,
      'twitter:description': `ERC-8004 identity on BaseMail. ${description.slice(0, 150)}`,
      'twitter:image': image,
    };

    const cleanup: HTMLMetaElement[] = [];

    for (const [key, value] of Object.entries(metas)) {
      const isOg = key.startsWith('og:');
      const isTwitter = key.startsWith('twitter:');
      const attr = isOg || isTwitter ? 'property' : 'name';

      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
        cleanup.push(el);
      }
      el.setAttribute('content', value);
    }

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const createdCanonical = !canonical;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `https://basemail.ai/agent/${handle}`;

    // JSON-LD Structured Data (AI Agent schema)
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name,
      description,
      url: `https://basemail.ai/agent/${handle}`,
      image,
      applicationCategory: 'AI Agent',
      operatingSystem: 'Base Chain (EVM)',
      identifier: {
        '@type': 'PropertyValue',
        name: 'ERC-8004 Agent Handle',
        value: handle,
      },
      ...(wallet ? {
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'wallet', value: wallet },
          { '@type': 'PropertyValue', name: 'chain', value: 'Base (8453)' },
          { '@type': 'PropertyValue', name: 'standard', value: 'ERC-8004' },
          ...(lensHandle ? [{ '@type': 'PropertyValue', name: 'lens', value: lensHandle }] : []),
        ],
      } : {}),
      offers: {
        '@type': 'Offer',
        name: 'Attention Bond',
        description: 'Stake USDC to get priority email attention from this AI agent',
        priceCurrency: 'USD',
      },
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);

    return () => {
      cleanup.forEach(el => el.remove());
      script.remove();
      if (createdCanonical && canonical) canonical.remove();
      document.title = 'BaseMail — Æmail for AI Agents on Base';
    };
  }, [handle, name, description, image, wallet, lensHandle, emailsReceived, totalBondsUsdc]);

  // Also render hidden semantic HTML for crawlers that don't execute JS well
  return (
    <div className="sr-only" aria-hidden="true">
      <h1>{name} — AI Agent Profile on BaseMail</h1>
      <p>ERC-8004 registered AI agent. {description}</p>
      <p>Email: {handle}@basemail.ai | Standard: ERC-8004 | Chain: Base</p>
      {lensHandle && <p>Lens Protocol: @{lensHandle} — Decentralized social graph on Lens Chain</p>}
      <p>Attention Bonds: Quadratic Funding mechanism for agent email priority</p>
      <p>Keywords: AI agent identity, ERC-8004, onchain agent registry, BaseMail, Æmail, agentic email, Base chain, Lens Protocol, social graph, attention bonds, quadratic funding, CO-QAF</p>
    </div>
  );
}
