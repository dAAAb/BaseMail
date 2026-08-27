/**
 * Agent-discovery surface served on the API host (api.basemail.ai).
 *
 * Static-text routes only: /llms.txt, /robots.txt, /.well-known/openapi.json,
 * /.well-known/ai-plugin.json, /api/versions. Mounted from index.ts via
 * `app.route('/', discoveryRoutes)`.
 */
import { Hono } from 'hono';
import { AppBindings } from './types';
import {
  REGISTER_PER_IP_PER_HOUR,
  SPONSORED_BASENAME_PER_IP_PER_DAY,
  EXTERNAL_SEND_PER_IP_PER_HOUR,
  EXTERNAL_SEND_PER_HANDLE_PER_HOUR,
} from './ratelimit';

export const API_VERSION = '2.0.0';
export const API_VERSION_HEADER = 'X-API-Version';

/** Same sentence as the OpenAPI `x-versioning` policy. */
export const VERSIONING_POLICY =
  'Breaking changes ship under a new path prefix; deprecated endpoints get at least 90 days notice via Deprecation and Sunset response headers; additive changes (new fields, new endpoints) are not breaking.';

export const discoveryRoutes = new Hono<AppBindings>();

function apiBase(domain: string | undefined): string {
  return `https://api.${domain || 'basemail.ai'}`;
}

function siteBase(domain: string | undefined): string {
  return `https://${domain || 'basemail.ai'}`;
}

/** llms.txt — https://llmstxt.org spec (H1, blockquote summary, H2 sections of link lists). */
export function buildLlmsTxt(domain: string | undefined): string {
  const API = apiBase(domain);
  const SITE = siteBase(domain);
  const mailDomain = domain || 'basemail.ai';
  return `# BaseMail API

> Email for AI agents on Base chain. Any EVM wallet (or Basename) signs in with SIWE and gets a verifiable \`@${mailDomain}\` inbox it can read and send from over a JSON API — no browser, no password, no API key to provision. Optional $ATTN Attention Bonds price inbound email so agents can charge for their attention and reject spam. ERC-8004 compatible.

Base URL: \`${API}\`. All responses are JSON unless noted; errors are \`{ "error": string, "code"?: string }\`. Every response carries \`${API_VERSION_HEADER}: ${API_VERSION}\`.

## Docs

- [OpenAPI 3.1 JSON](${API}/api/openapi.json): machine-readable spec (operations, auth, payment metadata)
- [API reference](${API}/api/docs): hand-written JSON docs with curl examples for every endpoint
- [Developer guide](${SITE}/developers): human-readable guide, SDK snippets and changelog
- [Site llms.txt](${SITE}/llms.txt): product overview, standards, architecture
- [ERC-8004 well-known](${API}/.well-known/agent-registration.json): service-level agent registration file
- [Per-agent ERC-8004](${API}/api/agent/{handle}/registration.json): registration file for any registered handle
- [API versions](${API}/api/versions): current version, deprecation policy

## Quick start

Three calls: get a SIWE message, sign it to register, send an email.

1. \`POST ${API}/api/auth/start\` with \`{"address":"0xYOUR_WALLET"}\` -> \`{ "nonce", "message" }\`. Sign \`message\` with the wallet key (EIP-191 personal_sign).
2. \`POST ${API}/api/auth/agent-register\` with \`{"address":"0xYOUR_WALLET","signature":"0x...","message":"<message from step 1>","basename":"(optional) you.base.eth"}\` -> \`{ "token", "email", "handle", "wallet", "registered" }\`. Save \`token\` (JWT, 24 h; refresh via \`POST /api/auth/refresh\`).
3. \`POST ${API}/api/send\` with header \`Authorization: Bearer <token>\` and \`{"to":"someone@example.com","subject":"Hello","body":"Hi from my agent"}\` -> \`{ "success": true, "email_id" }\`. The message field is \`body\` (not \`text\`).

Read mail with \`GET ${API}/api/inbox\` (same Bearer header). Check a name first with \`GET ${API}/api/register/check/{name}\`.

Example:

\`\`\`bash
curl -X POST ${API}/api/auth/start -H "Content-Type: application/json" -d '{"address":"0xYOUR_WALLET"}'
curl -X POST ${API}/api/auth/agent-register -H "Content-Type: application/json" -d '{"address":"0xYOUR_WALLET","signature":"0xSIGNED","message":"MESSAGE_FROM_STEP_1"}'
curl -X POST ${API}/api/send -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"to":"someone@example.com","subject":"Hello","body":"Hi from my agent"}'
\`\`\`

## When to use BaseMail

- Give an autonomous agent its own inbox and sender identity (\`agent@${mailDomain}\`) tied to a wallet it controls, without a human creating a mailbox for it.
- Receive verification / magic-link / OTP emails when an agent signs up for third-party services, then read them back via \`GET /api/inbox\`.
- Agent-to-agent email over wallet-verified identities: internal \`@${mailDomain}\` mail is free and unlimited, and the sender's wallet is cryptographically bound to the address.
- Resolve a wallet address or Basename (\`.base.eth\`) to an email address, or an email handle back to its wallet, via \`GET /api/identity/{query}\`.
- Stake $ATTN to reach a recipient who prices their attention (\`GET /api/attn-price/{handle}\`), or earn $ATTN by rejecting spam sent to your own inbox.
- Publish and consume ERC-8004 agent registration files so other agents can discover your capabilities and trust signals.

## Limits

- Registrations: ${REGISTER_PER_IP_PER_HOUR} per IP per hour; sponsored Basename registrations: ${SPONSORED_BASENAME_PER_IP_PER_DAY} per IP per day.
- External email (to non-\`@${mailDomain}\` addresses), free tier: ${EXTERNAL_SEND_PER_IP_PER_HOUR} per IP per hour and ${EXTERNAL_SEND_PER_HANDLE_PER_HOUR} per handle per hour; new accounts get 10 free external emails (credits), then $0.01 each.
- Internal \`@${mailDomain}\` email: free, unlimited.
- Unregistered \`0x...@${mailDomain}\` addresses pre-store at most 10 inbound emails (30-day TTL) until the wallet registers.
- Over-limit responses are HTTP 429 with \`code: "rate_limited"\`, \`Retry-After\`, and \`RateLimit-Limit\` / \`RateLimit-Remaining\` / \`RateLimit-Reset\` headers.
- JWT tokens expire after 24 h; use \`POST /api/auth/refresh\` or re-run the SIWE flow.

## Optional

- [ERC-8004 spec](https://eips.ethereum.org/EIPS/eip-8004): agent registration file format BaseMail implements
- [Attention Bonds / CO-QAF paper](https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/): the economics behind $ATTN
- [ai-plugin.json](${API}/.well-known/ai-plugin.json): plugin manifest pointing at the OpenAPI spec
- [agents.json](${SITE}/.well-known/agents.json): open-agents.org capability manifest
- [robots.txt](${API}/robots.txt): crawl rules for the API host
- Contact: cloudlobst3r@${mailDomain}
`;
}

discoveryRoutes.get('/llms.txt', (c) => {
  return c.text(buildLlmsTxt(c.env.DOMAIN), 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
});

discoveryRoutes.get('/robots.txt', (c) => {
  const SITE = siteBase(c.env.DOMAIN);
  return c.text(
    `User-agent: *\nDisallow: /api/inbox\nDisallow: /api/send\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`,
    200,
    { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  );
});

discoveryRoutes.get('/.well-known/openapi.json', (c) => c.redirect('/api/openapi.json', 301));

// Mirror of web/public/.well-known/ai-plugin.json (Pages origin), served on the API host too.
discoveryRoutes.get('/.well-known/ai-plugin.json', (c) => {
  const API = apiBase(c.env.DOMAIN);
  const SITE = siteBase(c.env.DOMAIN);
  return c.json({
    schema_version: 'v1',
    name_for_human: 'BaseMail — Email for AI agents',
    name_for_model: 'basemail',
    description_for_human:
      'Email for AI agents on Base chain. Every wallet gets a verifiable @basemail.ai address. ERC-8004 compatible.',
    description_for_model:
      'BaseMail provides email identity for AI agents on Base chain. Use SIWE (Sign-In with Ethereum) to register — no API keys needed. Wallet address = identity. Supports Basename integration (.base.eth → @basemail.ai), Attention Bonds (economic spam prevention via Quadratic Funding), and Lens Protocol social graph. Internal emails between @basemail.ai addresses are free. Quick start: POST /api/auth/start to get SIWE message, POST /api/auth/agent-register to register, POST /api/send to send email.',
    auth: { type: 'none' },
    api: { type: 'openapi', url: `${API}/api/openapi.json` },
    logo_url: `${SITE}/logo.png`,
    contact_email: 'cloudlobst3r@basemail.ai',
    legal_info_url: `${SITE}/privacy`,
  });
});

discoveryRoutes.get('/api/versions', (c) => {
  const SITE = siteBase(c.env.DOMAIN);
  return c.json({
    current: API_VERSION,
    header: API_VERSION_HEADER,
    deprecated: [],
    policy: VERSIONING_POLICY,
    changelog: `${SITE}/developers#changelog`,
  });
});
