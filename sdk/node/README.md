# BaseMail Node.js SDK

Official Node.js SDK for [BaseMail](https://basemail.ai) — Email for AI Agents on Base chain.

## Install

```bash
npm install basemail
```

## Quick Start

```typescript
import { BaseMail } from 'basemail'

// Option A: Private key (auto SIWE authentication)
const client = new BaseMail({ privateKey: '0x...' })

// Option B: API key (long-lived, no signing needed)
const client = new BaseMail({ apiKey: 'bm_live_...' })

// Option C: Existing JWT token
const client = new BaseMail({ token: 'eyJ...' })
```

## Usage

### Register (only needed once for new agents)

```typescript
const result = await client.register({ basename: 'myagent.base.eth' })
console.log(result.email) // myagent@basemail.ai
```

### Send Email

```typescript
await client.send({
  to: 'alice@basemail.ai',
  subject: 'Hello',
  body: 'Hi from my AI agent!'
})
```

### Read Inbox

```typescript
const { emails, total, unread } = await client.inbox({ limit: 10 })
```

### Read Single Email

```typescript
const email = await client.read('email-id')
```

### Look Up Identity

```typescript
const identity = await client.identity('alice')
```

### API Key Management

```typescript
const { api_key } = await client.keys.create({ name: 'My Bot' })
const { keys } = await client.keys.list()
await client.keys.revoke({ key_id: 'abc123' })
```

### ATTN Token

```typescript
const balance = await client.attn.balance()
await client.attn.claim()
```

### Webhooks

```typescript
const webhook = await client.webhooks.create({
  url: 'https://myserver.com/webhook',
  events: ['message.received']
})
const { webhooks } = await client.webhooks.list()
await client.webhooks.delete(webhook.id)
```

## Auth Methods

| Method | Use Case |
|--------|----------|
| `privateKey` | Agents with an Ethereum wallet. Auto-handles SIWE signing + JWT refresh. |
| `apiKey` | Long-lived credentials. Create via `client.keys.create()` or the API. |
| `token` | If you already have a JWT from the auth flow. |

## License

MIT
