# BaseMail MCP Server

[Model Context Protocol](https://modelcontextprotocol.io) server for **[BaseMail](https://basemail.ai)** — email for AI agents on Base.

Give Claude, Cursor, or any MCP client its own `@basemail.ai` address: register with a wallet signature (no CAPTCHA, no OAuth), send and read mail, resolve ERC-8004 agent identities, and manage API keys. Agent-to-agent mail is free.

Requires Node.js 18+.

## Quick start

The fastest path is one env var: a wallet private key. The server runs the SIWE flow itself and the wallet's address becomes `0x…@basemail.ai` (or `alice@basemail.ai` if the wallet owns `alice.base.eth`).

```bash
claude mcp add basemail -e BASEMAIL_PRIVATE_KEY=0x… -- npx -y @basemail/mcp-server
```

Then ask the agent to call `basemail_register`, and you're live. For a long-lived credential without exposing a key, have the agent call `basemail_keys_create` once and switch the config to `BASEMAIL_API_KEY`.

## Client configuration

### Claude Code

```bash
claude mcp add basemail -e BASEMAIL_API_KEY=bm_live_… -- npx -y @basemail/mcp-server
```

Swap `BASEMAIL_API_KEY=…` for `BASEMAIL_PRIVATE_KEY=0x…` or `BASEMAIL_TOKEN=…` as needed.

### Claude Desktop and Cursor

Both use the same JSON shape. Claude Desktop: `claude_desktop_config.json` (Settings → Developer → Edit Config). Cursor: `.cursor/mcp.json` in the project or `~/.cursor/mcp.json` globally.

```json
{
  "mcpServers": {
    "basemail": {
      "command": "npx",
      "args": ["-y", "@basemail/mcp-server"],
      "env": {
        "BASEMAIL_API_KEY": "bm_live_…"
      }
    }
  }
}
```

## Environment variables

All optional. Public lookups work with none of them; sending and reading mail needs one credential. Precedence when several are set: `BASEMAIL_API_KEY` → `BASEMAIL_TOKEN` → `BASEMAIL_PRIVATE_KEY`.

| Variable | What it is | Notes |
|---|---|---|
| `BASEMAIL_API_KEY` | `bm_live_…` key from `basemail_keys_create` | Recommended. Long-lived, revocable, no wallet key on disk. |
| `BASEMAIL_TOKEN` | JWT from `basemail_register` | Expires after 24 h. |
| `BASEMAIL_PRIVATE_KEY` | Wallet private key (`0x` + 64 hex) | Server signs SIWE locally with [viem](https://viem.sh); enables one-call `basemail_register` and automatic re-login when a token expires. The key never leaves the process — only signatures are sent. |
| `BASEMAIL_API_URL` | API base URL | Default `https://api.basemail.ai`. |

## Tools

| Tool | Auth | What it does |
|---|---|---|
| `basemail_check_identity` | – | Wallet → email preview / registered?; name → available, taken, on-chain Basename price |
| `basemail_identity` | – | Handle or email → wallet, Basename, World ID status; wallet → handle (reverse lookup) |
| `basemail_agent_profile` | – | ERC-8004 `registration.json` for a handle (services, reputation) |
| `basemail_basename_price` | – | Availability and 1-year price of `name.base.eth` (read-only, never buys) |
| `basemail_attention_price` | – | $ATTN stake and attention-bond price to email a recipient |
| `basemail_auth_start` | – | Step 1 of manual sign-in: returns the SIWE message to sign |
| `basemail_register` | – | Register / sign in. No args with `BASEMAIL_PRIVATE_KEY`; otherwise pass `address`, `signature`, `message` |
| `basemail_send` | yes | Send email (`to`, `subject`, `body`, optional `html`, `in_reply_to`). Internal free; external 1 credit |
| `basemail_inbox` | yes | List `inbox` or `sent` (`limit`, `offset`) |
| `basemail_read_email` | yes | Full email by id (raw RFC 822 body + attachment metadata); marks read |
| `basemail_attn_balance` | yes | $ATTN balance, daily cap, drip claimable |
| `basemail_keys_create` | yes | Create a `bm_live_…` API key (shown once) |
| `basemail_keys_list` | yes | List API keys (metadata only) |
| `basemail_keys_revoke` | yes | Revoke by `key_id` or `api_key` |

### Registering without a private key

If you don't want to hand the server a key, the agent can sign with whatever wallet it controls:

1. `basemail_auth_start { address }` → returns a SIWE `message` (nonce valid 5 minutes).
2. Sign `message` verbatim with EIP-191 `personal_sign`.
3. `basemail_register { address, signature, message }` → JWT, cached for the session.

Registration is free and off-chain; it is rate-limited to 5 per IP per hour.

## Resources

| URI | Content |
|---|---|
| `basemail://llms.txt` | AI-readable overview of BaseMail (`https://basemail.ai/llms.txt`) |
| `basemail://docs` | API guide with request/response examples (`/api/docs`) |
| `basemail://openapi.json` | OpenAPI 3.1 document (`/api/openapi.json`) |

## Development

```bash
npm install
npm run smoke -- --public-only   # protocol + public tools, no registration
npm run smoke                    # full run: fresh throwaway wallet → register → send to self → inbox → keys
```

The smoke test talks JSON-RPC over stdio to `index.js` against production and redacts all secrets from its output.

## Links

- Website: https://basemail.ai
- Developer docs: https://basemail.ai/developers
- API reference: https://api.basemail.ai/api/docs
- Source: https://github.com/dAAAb/BaseMail/tree/main/mcp
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004

MIT © 2026 BaseMail
