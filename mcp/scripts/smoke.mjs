#!/usr/bin/env node
/**
 * End-to-end smoke test for the BaseMail MCP server over stdio, against production.
 *
 * Speaks raw JSON-RPC (newline-delimited) to `node index.js`:
 *   initialize → tools/list → resources/list → basemail_check_identity
 *   → basemail_register (fresh throwaway wallet, BASEMAIL_PRIVATE_KEY)
 *   → basemail_send (internal, to itself) → basemail_inbox → basemail_read_email
 *   → basemail_attn_balance → basemail_keys_create → keys_list → keys_revoke
 *
 * Flags / env:
 *   --public-only          skip everything that needs a wallet (no registration)
 *   --cmd "<command>"      spawn this instead of `node index.js` (e.g. a packed npx binary)
 *   SMOKE_PRIVATE_KEY      reuse a wallet instead of generating one (registration is
 *                          rate-limited to 5 per IP per hour)
 *
 * Secrets (tokens, API keys, signatures, private key) are redacted from all output.
 * Never buys a Basename, never sends to an external address.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const argv = process.argv.slice(2);
const PUBLIC_ONLY = argv.includes('--public-only');
const cmdIdx = argv.indexOf('--cmd');
const CMD = cmdIdx >= 0 ? argv[cmdIdx + 1] : null;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PRINT = 700;

/* ─── wallet ─────────────────────────────────────────────────────────── */

let privateKey = '';
let address = '';
if (!PUBLIC_ONLY) {
  const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
  privateKey = process.env.SMOKE_PRIVATE_KEY || generatePrivateKey();
  address = privateKeyToAccount(privateKey).address;
  log(`wallet: ${address} (${process.env.SMOKE_PRIVATE_KEY ? 'reused from SMOKE_PRIVATE_KEY' : 'fresh throwaway, key not printed'})`);
}

/* ─── spawn server ───────────────────────────────────────────────────── */

const env = { ...process.env };
delete env.BASEMAIL_API_KEY;
delete env.BASEMAIL_TOKEN;
delete env.SMOKE_PRIVATE_KEY;
if (privateKey) env.BASEMAIL_PRIVATE_KEY = privateKey;
else delete env.BASEMAIL_PRIVATE_KEY;

const child = CMD
  ? spawn(CMD, { shell: true, env, stdio: ['pipe', 'pipe', 'pipe'] })
  : spawn(process.execPath, [path.join(ROOT, 'index.js')], { env, stdio: ['pipe', 'pipe', 'pipe'] });

child.stderr.on('data', (d) => process.stderr.write(`  [server] ${redact(String(d))}`));

const pending = new Map();
let nextId = 1;
createInterface({ input: child.stdout }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    log(`non-JSON line from server: ${line.slice(0, 200)}`);
    return;
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    msg.error ? reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`)) : resolve(msg.result);
  }
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}
function call(method, params = {}, timeoutMs = 60_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    send({ jsonrpc: '2.0', id, method, params });
  });
}
async function tool(name, args = {}) {
  const res = await call('tools/call', { name, arguments: args });
  const text = (res.content || []).map((c) => c.text || '').join('\n');
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { isError: !!res.isError, text, data };
}

/* ─── output helpers ─────────────────────────────────────────────────── */

const SECRET_KEYS = new Set(['token', 'refresh_token', 'api_key', 'signature', 'private_key', 'privateKey']);
function redact(input) {
  let s = String(input);
  if (privateKey) s = s.split(privateKey).join('<private-key>');
  s = s.replace(/bm_live_[0-9a-f]{6}[0-9a-f]*/g, (m) => `${m.slice(0, 14)}…<redacted>`);
  s = s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, 'eyJ…<jwt redacted>');
  s = s.replace(/0x[0-9a-f]{130}/gi, '0x…<signature redacted>');
  return s;
}
function redactObj(v) {
  if (Array.isArray(v)) return v.map(redactObj);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      o[k] = SECRET_KEYS.has(k) && typeof val === 'string' ? `<redacted len=${val.length}>` : redactObj(val);
    }
    return o;
  }
  return typeof v === 'string' ? redact(v) : v;
}
function log(msg) {
  process.stdout.write(`${msg}\n`);
}
function show(label, r, max = MAX_PRINT) {
  const body = r.data !== null ? JSON.stringify(redactObj(r.data)) : redact(r.text);
  const trimmed = body.length > max ? `${body.slice(0, max)}… (${body.length} chars)` : body;
  log(`${r.isError ? 'FAIL' : ' ok '} ${label}\n      ${trimmed}`);
  return r;
}

let failures = 0;
function expect(cond, what) {
  if (!cond) {
    failures++;
    log(`FAIL expectation: ${what}`);
  }
}

/* ─── sequence ───────────────────────────────────────────────────────── */

try {
  const init = await call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'basemail-smoke', version: '1.0.0' },
  });
  log(` ok  initialize → server ${init.serverInfo?.name}@${init.serverInfo?.version}, protocol ${init.protocolVersion}, caps ${Object.keys(init.capabilities || {}).join(',')}`);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const tools = await call('tools/list');
  log(` ok  tools/list → ${tools.tools.length} tools: ${tools.tools.map((t) => t.name.replace(/^basemail_/, '')).join(', ')}`);
  expect(tools.tools.length >= 14, 'at least 14 tools');

  const resources = await call('resources/list');
  log(` ok  resources/list → ${resources.resources.map((r) => r.uri).join(', ')}`);

  const llms = await call('resources/read', { uri: 'basemail://llms.txt' });
  const llmsText = llms.contents?.[0]?.text || '';
  log(` ok  resources/read llms.txt → ${llmsText.length} chars, starts "${llmsText.slice(0, 40).replace(/\n/g, ' ')}"`);
  expect(llmsText.startsWith('# BaseMail'), 'llms.txt content');

  const check = show('check_identity warmwind', await tool('basemail_check_identity', { query: 'warmwind' }));
  expect(!check.isError && check.data?.handle === 'warmwind', 'check_identity returns handle warmwind');

  show('identity warmwind', await tool('basemail_identity', { query: 'warmwind' }), 300);
  show('attention_price warmwind', await tool('basemail_attention_price', { handle: 'warmwind' }), 300);

  if (PUBLIC_ONLY) {
    const noauth = await tool('basemail_attn_balance', {});
    expect(noauth.isError && /Not authenticated/.test(noauth.text), 'attn_balance without auth is a clean error');
    log(` ok  attn_balance without credentials → isError=${noauth.isError}: "${noauth.text.slice(0, 60)}…"`);
  }

  if (!PUBLIC_ONLY) {
    const reg = show('register (auto SIWE via BASEMAIL_PRIVATE_KEY)', await tool('basemail_register', {}));
    expect(!reg.isError && reg.data?.registered === true, 'register succeeded');
    if (reg.isError) throw new Error('registration failed; skipping authenticated steps');
    const email = reg.data?.email;
    expect(email === `${address.toLowerCase()}@basemail.ai`, `email is ${address.toLowerCase()}@basemail.ai`);

    const sent = show(
      `send → self (${email})`,
      await tool('basemail_send', {
        to: email,
        subject: 'MCP smoke test',
        body: 'Hello from **basemail-mcp** smoke test. Internal mail, free.',
      })
    );
    expect(!sent.isError && sent.data?.success === true && sent.data?.internal === true, 'internal send succeeded');

    // Delivery is near-instant but give the worker a moment.
    await new Promise((r) => setTimeout(r, 2000));
    const inbox = show('inbox', await tool('basemail_inbox', { limit: 5 }));
    expect(!inbox.isError && Array.isArray(inbox.data?.emails), 'inbox lists emails');
    const first = inbox.data?.emails?.find((e) => e.subject === 'MCP smoke test') || inbox.data?.emails?.[0];
    expect(!!first, 'sent email visible in inbox');

    if (first) {
      const read = await tool('basemail_read_email', { id: first.id });
      const rawLen = read.data?.body ? read.data.body.length : 0;
      log(`${read.isError ? 'FAIL' : ' ok '} read_email ${first.id} → subject "${read.data?.subject}", from ${read.data?.from_addr}, raw body ${rawLen} chars, attachments ${read.data?.attachments?.length}`);
      expect(!read.isError && rawLen > 0, 'read_email returns raw body');
    }

    show('attn_balance', await tool('basemail_attn_balance', {}), 300);

    const created = show('keys_create', await tool('basemail_keys_create', { name: 'smoke' }));
    expect(!created.isError && /^bm_live_/.test(created.data?.api_key || ''), 'keys_create returns bm_live_ key');
    const listed = show('keys_list', await tool('basemail_keys_list', {}), 300);
    expect(!listed.isError, 'keys_list ok');
    if (created.data?.api_key) {
      const revoked = show('keys_revoke', await tool('basemail_keys_revoke', { api_key: created.data.api_key }));
      expect(!revoked.isError && revoked.data?.success === true, 'keys_revoke ok');
    }
  }
} catch (err) {
  failures++;
  log(`FAIL ${redact(err.stack || err.message)}`);
} finally {
  child.kill();
}

log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
