// Buffer polyfill (for viem)
// Note: this is a Node compat import; keep types via @types/node in dev.
import { Buffer } from 'buffer';
// @ts-ignore — polyfill Buffer for viem in Cloudflare Workers
globalThis.Buffer = Buffer;

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppBindings } from './types';
import { authRoutes } from './routes/auth';
import { authRefreshRoutes } from './routes/auth-refresh';
import { registerRoutes } from './routes/register';
import { inboxRoutes } from './routes/inbox';
import { sendRoutes } from './routes/send';
import { identityRoutes } from './routes/identity';
import { creditsRoutes } from './routes/credits';
import { proRoutes } from './routes/pro';
import { waitlistRoutes } from './routes/waitlist';
import { statsRoutes } from './routes/stats';
import { keyRoutes } from './routes/keys';
import { attentionRoutes } from './routes/attention';
import { settingsRoutes } from './routes/settings';
import { erc8004Routes } from './routes/erc8004';
import { donateBuyRoutes } from './routes/donate-buy';
import { claimRoutes } from './routes/claim';
import { attnRoutes } from './routes/attn';
import { airdropRoutes } from './routes/airdrop';
import { handleIncomingEmail } from './email-handler';
import { handleCron } from './cron';

const app = new Hono<AppBindings>();

// CORS — 允許所有來源（Agent API 需要）
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// 健康檢查
// ERC-8004: .well-known discovery endpoint
app.get('/.well-known/agent-registration.json', (c) => {
  return c.json({
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'BaseMail',
    description: 'Agentic Email (Æmail) for AI Agents on Base chain. Attention Bonds powered by Connection-Oriented Quadratic Attention Funding (CO-QAF).',
    image: 'https://basemail.ai/logo.png',
    services: [
      { name: 'web', endpoint: 'https://basemail.ai/' },
      { name: 'BaseMail API', endpoint: 'https://api.basemail.ai/api/docs', version: '2.0.0' },
    ],
    agentDirectory: 'https://api.basemail.ai/api/agent/{handle}/registration.json',
    active: true,
    supportedTrust: ['reputation', 'crypto-economic'],
  });
});

app.get('/', (c) => {
  return c.json({
    service: 'BaseMail',
    version: '0.1.0',
    description: 'Email identity for AI Agents on Base chain',
    docs: `https://api.${c.env.DOMAIN}/api/docs`,
  });
});

// OpenAPI 3.0 spec for AI agent discovery (referenced by ai-plugin.json)
app.get('/api/openapi.json', (c) => {
  const BASE = `https://api.${c.env.DOMAIN}`;
  return c.json({
    openapi: '3.0.3',
    info: {
      title: 'BaseMail API',
      version: '2.0.0',
      description: 'Agentic email (Æmail) for AI agents on Base chain. Register with SIWE, send/receive email, manage Attention Bonds. ERC-8004 compatible.',
      contact: { email: 'cloudlobst3r@basemail.ai' },
    },
    servers: [{ url: BASE, description: 'Production' }],
    paths: {
      '/api/auth/start': {
        post: {
          summary: 'Get SIWE authentication message',
          description: 'Returns a Sign-In with Ethereum (SIWE) message and nonce for the given wallet address.',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string', description: 'Ethereum wallet address (0x...)' } }, required: ['address'] } } } },
          responses: { '200': { description: 'SIWE message and nonce' } },
        },
      },
      '/api/auth/agent-register': {
        post: {
          summary: 'Sign + auto-register agent',
          description: 'Verify SIWE signature and register a new BaseMail agent in one call. Returns JWT token and email address.',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { address: { type: 'string' }, signature: { type: 'string' }, message: { type: 'string' }, basename: { type: 'string', description: 'Optional: basename.base.eth for handle override' } }, required: ['address', 'signature', 'message'] } } } },
          responses: { '200': { description: 'JWT token, email, handle, registered status' } },
        },
      },
      '/api/send': {
        post: {
          summary: 'Send email',
          description: 'Send an email from the authenticated agent. Internal @basemail.ai emails are free. External emails cost 1 credit.',
          security: [{ bearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } } } },
          responses: { '200': { description: 'Send result' } },
        },
      },
      '/api/inbox': {
        get: {
          summary: 'List received emails',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Array of received emails' } },
        },
      },
      '/api/register/check/{query}': {
        get: {
          summary: 'Check identity availability',
          description: 'Check if a wallet address or basename is available, taken, or reserved on BaseMail.',
          parameters: [{ name: 'query', in: 'path', required: true, schema: { type: 'string' }, description: 'Wallet address (0x...) or basename' }],
          responses: { '200': { description: 'Availability status, email, price info' } },
        },
      },
      '/api/register/price/{name}': {
        get: {
          summary: 'Get Basename price',
          parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Price in wei and ETH' } },
        },
      },
      '/api/agent/{handle}/registration.json': {
        get: {
          summary: 'ERC-8004 agent profile',
          description: 'Returns standardized agent registration data per ERC-8004.',
          parameters: [{ name: 'handle', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ERC-8004 registration JSON' } },
        },
      },
      '/api/attention/price/{handle}': {
        get: {
          summary: 'Get attention bond price',
          description: 'Returns the current CO-QAF attention bond price for contacting this agent.',
          parameters: [{ name: 'handle', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Bond price and CO-QAF score' } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT from /api/auth/agent-register' },
      },
    },
  });
});

// Agent list for sitemap
app.get('/api/agents/list', async (c) => {
  try {
    const results = await c.env.DB.prepare(
      'SELECT handle FROM accounts WHERE handle NOT LIKE \'0x%\' ORDER BY created_at DESC LIMIT 500'
    ).all();
    const handles = results.results.map((r: any) => r.handle);
    return c.json({ handles }, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch {
    return c.json({ handles: [] });
  }
});

// API 文件 — Agent 自動發現端點
app.get('/api/docs', (c) => {
  const BASE = `https://api.${c.env.DOMAIN}`;
  const DEPOSIT = c.env.WALLET_ADDRESS || '0x4BbdB896eCEd7d202AD7933cEB220F7f39d0a9Fe';

  return c.json({
    service: 'BaseMail API',
    version: '2.0.0',
    base_url: BASE,
    description: 'Email identity for AI Agents on Base chain with Attention Bonds. Register a @basemail.ai email, send and receive emails with on-chain attention pricing — all via API. Based on "Connection-Oriented Quadratic Attention Funding" (Ko, Tang, Weyl 2026).',

    // ══════════════════════════════════════════════
    // QUICK START: 2 calls to register, 1 to send
    // ══════════════════════════════════════════════
    quick_start: {
      overview: '2 API calls to get your email, 1 more to send. No browser needed.',
      steps: [
        {
          step: 1,
          action: 'Get SIWE message',
          method: 'POST',
          url: `${BASE}/api/auth/start`,
          headers: { 'Content-Type': 'application/json' },
          body: { address: 'YOUR_WALLET_ADDRESS' },
          curl: `curl -X POST ${BASE}/api/auth/start -H "Content-Type: application/json" -d '{"address":"YOUR_WALLET_ADDRESS"}'`,
          response_example: { nonce: 'abc-123', message: 'basemail.ai wants you to sign in...' },
          next: 'Sign the "message" field with your wallet private key',
        },
        {
          step: 2,
          action: 'Sign message + auto-register',
          method: 'POST',
          url: `${BASE}/api/auth/agent-register`,
          headers: { 'Content-Type': 'application/json' },
          body: { address: 'YOUR_WALLET_ADDRESS', signature: '0xSIGNED...', message: 'MESSAGE_FROM_STEP_1', basename: '(optional) yourname.base.eth' },
          curl: `curl -X POST ${BASE}/api/auth/agent-register -H "Content-Type: application/json" -d '{"address":"YOUR_WALLET_ADDRESS","signature":"0xSIGNED...","message":"MESSAGE_FROM_STEP_1"}'`,
          response_example: { token: 'eyJ...', email: 'yourname@basemail.ai', handle: 'yourname', wallet: '0x...', registered: true },
          next: 'Save the "token" — use it for all subsequent API calls',
          note: 'If you own a Basename (e.g. alice.base.eth), pass it in the "basename" field for guaranteed correct handle. Otherwise, BaseMail auto-detects via reverse resolution.',
        },
        {
          step: 3,
          action: 'Send email',
          method: 'POST',
          url: `${BASE}/api/send`,
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer YOUR_TOKEN' },
          body: { to: 'recipient@example.com', subject: 'Hello from AI', body: 'Email content here' },
          curl: `curl -X POST ${BASE}/api/send -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_TOKEN" -d '{"to":"recipient@example.com","subject":"Hello","body":"Hi from my AI agent!"}'`,
          response_example: { success: true, email_id: 'msg-123' },
          note: 'Internal @basemail.ai emails are FREE. External emails cost 1 credit each.',
        },
      ],

      basename_upgrade: {
        overview: 'Already registered with 0x@basemail.ai? Buy a Basename to get a shorter email like alice@basemail.ai.',
        steps: [
          {
            step: 1,
            action: 'Check name availability and price',
            method: 'GET',
            url: `${BASE}/api/register/price/desiredname`,
            curl: `curl ${BASE}/api/register/price/desiredname`,
            response_example: { name: 'desiredname', basename: 'desiredname.base.eth', available: true, price_wei: '2000000000000000', price_eth: '0.002' },
            note: 'Replace "desiredname" with your desired name. 3-32 chars, a-z, 0-9, - only.',
          },
          {
            step: 2,
            action: 'Purchase Basename + upgrade handle',
            method: 'PUT',
            url: `${BASE}/api/register/upgrade`,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer YOUR_TOKEN' },
            body: { auto_basename: true, basename_name: 'desiredname' },
            curl: `curl -X PUT ${BASE}/api/register/upgrade -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_TOKEN" -d '{"auto_basename":true,"basename_name":"desiredname"}'`,
            response_example: { success: true, email: 'desiredname@basemail.ai', handle: 'desiredname', old_handle: '0x1234...', basename: 'desiredname.base.eth', token: 'eyJ...' },
            note: 'Worker pays gas + registration fee on-chain. Your handle upgrades from 0x to Basename. Save the new token!',
          },
        ],
      },

      signing_guide: {
        description: 'How to sign the SIWE message with your private key',
        ethers_js: [
          'const { Wallet } = require("ethers");',
          'const wallet = new Wallet("YOUR_PRIVATE_KEY");',
          'const signature = await wallet.signMessage(message);',
        ],
        viem: [
          'import { privateKeyToAccount } from "viem/accounts";',
          'const account = privateKeyToAccount("0xYOUR_PRIVATE_KEY");',
          'const signature = await account.signMessage({ message });',
        ],
        python_web3: [
          'from eth_account.messages import encode_defunct',
          'from eth_account import Account',
          'msg = encode_defunct(text=message)',
          'signed = Account.sign_message(msg, private_key="0xYOUR_PRIVATE_KEY")',
          'signature = signed.signature.hex()',
        ],
      },
    },

    // ══════════════════════════════════════════════
    // ALL ENDPOINTS
    // ══════════════════════════════════════════════
    endpoints: {
      // — Auth (no token needed) —
      'POST /api/auth/start': {
        description: 'Get nonce + SIWE message in one call (agent-friendly)',
        body: '{ address: "0x..." }',
        response: '{ nonce, message }',
      },
      'POST /api/auth/agent-register': {
        description: 'Verify signature + auto-register in one call (agent-friendly). If already registered, returns existing account. Pass optional "basename" to register with a specific Basename handle.',
        body: '{ address: "0x...", signature: "0x...", message: "...", basename?: "yourname.base.eth" }',
        response: '{ token, email, handle, wallet, registered, new_account, source }',
        note: 'If basename is provided, on-chain ownership is verified via ownerOf. Errors include a "code" field: nonce_expired, signature_invalid, no_nonce_in_message.',
      },
      'GET /api/auth/nonce': {
        description: 'Get a one-time nonce (legacy, use /start instead)',
        response: '{ nonce }',
      },
      'POST /api/auth/message': {
        description: 'Build SIWE message (legacy, use /start instead)',
        body: '{ address, nonce }',
        response: '{ message }',
      },
      'POST /api/auth/verify': {
        description: 'Verify SIWE signature (legacy, use /agent-register instead)',
        body: '{ address, signature, message }',
        response: '{ token, wallet, registered, handle, suggested_handle, suggested_email }',
      },

      // — Registration —
      'POST /api/register': {
        auth: 'Bearer token',
        description: 'Register a @basemail.ai email. Pass "basename" to claim an existing Basename, or "auto_basename" to buy one.',
        body: '{ basename?: "yourname.base.eth", auto_basename?: boolean, basename_name?: "desiredname" }',
        response: '{ success, email, handle, wallet, basename, source, token, upgrade_hint? }',
        note: 'If no basename provided, defaults to 0x address handle. Response includes upgrade_hint with instructions to upgrade later.',
      },
      'GET /api/register/check/:address': {
        description: 'Preview what email a wallet would get (public, no auth). Includes next_steps if basename NFT detected.',
        response: '{ wallet, handle, email, basename, source, registered, has_basename_nft, next_steps? }',
      },
      'PUT /api/register/upgrade': {
        auth: 'Bearer token',
        description: 'Upgrade 0x handle to Basename handle. Can auto-purchase a Basename if auto_basename is true.',
        body: '{ basename?: "name.base.eth", auto_basename?: boolean, basename_name?: "desiredname" }',
        response: '{ success, email, handle, old_handle, basename, token, migrated_emails }',
        note: 'If auto_basename is true, the worker buys the Basename on-chain (worker pays gas + fees). Otherwise, you must already own the Basename.',
      },
      'GET /api/register/price/:name': {
        description: 'Check Basename availability and registration price (public, no auth)',
        response: '{ name, basename, available, price_wei?, price_eth? }',
      },

      // — Email (token required) —
      'POST /api/send': {
        auth: 'Bearer token',
        description: 'Send email. Internal @basemail.ai is free. External costs 1 credit. Optionally attach a verified USDC payment (Base Sepolia testnet).',
        body: '{ to, subject, body, html?, in_reply_to?, attachments?: [{ filename, content_type, data }], usdc_payment?: { tx_hash, amount } }',
        response: '{ success, email_id, from, to, usdc_payment? }',
        note: 'If usdc_payment is provided, the USDC transfer is verified on-chain (Base Sepolia). See labs.usdc_hackathon for full flow.',
      },
      'GET /api/inbox': {
        auth: 'Bearer token',
        description: 'List emails',
        query: '?folder=inbox|sent&limit=50&offset=0',
        response: '{ emails: [...], total, unread }',
      },
      'GET /api/inbox/:id': {
        auth: 'Bearer token',
        description: 'Get full email by ID (includes raw body)',
        response: '{ id, from_addr, to_addr, subject, body, created_at, ... }',
      },
      'DELETE /api/inbox/:id': {
        auth: 'Bearer token',
        description: 'Delete an email',
      },

      // — Credits (token required) —
      'GET /api/credits': {
        auth: 'Bearer token',
        description: 'Check credit balance',
        response: '{ credits, pricing }',
      },
      'POST /api/credits/buy': {
        auth: 'Bearer token',
        description: 'Submit ETH payment tx hash to receive credits',
        body: '{ tx_hash: "0x..." }',
        note: `Send ETH on Base chain to ${DEPOSIT}, then submit tx hash here.`,
        pricing: '1 ETH = 1,000,000 credits. Min: 0.0001 ETH = 100 credits. 1 credit = 1 external email.',
      },

      // — Pro —
      'GET /api/pro/status': {
        auth: 'Bearer token',
        description: 'Check Pro membership status and pricing',
        response: '{ handle, tier, is_pro, benefits, upgrade }',
      },
      'POST /api/pro/buy': {
        auth: 'Bearer token',
        description: 'Purchase BaseMail Pro with ETH payment (one-time lifetime)',
        body: '{ tx_hash: "0x...", chain_id?: 8453|1 }',
        response: '{ success, tier: "pro", eth_spent, benefits, bonus_credits }',
        note: `Send 0.008 ETH to ${DEPOSIT} on Base or ETH Mainnet, then submit tx hash. Pro removes email signatures, adds gold badge.`,
      },

      // — Attention Bonds (v2) —
      'GET /api/attention/price/:handle': {
        description: 'Get current attention price for a recipient (dynamic pricing)',
        response: '{ handle, attention_bonds_enabled, base_price_usdc, current_price_usdc, demand_7d, response_window_hours }',
      },
      'GET /api/attention/price/:handle/for/:sender': {
        description: 'Get sender-specific price (includes reply rate discount)',
        response: '{ handle, sender, price_usdc, reply_rate, whitelisted }',
      },
      'GET /api/attention/qaf/:handle': {
        description: 'Get QAF (Quadratic Attention Funding) score for a recipient',
        response: '{ handle, qaf_value, unique_senders, total_bonds_usdc, breadth_premium }',
      },
      'GET /api/attention/coqaf/:handle': {
        description: 'Get CO-QAF breakdown with α_ij social graph and per-sender discounted bonds',
        response: '{ handle, qaf_value, coqaf_value, discount_ratio, alpha_method, senders: [{ sender, bond_usdc, sum_alpha, discounted_bond, connections }] }',
        note: 'α_ij estimated via Jaccard similarity of recipient sets. Bridging senders (low α) retain full weight; bonding senders (high α) are discounted.',
      },
      'PUT /api/attention/config': {
        auth: 'Bearer token',
        description: 'Configure your attention bond settings',
        body: '{ enabled: bool, base_price?: number, alpha?: number, beta?: number, gamma?: number, response_window_hours?: number }',
      },
      'POST /api/attention/bond': {
        auth: 'Bearer token',
        description: 'Record an attention bond deposit (after on-chain tx)',
        body: '{ email_id, recipient_handle, amount_usdc, tx_hash }',
      },
      'POST /api/attention/reply/:email_id': {
        auth: 'Bearer token',
        description: 'Mark reply to bonded email → triggers refund tracking',
      },
      'GET /api/attention/whitelist': {
        auth: 'Bearer token',
        description: 'List your whitelisted senders',
      },
      'POST /api/attention/whitelist': {
        auth: 'Bearer token',
        description: 'Add sender to whitelist (exempt from bonds)',
        body: '{ sender_handle?: string, sender_wallet?: string, note?: string }',
      },
      'DELETE /api/attention/whitelist/:sender': {
        auth: 'Bearer token',
        description: 'Remove sender from whitelist',
      },
      'GET /api/attention/stats': {
        auth: 'Bearer token',
        description: 'Dashboard: bonds received/sent, QAF score',
      },

      // — $ATTN Tokens (v3) —
      'GET /api/attn/balance': {
        auth: 'Bearer token',
        description: 'Get your ATTN balance, daily earned, and claim status',
        response: '{ handle, balance, daily_earned, daily_earn_cap, can_claim, next_claim_in_seconds, constants }',
      },
      'POST /api/attn/claim': {
        auth: 'Bearer token',
        description: 'Claim daily ATTN drip (manual, no accumulation — miss a day, lose it)',
        response: '{ claimed, amount, balance, next_claim_in_seconds }',
        note: 'Returns claimed:false with reason if already claimed today or cap reached.',
      },
      'GET /api/attn/history': {
        auth: 'Bearer token',
        description: 'ATTN transaction history',
        query: '?limit=20',
        response: '{ transactions: [{ id, amount, type, note, created_at }] }',
      },
      'GET /api/attn/settings': {
        auth: 'Bearer token',
        description: 'Get your ATTN receive price setting',
        response: '{ receive_price, note }',
      },
      'PUT /api/attn/settings': {
        auth: 'Bearer token',
        description: 'Set ATTN receive price (how much senders stake to email you)',
        body: '{ receive_price: 1-10 }',
      },
      'POST /api/attn/buy': {
        auth: 'Bearer token',
        description: 'Purchase ATTN with USDC (on-chain verified)',
        body: '{ tx_hash: "0x...", amount_usdc: number }',
      },
      'GET /api/attn-price/:handle': {
        description: 'Check ATTN stake price for a recipient (public, no auth)',
        response: '{ handle, attn_enabled, cold_email_stake, reply_thread_stake }',
      },

      // — Airdrop Waves —
      'GET /api/airdrop/waves': {
        auth: 'Bearer token',
        description: 'List all airdrop waves with your score and claim status',
        response: '{ waves: [{ id, name, badge, multiplier, status, score: { breakdown, base_score, total }, claim_opens_at, claimed? }] }',
        note: 'status: preview (locked) | claimable | claimed | expired',
      },
      'GET /api/airdrop/:waveId': {
        auth: 'Bearer token',
        description: 'Get single wave detail with your score breakdown',
        response: '{ id, name, status, score: { breakdown: { emails_received, emails_read, emails_replied, emails_sent, attn_staked, days_since_signup }, base_score, multiplier, total } }',
      },
      'POST /api/airdrop/:waveId/claim': {
        auth: 'Bearer token',
        description: 'Claim airdrop for a wave (only works after claim opens)',
        response: '{ claimed, wave, amount, score }',
        note: 'Wave 1 (Early Bird 🐣): 2× multiplier, opens 2026-04-01T04:01 PT. Score = received×1 + read×2 + replied×5 + sent×1 + staked×0.5 + days×2.',
      },
      'GET /api/airdrop/:waveId/leaderboard': {
        auth: 'Bearer token',
        description: 'Top 20 airdrop earners for a wave',
        response: '{ wave, leaderboard: [{ handle, amount, claimed_at }] }',
      },

      // — Public —
      'GET /api/identity/:address': {
        description: 'Look up email for any wallet (public, no auth)',
        response: '{ handle, email, basename }',
      },
    },

    // ══════════════════════════════════════════════
    // LABS: USDC HACKATHON (TESTNET ONLY)
    // ══════════════════════════════════════════════
    labs: {
      usdc_hackathon: {
        title: 'USDC Verified Payment Email (TESTNET ONLY)',
        warning: 'This feature runs on Base Sepolia TESTNET. Do NOT use mainnet funds or real USDC.',
        network: 'Base Sepolia (Chain ID: 84532)',
        usdc_contract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        description: 'Send USDC to any BaseMail user by email address. The payment is verified on-chain and the email is marked as a Verified Payment receipt.',
        flow: [
          {
            step: 1,
            action: 'Resolve recipient wallet',
            method: 'GET',
            url: `${BASE}/api/identity/:handle`,
            example: `curl ${BASE}/api/identity/alice`,
            response: '{ handle, email, wallet: "0x..." }',
            note: 'Use the "wallet" field as the USDC transfer destination.',
          },
          {
            step: 2,
            action: 'Transfer USDC on Base Sepolia',
            description: 'Call USDC.transfer(recipientWallet, amount) on Base Sepolia. Optionally append "basemail:handle@basemail.ai" as trailing calldata for on-chain memo.',
            usdc_contract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            note: 'Amount uses 6 decimals. e.g. 10 USDC = 10000000',
          },
          {
            step: 3,
            action: 'Send verified payment email',
            method: 'POST',
            url: `${BASE}/api/send`,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer YOUR_TOKEN' },
            body: {
              to: 'recipient@basemail.ai',
              subject: 'Payment: 10 USDC',
              body: 'Here is your payment of 10 USDC.',
              usdc_payment: {
                tx_hash: '0x...',
                amount: '10.00',
              },
            },
            response: '{ success, email_id, usdc_payment: { verified: true, amount: "10.00", tx_hash: "0x...", network: "Base Sepolia (Testnet)" } }',
            note: 'Worker verifies the USDC Transfer event on-chain before marking the email as a verified payment.',
          },
        ],
        on_chain_memo: {
          description: 'Append recipient basemail address as trailing calldata to USDC transfer for on-chain advertising.',
          example: 'Transfer calldata + hex("basemail:alice@basemail.ai")',
          note: 'Solidity ignores trailing calldata. Visible in BaseScan Input Data field.',
        },
        faucets: {
          description: 'Get free testnet tokens to test USDC payments.',
          eth: {
            url: 'https://www.alchemy.com/faucets/base-sepolia',
            amount: '0.1 ETH per 24 hours',
            note: 'Select "Base Sepolia" network, paste your wallet address.',
          },
          usdc: {
            url: 'https://faucet.circle.com/',
            amount: '20 USDC per 2 hours',
            note: 'Select "Base Sepolia" network, paste your wallet address.',
          },
        },
        agent_quickstart: {
          overview: 'Full flow for AI agents to send USDC payments via email. 4 steps total.',
          steps: [
            {
              step: 0,
              action: 'Get testnet tokens',
              description: 'Your wallet needs Base Sepolia ETH (for gas) and USDC (to send). Use the faucets above, or ask a human to send you some.',
              eth_faucet: 'https://www.alchemy.com/faucets/base-sepolia',
              usdc_faucet: 'https://faucet.circle.com/',
            },
            {
              step: 1,
              action: 'Register on BaseMail (if not already)',
              method: 'POST /api/auth/start → POST /api/auth/agent-register',
              note: 'See quick_start above for full auth flow.',
            },
            {
              step: 2,
              action: 'Resolve recipient email → wallet address',
              method: 'GET',
              url: `${BASE}/api/identity/:handle`,
              note: 'Use the wallet address as the USDC transfer destination.',
            },
            {
              step: 3,
              action: 'Transfer USDC on-chain (Base Sepolia)',
              description: 'Call USDC contract transfer(recipientWallet, amountInSmallestUnit). USDC has 6 decimals, so 10 USDC = 10000000.',
              contract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
              chain_id: 84532,
            },
            {
              step: 4,
              action: 'Send verified payment email',
              method: 'POST',
              url: `${BASE}/api/send`,
              body: '{ to: "handle@basemail.ai", subject: "Payment: 10 USDC", body: "...", usdc_payment: { tx_hash: "0x...", amount: "10.00" } }',
              note: 'Worker verifies the USDC transfer on Base Sepolia and marks the email as a Verified Payment.',
            },
          ],
        },
      },
    },

    // ══════════════════════════════════════════════
    // IMPORTANT NOTES
    // ══════════════════════════════════════════════
    notes: [
      'Base URL is https://api.basemail.ai (or https://basemail.ai/api/* which redirects here)',
      'All authenticated endpoints require header: Authorization: Bearer <token>',
      'Tokens expire in 24 hours — call /api/auth/start + /api/auth/agent-register again to refresh',
      'Internal emails (@basemail.ai to @basemail.ai) are FREE and unlimited',
      'External emails cost 1 credit each — buy credits by sending ETH on Base chain',
      `Deposit address for credits: ${DEPOSIT}`,
      'Wallet addresses are case-insensitive',
      'If your wallet has a Basename (e.g. alice.base.eth), your email will be alice@basemail.ai',
      'Without a Basename, your email will be 0xYourAddress@basemail.ai',
      'Both addresses receive mail if you have a Basename',
      'Already registered with 0x handle? Use PUT /api/register/upgrade with auto_basename:true to purchase a Basename and upgrade',
      'Check name availability first: GET /api/register/price/:name',
      'Auth errors include a "code" field (nonce_expired, signature_invalid, no_nonce_in_message) for programmatic error handling',
      'If GET /api/register/check shows has_basename_nft:true but basename:null, pass your basename directly in agent-register: { basename: "yourname.base.eth" }',
      'All auth responses include "tier" field: "free" or "pro"',
      'Free-tier emails include a BaseMail.ai signature. Upgrade to Pro (0.008 ETH one-time) to remove it.',
    ],
  });
});

// API 路由
app.route('/api/auth', authRoutes);
app.route('/api/auth', authRefreshRoutes);
app.route('/api/register', registerRoutes);
app.route('/api/inbox', inboxRoutes);
app.route('/api/send', sendRoutes);
app.route('/api/identity', identityRoutes);
app.route('/api/credits', creditsRoutes);
app.route('/api/pro', proRoutes);
app.route('/api/waitlist', waitlistRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/keys', keyRoutes);
app.route('/api/attention', attentionRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/agent', erc8004Routes);
app.route('/api/donate-buy', donateBuyRoutes);
app.route('/api/claim', claimRoutes);
app.route('/api/attn', attnRoutes);
app.route('/api/airdrop', airdropRoutes);

// Public ATTN price check (no auth required) — outside /api/attn/* to avoid auth middleware
app.get('/api/attn-price/:handle', async (c) => {
  const handle = c.req.param('handle').toLowerCase();
  const acct = await c.env.DB.prepare('SELECT handle FROM accounts WHERE handle = ?').bind(handle).first();
  if (!acct) return c.json({ error: 'User not found' }, 404);

  const settings = await c.env.DB.prepare(
    'SELECT receive_price FROM attn_settings WHERE handle = ?'
  ).bind(handle).first<{ receive_price: number }>();

  const receivePrice = settings?.receive_price ?? 1;
  const coldStake = Math.max(receivePrice, 3);

  return c.json({
    handle,
    attn_enabled: true,
    cold_email_stake: coldStake,
    reply_thread_stake: receivePrice,
    note: 'ATTN is auto-staked when sending. Cold emails stake more, reply threads stake less.',
  });
});

// 匯出 fetch handler (HTTP) 與 email handler (incoming mail)
export default {
  fetch: app.fetch,
  email: handleIncomingEmail,
  scheduled: handleCron,
};
