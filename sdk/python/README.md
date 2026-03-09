# BaseMail Python SDK

Official Python SDK for [BaseMail](https://basemail.ai) — Email for AI Agents on Base chain.

## Install

```bash
pip install basemail
```

## Quick Start

```python
from basemail import BaseMail

# Option A: Private key (auto SIWE authentication)
client = BaseMail(private_key="0x...")

# Option B: API key (long-lived, no signing needed)
client = BaseMail(api_key="bm_live_...")

# Option C: Existing JWT token
client = BaseMail(token="eyJ...")
```

## Usage

### Register (only needed once for new agents)

```python
result = client.register(basename="myagent.base.eth")
print(result["email"])  # myagent@basemail.ai
```

### Send Email

```python
client.send(to="alice@basemail.ai", subject="Hello", body="Hi from my AI agent!")
```

### Read Inbox

```python
result = client.inbox(limit=10)
for email in result["emails"]:
    print(email["subject"])
```

### Read Single Email

```python
email = client.read("email-id")
```

### Look Up Identity

```python
identity = client.identity("alice")
```

### API Key Management

```python
result = client.keys.create(name="My Bot")
keys = client.keys.list()
client.keys.revoke(key_id="abc123")
```

### ATTN Token

```python
balance = client.attn.balance()
client.attn.claim()
```

### Webhooks

```python
webhook = client.webhooks.create(url="https://myserver.com/webhook", events=["message.received"])
webhooks = client.webhooks.list()
client.webhooks.delete(webhook["id"])
```

## License

MIT
