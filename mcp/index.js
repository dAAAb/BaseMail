#!/usr/bin/env node
/**
 * BaseMail MCP Server
 *
 * Model Context Protocol server for BaseMail — email for AI agents on Base.
 * Lets Claude, Cursor, and any other MCP client register an @basemail.ai
 * address, send and read email, look up ERC-8004 identities and manage
 * API keys. Talks to https://api.basemail.ai over stdio.
 *
 * Environment variables (all optional):
 *   BASEMAIL_API_KEY      bm_live_… key from POST /api/keys/create (preferred, long-lived)
 *   BASEMAIL_TOKEN        JWT from POST /api/auth/agent-register (24h)
 *   BASEMAIL_PRIVATE_KEY  0x-prefixed wallet private key. If set, the server
 *                         performs the full SIWE flow itself (viem), so
 *                         `basemail_register` and every authenticated tool
 *                         work with this single variable.
 *   BASEMAIL_API_URL      API base URL override (default https://api.basemail.ai)
 *
 * Never writes to stdout except MCP protocol frames; diagnostics go to stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const VERSION = '1.0.0';
const API = (process.env.BASEMAIL_API_URL || 'https://api.basemail.ai').replace(/\/+$/, '');
const SITE = 'https://basemail.ai';
const FETCH_TIMEOUT_MS = 30_000;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/* ─── CLI flags (no MCP session) ─────────────────────────────────────── */

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  process.stdout.write(`basemail-mcp ${VERSION}\n`);
  process.exit(0);
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(
    `basemail-mcp ${VERSION} — MCP server for BaseMail (${SITE})\n\n` +
      `Runs as an MCP stdio server; add it to your MCP client config.\n\n` +
      `Env: BASEMAIL_API_KEY | BASEMAIL_TOKEN | BASEMAIL_PRIVATE_KEY (see README)\n`
  );
  process.exit(0);
}

/* ─── Auth state ─────────────────────────────────────────────────────── */

function normalizePrivateKey(raw) {
  if (!raw) return '';
  let k = String(raw).trim();
  if (!k) return '';
  if (!k.startsWith('0x')) k = `0x${k}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    console.error('[basemail-mcp] BASEMAIL_PRIVATE_KEY is not a 32-byte hex key; ignoring it.');
    return '';
  }
  return k;
}

const auth = {
  apiKey: (process.env.BASEMAIL_API_KEY || '').trim(),
  envToken: (process.env.BASEMAIL_TOKEN || '').trim(),
  privateKey: normalizePrivateKey(process.env.BASEMAIL_PRIVATE_KEY),
  sessionToken: '', // JWT obtained in-process via SIWE
  account: null, // viem LocalAccount (lazy)
  identity: null, // last agent-register response, minus tokens
};

if (auth.apiKey && !auth.apiKey.startsWith('bm_live_')) {
  console.error('[basemail-mcp] BASEMAIL_API_KEY does not look like a bm_live_ key; sending it anyway.');
}

async function getAccount() {
  if (!auth.privateKey) return null;
  if (!auth.account) {
    // Lazy import: viem is only loaded when a private key is configured.
    const { privateKeyToAccount } = await import('viem/accounts');
    auth.account = privateKeyToAccount(auth.privateKey);
  }
  return auth.account;
}

/* ─── HTTP helper ────────────────────────────────────────────────────── */

async function http(method, path, { body, query, bearer } = {}) {
  const url = new URL(`${API}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  headers['User-Agent'] = `basemail-mcp/${VERSION}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  const retryAfter = res.headers.get('retry-after');
  return { ok: res.ok, status: res.status, data, retryAfter: retryAfter ? Number(retryAfter) : undefined };
}

/* ─── SIWE (auto-registration with BASEMAIL_PRIVATE_KEY) ─────────────── */

async function siweRegister({ basename } = {}) {
  const account = await getAccount();
  if (!account) throw new Error('BASEMAIL_PRIVATE_KEY is not set');
  const address = account.address;

  const start = await http('POST', '/api/auth/start', { body: { address } });
  if (!start.ok) throw new Error(`auth/start failed (${start.status}): ${start.data.error || JSON.stringify(start.data)}`);
  const { message } = start.data;
  if (!message) throw new Error('auth/start returned no SIWE message');

  const signature = await account.signMessage({ message });

  const reg = await http('POST', '/api/auth/agent-register', {
    body: basename ? { address, signature, message, basename } : { address, signature, message },
  });
  if (!reg.ok) {
    const hint =
      reg.status === 429
        ? ` (rate limit: 5 registrations per IP per hour${reg.retryAfter ? `; retry in ${reg.retryAfter}s` : ''})`
        : '';
    throw new Error(`agent-register failed (${reg.status})${hint}: ${reg.data.error || JSON.stringify(reg.data)}`);
  }
  rememberSession(reg.data);
  return { status: reg.status, data: reg.data };
}

function rememberSession(data) {
  if (data && data.token) auth.sessionToken = data.token;
  if (data && data.handle) {
    const { token, refresh_token, ...rest } = data;
    auth.identity = rest;
  }
}

/** Resolve the bearer credential in priority order; may perform SIWE. */
async function getBearer() {
  if (auth.apiKey) return auth.apiKey;
  if (auth.envToken) return auth.envToken;
  if (auth.sessionToken) return auth.sessionToken;
  if (auth.privateKey) {
    await siweRegister();
    return auth.sessionToken;
  }
  return '';
}

const NO_AUTH_MSG =
  'Not authenticated. Set BASEMAIL_API_KEY (bm_live_…, from basemail_keys_create), ' +
  'BASEMAIL_TOKEN (JWT from basemail_register), or BASEMAIL_PRIVATE_KEY (wallet key; ' +
  'the server will sign in with SIWE automatically). Without a key, call basemail_auth_start, ' +
  'sign the message with your wallet, then basemail_register.';

/** Authenticated request with one automatic re-login on 401 (private-key mode). */
async function authed(method, path, opts = {}) {
  const bearer = await getBearer();
  if (!bearer) return { ok: false, status: 401, data: { error: NO_AUTH_MSG } };
  let res = await http(method, path, { ...opts, bearer });
  const usedEnvCred = bearer === auth.apiKey;
  if (res.status === 401 && auth.privateKey && !usedEnvCred) {
    // Env JWT or cached session expired — re-sign and retry once.
    auth.sessionToken = '';
    auth.envToken = '';
    await siweRegister();
    res = await http(method, path, { ...opts, bearer: auth.sessionToken });
  }
  return res;
}

/* ─── Tool result helpers ────────────────────────────────────────────── */

function out(res) {
  const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
  return res.ok ? { content: [{ type: 'text', text }] } : { content: [{ type: 'text', text }], isError: true };
}

function fail(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function cleanHandle(input) {
  return String(input).trim().replace(/@basemail\.ai$/i, '');
}

/* ─── Server ─────────────────────────────────────────────────────────── */

const server = new McpServer(
  { name: 'basemail', version: VERSION },
  {
    instructions:
      'BaseMail gives AI agents their own @basemail.ai email address backed by an Ethereum wallet on Base. ' +
      'Public lookups need no auth. Sending/reading mail needs a credential: BASEMAIL_API_KEY, BASEMAIL_TOKEN, ' +
      'or BASEMAIL_PRIVATE_KEY (auto SIWE). Mail between @basemail.ai addresses is free; external recipients cost 1 credit.',
  }
);

const RO = { readOnlyHint: true, openWorldHint: true };

/* Public: identity & pricing */

server.registerTool(
  'basemail_check_identity',
  {
    title: 'Check wallet / name availability',
    description:
      'Check a wallet address or Basename on BaseMail. For a wallet: the email it has/would get and whether it is registered. ' +
      'For a name: status (available | taken | reserved), on-chain Basename price and buy steps. Public, no auth.',
    inputSchema: { query: z.string().describe('Wallet address (0x…) or Basename label, e.g. "alice" or "alice.base.eth"') },
    annotations: RO,
  },
  async ({ query }) => out(await http('GET', `/api/register/check/${encodeURIComponent(query.trim())}`))
);

server.registerTool(
  'basemail_identity',
  {
    title: 'Look up an agent identity',
    description:
      'Resolve a BaseMail handle/email to its wallet, Basename, registration time and World ID status — or reverse-resolve a ' +
      'wallet address (0x…) to its handle/email. Public, no auth.',
    inputSchema: { query: z.string().describe('Handle (e.g. "alice"), email ("alice@basemail.ai") or wallet address (0x…)') },
    annotations: RO,
  },
  async ({ query }) => {
    const q = cleanHandle(query);
    const path = ADDRESS_RE.test(q) ? `/api/identity/wallet/${q}` : `/api/identity/${encodeURIComponent(q)}`;
    return out(await http('GET', path));
  }
);

server.registerTool(
  'basemail_agent_profile',
  {
    title: 'ERC-8004 agent profile',
    description: 'Get the ERC-8004 registration.json for a BaseMail handle: services, wallet, trust models, CO-QAF reputation. Public.',
    inputSchema: { handle: z.string().describe('Agent handle, e.g. "alice"') },
    annotations: RO,
  },
  async ({ handle }) => out(await http('GET', `/api/agent/${encodeURIComponent(cleanHandle(handle))}/registration.json`))
);

server.registerTool(
  'basemail_basename_price',
  {
    title: 'Basename price',
    description: 'Check on-chain availability and 1-year price of name.base.eth. Public. (Does not buy anything.)',
    inputSchema: { name: z.string().describe('Basename label without .base.eth (3–32 chars)') },
    annotations: RO,
  },
  async ({ name }) => out(await http('GET', `/api/register/price/${encodeURIComponent(name.trim().replace(/\.base\.eth$/i, ''))}`))
);

server.registerTool(
  'basemail_attention_price',
  {
    title: 'Cost to email a recipient',
    description:
      'What it costs to reach a BaseMail recipient: the $ATTN stake required (auto-staked on send, refunded when read) ' +
      'and the USDC attention-bond price if the recipient enabled bonds. Public.',
    inputSchema: { handle: z.string().describe('Recipient handle or email') },
    annotations: RO,
  },
  async ({ handle }) => {
    const h = encodeURIComponent(cleanHandle(handle));
    const [attn, bond] = await Promise.all([http('GET', `/api/attn-price/${h}`), http('GET', `/api/attention/price/${h}`)]);
    return out({ ok: attn.ok, data: { attn_stake: attn.data, attention_bond: bond.data } });
  }
);

/* Auth & registration */

server.registerTool(
  'basemail_auth_start',
  {
    title: 'Start SIWE sign-in',
    description:
      'Step 1 of manual registration/login: returns a Sign-In-With-Ethereum message (nonce valid 5 min). Sign it verbatim ' +
      'with the wallet (EIP-191 personal_sign) and pass address + signature + message to basemail_register. ' +
      'If BASEMAIL_PRIVATE_KEY is set you can skip this and call basemail_register directly. `address` defaults to the configured wallet.',
    inputSchema: { address: z.string().regex(ADDRESS_RE, 'expected 0x + 40 hex chars').optional().describe('Wallet address (0x…)') },
    annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: false },
  },
  async ({ address }) => {
    let addr = address;
    if (!addr) {
      const account = await getAccount();
      if (!account) return fail('Provide `address`, or set BASEMAIL_PRIVATE_KEY so the server knows your wallet.');
      addr = account.address;
    }
    const res = await http('POST', '/api/auth/start', { body: { address: addr } });
    if (!res.ok) return out(res);
    return out({
      ok: true,
      data: {
        address: addr,
        ...res.data,
        next_step:
          'Sign `message` exactly as-is with EIP-191 personal_sign using this wallet, then call basemail_register ' +
          '{ address, signature, message } within 5 minutes.',
      },
    });
  }
);

server.registerTool(
  'basemail_register',
  {
    title: 'Register / sign in',
    description:
      'Register the wallet on BaseMail (or sign in if already registered) and get a JWT. Free; no on-chain transaction. ' +
      'Two modes: (a) BASEMAIL_PRIVATE_KEY set → call with no arguments, the server does the whole SIWE flow; ' +
      '(b) otherwise pass address + signature + message from basemail_auth_start. The resulting JWT is cached for this ' +
      'session so basemail_send / basemail_inbox work immediately. Handle = your Basename label if the wallet owns one, else the 0x address.',
    inputSchema: {
      address: z.string().regex(ADDRESS_RE).optional().describe('Wallet address (manual mode)'),
      signature: z.string().optional().describe('EIP-191 signature of `message` (manual mode)'),
      message: z.string().optional().describe('SIWE message from basemail_auth_start (manual mode)'),
      basename: z.string().optional().describe('Optional Basename you own (alice.base.eth) to use as the handle'),
    },
    annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: true },
  },
  async ({ address, signature, message, basename }) => {
    try {
      if (signature || message) {
        if (!address || !signature || !message) return fail('Manual mode needs address, signature and message.');
        const res = await http('POST', '/api/auth/agent-register', {
          body: basename ? { address, signature, message, basename } : { address, signature, message },
        });
        if (res.ok) rememberSession(res.data);
        return out(res.ok ? { ok: true, data: { http_status: res.status, ...res.data } } : res);
      }
      if (!auth.privateKey) {
        return fail(
          'No signature given and BASEMAIL_PRIVATE_KEY is not set. Either set BASEMAIL_PRIVATE_KEY, or run ' +
            'basemail_auth_start, sign the message with your wallet, and call basemail_register { address, signature, message }.'
        );
      }
      if (address) {
        const account = await getAccount();
        if (account.address.toLowerCase() !== address.toLowerCase()) {
          return fail(`address ${address} does not match the configured BASEMAIL_PRIVATE_KEY wallet ${account.address}.`);
        }
      }
      const { status, data } = await siweRegister({ basename });
      return out({
        ok: true,
        data: {
          http_status: status,
          ...data,
          note:
            'JWT cached in this MCP session. For a long-lived credential call basemail_keys_create and store the bm_live_ key as BASEMAIL_API_KEY.',
        },
      });
    } catch (err) {
      return fail(String(err.message || err));
    }
  }
);

/* Email */

server.registerTool(
  'basemail_send',
  {
    title: 'Send email',
    description:
      'Send an email from your @basemail.ai address. Recipients at @basemail.ai are free and instant (a small $ATTN stake ' +
      'is auto-held and refunded when read). Any other recipient costs 1 credit (10 free per account). Markdown in `body` ' +
      'is rendered to HTML unless `html` is given. Requires auth.',
    inputSchema: {
      to: z.string().describe('Recipient email address'),
      subject: z.string().describe('Subject line'),
      body: z.string().describe('Plain-text or Markdown body'),
      html: z.string().optional().describe('Optional HTML body (overrides Markdown rendering)'),
      in_reply_to: z.string().optional().describe('Email ID from your inbox to reply to (threads + settles ATTN escrow)'),
    },
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  },
  async ({ to, subject, body, html, in_reply_to }) => {
    const payload = { to: to.trim(), subject, body };
    if (html) payload.html = html;
    if (in_reply_to) payload.in_reply_to = in_reply_to;
    return out(await authed('POST', '/api/send', { body: payload }));
  }
);

server.registerTool(
  'basemail_inbox',
  {
    title: 'List inbox',
    description: 'List email summaries (id, from, subject, snippet, read flag, ATTN/bond info) for the inbox or sent folder, newest first. Requires auth.',
    inputSchema: {
      folder: z.enum(['inbox', 'sent']).optional().describe('Folder (default inbox)'),
      limit: z.number().int().min(1).max(100).optional().describe('Page size, max 100 (default 20)'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    annotations: RO,
  },
  async ({ folder, limit, offset }) => out(await authed('GET', '/api/inbox', { query: { folder, limit, offset } }))
);

server.registerTool(
  'basemail_read_email',
  {
    title: 'Read email',
    description:
      'Fetch one email in full (raw RFC 822 body + attachment metadata) by ID from basemail_inbox. ' +
      'Marks it read and refunds the sender\'s $ATTN stake. Requires auth.',
    inputSchema: { id: z.string().describe('Email ID') },
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false, idempotentHint: true },
  },
  async ({ id }) => out(await authed('GET', `/api/inbox/${encodeURIComponent(id)}`))
);

/* ATTN */

server.registerTool(
  'basemail_attn_balance',
  {
    title: '$ATTN balance',
    description: 'Your off-chain $ATTN balance, daily earn cap and whether the daily drip is claimable. Requires auth.',
    inputSchema: {},
    annotations: RO,
  },
  async () => out(await authed('GET', '/api/attn/balance'))
);

/* API keys */

server.registerTool(
  'basemail_keys_create',
  {
    title: 'Create API key',
    description:
      'Create a long-lived bm_live_… API key for your handle. Shown ONCE — store it as BASEMAIL_API_KEY. ' +
      'Use it exactly like the JWT (Authorization: Bearer). Requires auth.',
    inputSchema: {
      name: z.string().max(64).optional().describe('Label for the key, e.g. "claude-desktop"'),
      scopes: z.array(z.string()).optional().describe('Informational today; default ["send","inbox"]'),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ name, scopes }) => {
    const body = {};
    if (name) body.name = name;
    if (scopes) body.scopes = scopes;
    return out(await authed('POST', '/api/keys/create', { body }));
  }
);

server.registerTool(
  'basemail_keys_list',
  {
    title: 'List API keys',
    description: 'List your API keys (id prefix, name, scopes, timestamps). Plaintext keys are never returned. Requires auth.',
    inputSchema: {},
    annotations: RO,
  },
  async () => out(await authed('GET', '/api/keys/list'))
);

server.registerTool(
  'basemail_keys_revoke',
  {
    title: 'Revoke API key',
    description: 'Revoke an API key by `key_id` (≥6-char id prefix from basemail_keys_list) or by full `api_key`. Idempotent. Requires auth.',
    inputSchema: {
      key_id: z.string().min(6).optional().describe('Key id / prefix from basemail_keys_list'),
      api_key: z.string().optional().describe('Full plaintext bm_live_… key'),
    },
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true, idempotentHint: true },
  },
  async ({ key_id, api_key }) => {
    if (!key_id && !api_key) return fail('Provide key_id or api_key.');
    return out(await authed('POST', '/api/keys/revoke', { body: key_id ? { key_id } : { api_key } }));
  }
);

/* ─── Resources ──────────────────────────────────────────────────────── */

server.registerResource(
  'llms-txt',
  'basemail://llms.txt',
  {
    title: 'BaseMail llms.txt',
    description: 'AI-readable overview of BaseMail: what it is, when to use it, how to call it.',
    mimeType: 'text/markdown',
  },
  async (uri) => {
    const res = await fetch(`${SITE}/llms.txt`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await res.text() }] };
  }
);

server.registerResource(
  'api-docs',
  'basemail://docs',
  {
    title: 'BaseMail API docs',
    description: 'Agent-readable API guide (JSON) with request bodies, examples and cURL for every endpoint.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const res = await http('GET', '/api/docs');
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(res.data, null, 2) }] };
  }
);

server.registerResource(
  'openapi',
  'basemail://openapi.json',
  {
    title: 'BaseMail OpenAPI 3.1',
    description: 'Full OpenAPI document — typed schemas for every operation.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const res = await http('GET', '/api/openapi.json');
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(res.data, null, 2) }] };
  }
);

/* ─── Start ──────────────────────────────────────────────────────────── */

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[basemail-mcp] ${VERSION} ready — auth: ${
    auth.apiKey ? 'api key' : auth.envToken ? 'token' : auth.privateKey ? 'private key (auto SIWE)' : 'none (public tools only)'
  }`
);
