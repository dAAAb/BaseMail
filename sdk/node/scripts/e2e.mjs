#!/usr/bin/env node
// End-to-end smoke test for the `basemail` SDK against production.
//
//   node scripts/e2e.mjs                 # uses/creates .e2e-wallet.json (gitignored)
//   BASEMAIL_E2E_FRESH=1 node scripts/e2e.mjs   # force a brand-new throwaway wallet
//   BASEMAIL_BASE_URL=... to point at another deployment
//
// Rules: throwaway wallet only, never buys a Basename, only sends to its own
// @basemail.ai address (internal mail is free), never prints full secrets.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BaseMail, BaseMailError } from '../dist/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const walletFile = join(here, '..', '.e2e-wallet.json');
const baseUrl = process.env.BASEMAIL_BASE_URL || 'https://api.basemail.ai';

const mask = (s, keep = 8) => (typeof s === 'string' && s.length > keep * 2 ? `${s.slice(0, keep)}…${s.slice(-4)} (len ${s.length})` : s);
const t0 = Date.now();
const log = (step, data) => console.log(`[${String(Date.now() - t0).padStart(5)}ms] ${step}`, data === undefined ? '' : JSON.stringify(data));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERT: ${msg}`); };

// ── wallet (+ cached session, so re-runs don't burn the 5 registrations/IP/hour) ──
let state = {};
if (!process.env.BASEMAIL_E2E_FRESH && existsSync(walletFile)) {
  state = JSON.parse(readFileSync(walletFile, 'utf8'));
  log('wallet: reusing', { file: '.e2e-wallet.json', cachedSession: !!state.refresh_token });
} else {
  state = { privateKey: generatePrivateKey(), created_at: new Date().toISOString() };
  log('wallet: generated fresh throwaway key', { file: '.e2e-wallet.json' });
}
const saveState = () => writeFileSync(walletFile, JSON.stringify(state) + '\n', { mode: 0o600 });
saveState();
const { privateKey } = state;
const address = privateKeyToAccount(privateKey).address;
log('wallet address', address);

const client = new BaseMail({ privateKey, baseUrl });
assert(client.wallet === address.toLowerCase(), 'client.wallet matches viem address');

// ── register ──
let reg;
try {
  reg = await client.register();
  log('register()', {
    status: reg.new_account ? '201 new account' : '200 existing account',
    handle: reg.handle, email: reg.email, wallet: reg.wallet, tier: reg.tier, source: reg.source,
    token: mask(reg.token), refresh_token: mask(reg.refresh_token ?? ''),
  });
  assert(reg.token && reg.email && reg.handle && reg.registered === true, 'agent-register returns token/email/handle/registered');
  assert(reg.email === `${reg.handle}@basemail.ai`, 'email = handle@basemail.ai');
  assert(reg.handle === address.toLowerCase(), 'fresh wallet gets 0x handle');
  state.refresh_token = reg.refresh_token;
  saveState();
} catch (e) {
  if (!(e instanceof BaseMailError && e.status === 429)) throw e;
  log('register() rate limited (5/IP/hour); continuing with lazy sign-in', { retryAfter: e.retryAfter, code: e.code });
  // Lazy auth path: POST /api/auth/verify (not rate limited) -> token for the existing inbox.
  const who = await client.me();
  reg = { handle: who.handle, email: `${who.handle}@basemail.ai`, wallet: who.wallet, refresh_token: client.getRefreshToken() };
  log('lazy sign-in via /api/auth/verify', { handle: reg.handle, token: mask(client.getToken()), refresh_token: mask(reg.refresh_token ?? '') });
}
const myEmail = reg.email;

// ── whoami / identity ──
const me = await client.me();
log('me()  GET /api/settings', { handle: me.handle, wallet: me.wallet, basename: me.basename, aliases: me.aliases?.length });
assert(me.handle === reg.handle, 'me().handle matches');

const id = await client.identity(reg.handle);
log('identity(handle)', { handle: id.handle, email: id.email, wallet: id.wallet, is_human: id.is_human, registered_at: id.registered_at });
assert(id.email === myEmail, 'identity email matches');

const idByEmail = await client.identity(myEmail);
assert(idByEmail.handle === reg.handle, 'identity() accepts full @basemail.ai address');

const idW = await client.identityByWallet(address);
log('identityByWallet()', { handle: idW.handle, email: idW.email });
assert(idW.handle === reg.handle, 'identityByWallet matches');

// ── send internal mail to self ──
const subject = `sdk e2e ${new Date().toISOString()}`;
const sent = await client.send({ to: myEmail, subject, body: 'Hello from the basemail Node SDK e2e.\n\n- internal\n- free' });
log('send() -> self', { success: sent.success, email_id: sent.email_id, internal: sent.internal, attachments: sent.attachments, attn: sent.attn });
assert(sent.success && sent.internal === true, 'internal send succeeded and is free');

// ── poll inbox ──
let found;
for (let i = 0; i < 15 && !found; i++) {
  const box = await client.inbox({ limit: 10 });
  found = box.emails.find((e) => e.id === sent.email_id || e.subject === subject);
  if (!found) { log(`inbox() poll #${i + 1}`, { total: box.total, unread: box.unread }); await sleep(2000); }
  else log('inbox() found', { total: box.total, unread: box.unread, bonded_count: box.bonded_count, id: found.id, from: found.from_addr, subject: found.subject, read: found.read });
}
assert(found, 'sent email appeared in inbox');

const full = await client.read(found.id);
log('read(id)', { id: full.id, folder: full.folder, subject: full.subject, bodyBytes: full.body?.length, attachments: full.attachments.length, hasMimeHeaders: /^Subject: /m.test(full.body ?? '') });
assert(full.subject === subject, 'read().subject matches');
assert(full.body && full.body.includes('Hello from the basemail Node SDK e2e'), 'raw RFC822 body contains our text');

const mr = await client.markRead({ ids: [found.id] });
log('markRead()', mr);
assert(mr.success === true, 'markRead ok');

const sentBox = await client.inbox({ folder: 'sent', limit: 5 });
log('inbox({folder:"sent"})', { total: sentBox.total, first: sentBox.emails[0]?.id });

// ── API keys ──
const created = await client.keys.create({ name: 'sdk-e2e', scopes: ['send', 'inbox'] });
log('keys.create()', { api_key: mask(created.api_key), handle: created.handle, scopes: created.scopes, note: created.note });
assert(created.api_key.startsWith('bm_live_'), 'api key has bm_live_ prefix');

const viaKey = new BaseMail({ apiKey: created.api_key, baseUrl });
const balViaKey = await viaKey.attn.balance();
log('apiKey client -> attn.balance()', { handle: balViaKey.handle, balance: balViaKey.balance });
assert(balViaKey.handle === reg.handle, 'apiKey auth works for same handle');

const listed = await client.keys.list();
const mine = listed.keys.find((k) => k.name === 'sdk-e2e' && !k.revoked_at);
log('keys.list()', { count: listed.keys.length, mine: mine && { id: mine.id, name: mine.name, scopes: mine.scopes, last_used_at: mine.last_used_at } });
assert(mine, 'created key is listed');

const revoked = await client.keys.revoke({ key_id: mine.id });
log('keys.revoke({key_id})', revoked);
assert(revoked.success, 'revoke ok');
try {
  await viaKey.attn.balance();
  assert(false, 'revoked key should be rejected');
} catch (e) {
  assert(e instanceof BaseMailError && e.status === 401, `revoked key rejected with 401 (got ${e.status ?? e.message})`);
  log('revoked key rejected', { status: e.status, error: e.body?.error });
}

// ── ATTN ──
const bal = await client.attn.balance();
log('attn.balance()', { handle: bal.handle, balance: bal.balance, daily_earned: bal.daily_earned, daily_earn_cap: bal.daily_earn_cap, can_claim: bal.can_claim, next_claim_in_seconds: bal.next_claim_in_seconds, constants: bal.constants });
const hist = await client.attn.history({ limit: 5 });
log('attn.history()', { total: hist.total, types: hist.transactions.map((t) => `${t.type}:${t.amount}`) });

// ── token + refreshToken client (expired JWT -> auto refresh) ──
if (reg.refresh_token) {
  const viaToken = new BaseMail({ token: 'eyJ.invalid.token', refreshToken: reg.refresh_token, baseUrl });
  const b2 = await viaToken.attn.balance();
  log('token client w/ bad JWT + refreshToken -> auto refresh', { handle: b2.handle, newToken: mask(viaToken.getToken()) });
  assert(b2.handle === reg.handle, 'refresh-token path works');
}

// ── privateKey lazy sign-in (POST /api/auth/verify, no registration quota) ──
{
  const lazy = new BaseMail({ privateKey, baseUrl });
  const who = await lazy.me();
  log('lazy privateKey client -> me()', { handle: who.handle, token: mask(lazy.getToken()), refresh_token: mask(lazy.getRefreshToken() ?? '') });
  assert(who.handle === reg.handle, 'lazy sign-in resolves same handle');
}

// ── error envelope ──
try {
  await client.identity('this-handle-does-not-exist-xyz');
  assert(false, 'expected 404');
} catch (e) {
  assert(e instanceof BaseMailError, 'BaseMailError thrown');
  log('BaseMailError shape', { status: e.status, code: e.code, message: e.message });
}

// ── cleanup ──
const del = await client.delete(found.id);
log('delete(id)', del);

log('DONE', { handle: reg.handle, email: myEmail });
