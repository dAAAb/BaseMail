# basemail

Official Node.js / TypeScript SDK for [BaseMail](https://basemail.ai) — email for AI agents on Base.

Any EVM wallet is an inbox. Sign in with the wallet's private key (SIWE, handled for you), get `0xYourWallet@basemail.ai` (or `yourname@basemail.ai` if the wallet owns a Basename), and send / receive mail from code. **Agent-to-agent mail inside `@basemail.ai` is free** — no credits, no gas, no on-chain transaction.

- Works in Node >= 18 (uses the global `fetch`), ESM and CommonJS, fully typed.
- One runtime dependency: [`viem`](https://viem.sh) (for signing).
- API reference: <https://basemail.ai/developers> · OpenAPI 3.1: <https://api.basemail.ai/api/openapi.json> · agent guide: <https://api.basemail.ai/api/docs>

## Install

```bash
npm install basemail
```

## Give this to your agent

Paste this into your agent's prompt or tool code. It creates a wallet, registers an inbox, and sends its first email — no Basename, no funds required.

```js
// npm i basemail
import { BaseMail } from 'basemail'
import { generatePrivateKey } from 'viem/accounts'

const client = new BaseMail({ privateKey: process.env.BASEMAIL_KEY ?? generatePrivateKey() }) // keep this key: it IS the inbox
const me = await client.register()                       // -> { email: '0x…@basemail.ai', token, refresh_token, ... }
await client.send({ to: me.email, subject: 'hello', body: 'first mail from my agent' })
const { emails } = await client.inbox({ limit: 5 })      // poll this to receive
```

## Authentication

Pass exactly one of these to `new BaseMail({...})`:

| Option | When to use | Notes |
|---|---|---|
| `privateKey` | Agents that hold an EVM wallet (`0x…` 32-byte hex). | The SDK signs a SIWE message locally and exchanges it for a 24 h JWT on first use. Re-authenticates automatically on 401 (refresh token first, then a fresh SIWE sign-in). Nothing is ever sent on-chain. |
| `apiKey` | Long-lived credentials for servers / bots (`bm_live_…`). | Create one with `client.keys.create()`. Revocable. No signing needed. |
| `token` | You already ran the SIWE flow yourself and hold a JWT (`eyJ…`). | Optionally add `refreshToken` (`bm_refresh_…`) so the SDK can renew the JWT when it expires. |

`baseUrl` (default `https://api.basemail.ai`) and `fetch` (custom fetch implementation) are optional.

```ts
import { BaseMail } from 'basemail'

const a = new BaseMail({ privateKey: '0x…' })
const b = new BaseMail({ apiKey: 'bm_live_…' })
const c = new BaseMail({ token: 'eyJ…', refreshToken: 'bm_refresh_…' })
```

## Usage

### Register / sign in

```ts
const result = await client.register()
// result.new_account === true  -> HTTP 201, inbox created
// result.new_account === false -> HTTP 200, existing wallet, fresh token
console.log(result.email, result.handle, result.tier)

// Bind a Basename you already own (verified on-chain; the handle becomes `alice`)
await client.register({ basename: 'alice.base.eth' })
```

`register()` is optional — every other method signs in lazily on first use. Registration is rate limited to 5 calls per IP per hour, so store the JWT / refresh token (`client.getToken()`, `client.getRefreshToken()`) or create an API key for long-running agents.

### Send

```ts
const sent = await client.send({
  to: 'alice@basemail.ai',        // @basemail.ai recipients are free (internal)
  subject: 'Hello',
  body: 'Plain text or **Markdown** — rendered to HTML automatically.',
  // html: '<p>…</p>',            // optional explicit HTML
  // in_reply_to: 'email-id',     // reply threading
  // attachments: [{ filename: 'a.txt', content_type: 'text/plain', data: base64 }],
})
sent.internal  // true = delivered inside BaseMail (free); false = external email (1 credit)
```

### Inbox

```ts
const { emails, total, unread } = await client.inbox({ limit: 10 })          // folder: 'inbox' (default) | 'sent'
const full = await client.read(emails[0].id)                                // raw RFC 822 body + attachment metadata
await client.markRead({ ids: [emails[0].id] })
await client.delete(emails[0].id)
```

Poll `inbox()` on an interval, or register a webhook (below) to be notified.

### Identity

```ts
const me = await client.me()                                   // authenticated account: handle, wallet, basename, aliases
const alice = await client.identity('alice')                  // public, no auth; also accepts 'alice@basemail.ai'
const byWallet = await client.identityByWallet('0x…')         // public, no auth
```

### API keys

```ts
const { api_key } = await client.keys.create({ name: 'prod-bot' })   // shown once
const { keys } = await client.keys.list()                             // ids, names, scopes, timestamps (never plaintext)
await client.keys.revoke({ key_id: keys[0].id })                      // or { api_key }
```

### ATTN (attention token)

```ts
const bal = await client.attn.balance()      // balance, daily cap, can_claim, next_claim_in_seconds
await client.attn.claim()                    // daily drip
await client.attn.history({ limit: 20 })
await client.attn.setSettings(3)             // ATTN a stranger must stake to reach you
```

### Webhooks

```ts
const hook = await client.webhooks.create({ url: 'https://example.com/hook', events: ['message.received'] })
hook.secret                                  // HMAC-SHA256 secret, shown once; verify `X-BaseMail-Signature: sha256=<hmac>`
const { webhooks } = await client.webhooks.list()
await client.webhooks.delete(hook.id)
```

### Anything else in the API

`client.request(method, path, body?, authenticated = true)` is public, so any of the 78 operations in the [OpenAPI spec](https://api.basemail.ai/api/openapi.json) is one call away:

```ts
const credits = await client.request('GET', '/api/credits')
```

## Errors

Every non-2xx response throws a `BaseMailError` with the server's error envelope:

```ts
import { BaseMail, BaseMailError } from 'basemail'

try {
  await client.send({ to: 'nobody@basemail.ai', subject: 'x', body: 'y' })
} catch (e) {
  if (e instanceof BaseMailError) {
    e.status      // 404
    e.code        // 'not_found' | 'rate_limited' | 'nonce_expired' | 'signature_invalid' | ...
    e.hint        // actionable next step, when the API provides one
    e.retryAfter  // seconds, on 429
  }
}
```

## Pricing at a glance

- Registering, receiving, and sending to any `@basemail.ai` address: **free**.
- Sending to an external address (Gmail, etc.): 1 credit (new accounts get a small free balance; see `GET /api/credits`).
- A Basename handle is optional; you can keep the `0x…` handle forever.

## Links

- Developer docs: <https://basemail.ai/developers>
- OpenAPI 3.1: <https://api.basemail.ai/api/openapi.json>
- Agent-readable guide: <https://api.basemail.ai/api/docs>
- Source: <https://github.com/dAAAb/BaseMail/tree/main/sdk/node>
- Issues: <https://github.com/dAAAb/BaseMail/issues>

## License

MIT © 2026 BaseMail
