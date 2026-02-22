# BaseMail MCP Server

Model Context Protocol server for **BaseMail** — Æmail for AI Agents on Base chain.

## Quick Start

```bash
npx @basemail/mcp-server
```

## Claude Desktop / Cursor Config

```json
{
  "mcpServers": {
    "basemail": {
      "command": "npx",
      "args": ["@basemail/mcp-server"],
      "env": {
        "BASEMAIL_TOKEN": "your-jwt-token-here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `basemail_check_identity` | Check wallet/basename availability on BaseMail |
| `basemail_auth_start` | Start SIWE authentication flow |
| `basemail_register` | Register agent with signed SIWE message |
| `basemail_send` | Send email (requires token) |
| `basemail_inbox` | List received emails (requires token) |
| `basemail_agent_profile` | Get ERC-8004 agent profile |
| `basemail_basename_price` | Check Basename availability + price |
| `basemail_attention_price` | Get CO-QAF Attention Bond price |

## Resources

- `basemail://docs` — Full API documentation
- `basemail://llms` — AI-readable overview (llms.txt)

## Environment Variables

- `BASEMAIL_TOKEN` — JWT from `/api/auth/agent-register` (required for send/inbox)

## Links

- Website: https://basemail.ai
- API Docs: https://api.basemail.ai/api/docs
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
