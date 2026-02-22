#!/usr/bin/env node
/**
 * BaseMail MCP Server
 *
 * Model Context Protocol server for BaseMail — Æmail for AI Agents on Base chain.
 * Lets Claude, Cursor, and other MCP-compatible tools interact with BaseMail API.
 *
 * Usage:
 *   npx @basemail/mcp-server
 *
 * Or add to Claude Desktop / Cursor config:
 *   { "mcpServers": { "basemail": { "command": "npx", "args": ["@basemail/mcp-server"] } } }
 *
 * Environment variables (optional):
 *   BASEMAIL_TOKEN  — JWT token from /api/auth/agent-register (for authenticated ops)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API = 'https://api.basemail.ai';

const server = new Server(
  { name: 'basemail', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

/* ═══ Tools ═══ */

const TOOLS = [
  {
    name: 'basemail_check_identity',
    description: 'Check if a wallet address or basename is available on BaseMail. Returns email, availability status, and price info.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Wallet address (0x...) or basename (e.g. alice)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'basemail_auth_start',
    description: 'Start SIWE authentication. Returns a message to sign with your wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Ethereum wallet address (0x...)' },
      },
      required: ['address'],
    },
  },
  {
    name: 'basemail_register',
    description: 'Register a new BaseMail agent by providing a signed SIWE message. Returns JWT token and email.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Ethereum wallet address' },
        signature: { type: 'string', description: 'SIWE signature (0x...)' },
        message: { type: 'string', description: 'SIWE message from auth_start' },
        basename: { type: 'string', description: 'Optional: basename.base.eth for handle override' },
      },
      required: ['address', 'signature', 'message'],
    },
  },
  {
    name: 'basemail_send',
    description: 'Send an email from the authenticated BaseMail agent. Internal @basemail.ai emails are free. Requires BASEMAIL_TOKEN env var.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body text' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'basemail_inbox',
    description: 'List received emails for the authenticated agent. Requires BASEMAIL_TOKEN env var.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max emails to return (default 20)' },
      },
    },
  },
  {
    name: 'basemail_agent_profile',
    description: 'Get ERC-8004 agent profile for a BaseMail handle. Returns identity, reputation, services, and attention bond info.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'Agent handle (e.g. cloudlobst3r)' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'basemail_basename_price',
    description: 'Check Basename availability and price on Base chain.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Desired basename (without .base.eth)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'basemail_attention_price',
    description: 'Get the current Attention Bond price (CO-QAF) for contacting an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'Agent handle' },
      },
      required: ['handle'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const token = process.env.BASEMAIL_TOKEN || '';

  try {
    switch (name) {
      case 'basemail_check_identity': {
        const res = await fetch(`${API}/api/register/check/${args.query}`);
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      case 'basemail_auth_start': {
        const res = await fetch(`${API}/api/auth/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: args.address }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      case 'basemail_register': {
        const res = await fetch(`${API}/api/auth/agent-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      case 'basemail_send': {
        if (!token) return { content: [{ type: 'text', text: 'Error: BASEMAIL_TOKEN env var not set. Register first via basemail_auth_start + basemail_register.' }] };
        const res = await fetch(`${API}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(args),
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      case 'basemail_inbox': {
        if (!token) return { content: [{ type: 'text', text: 'Error: BASEMAIL_TOKEN env var not set.' }] };
        const limit = args.limit || 20;
        const res = await fetch(`${API}/api/inbox?limit=${limit}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      case 'basemail_agent_profile': {
        const res = await fetch(`${API}/api/agent/${args.handle}/registration.json`);
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      case 'basemail_basename_price': {
        const res = await fetch(`${API}/api/register/price/${args.name}`);
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      case 'basemail_attention_price': {
        const res = await fetch(`${API}/api/attention/price/${args.handle}`);
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

/* ═══ Resources ═══ */

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'basemail://docs',
      name: 'BaseMail API Documentation',
      description: 'Full API docs for BaseMail — Æmail for AI agents on Base chain',
      mimeType: 'application/json',
    },
    {
      uri: 'basemail://llms',
      name: 'BaseMail LLMs.txt',
      description: 'AI-readable overview of BaseMail capabilities and API',
      mimeType: 'text/plain',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'basemail://docs') {
    const res = await fetch(`${API}/api/docs`);
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (uri === 'basemail://llms') {
    const res = await fetch('https://basemail.ai/llms.txt');
    return { contents: [{ uri, mimeType: 'text/plain', text: await res.text() }] };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

/* ═══ Start ═══ */

const transport = new StdioServerTransport();
await server.connect(transport);
