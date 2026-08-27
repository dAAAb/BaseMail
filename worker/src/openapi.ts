/**
 * OpenAPI 3.1.0 document for the BaseMail API.
 *
 * Pure data + one exported function. No runtime imports.
 * Source of truth for shapes: src/routes/*.ts, src/auth.ts, src/ratelimit.ts, src/mpp.ts.
 *
 * Conventions:
 * - Every operation has a unique lowerCamelCase operationId, summary, description, tags.
 * - Every 2xx and 4xx/5xx JSON response carries a typed schema (errors -> #/components/schemas/Error).
 * - Public endpoints override the global security with `security: []`.
 * - Fields whose presence depends on runtime branches are optional and say so in `description`.
 */

type J = Record<string, unknown>;

// ── tiny helpers (pure) ──────────────────────────────────────────────────────

const ref = (name: string): J => ({ $ref: `#/components/schemas/${name}` });
const ERR = ref('Error');

const jsonRes = (description: string, schema: J, example?: unknown): J => ({
  description,
  content: { 'application/json': { schema, ...(example !== undefined ? { example } : {}) } },
});
const errRes = (description: string, example?: J): J => jsonRes(description, ERR, example);

const RATE_LIMIT_HEADERS: J = {
  'RateLimit-Limit': { $ref: '#/components/headers/RateLimit-Limit' },
  'RateLimit-Remaining': { $ref: '#/components/headers/RateLimit-Remaining' },
  'RateLimit-Reset': { $ref: '#/components/headers/RateLimit-Reset' },
  'Retry-After': { $ref: '#/components/headers/Retry-After' },
};
const rateLimited = (what: string, policy: string): J => ({
  ...errRes(`Too Many Requests — ${policy}. Back off until \`Retry-After\` / \`RateLimit-Reset\`.`, {
    error: `Too many ${what} from this IP. Please try again later.`,
    code: 'rate_limited',
  }),
  headers: RATE_LIMIT_HEADERS,
});

const unauthorized = (): J =>
  errRes('Missing, invalid, expired, or revoked Bearer credential (JWT or bm_live_ API key).', {
    error: 'Invalid or expired token',
  });
const notRegistered = (): J =>
  errRes('Credential is valid but the wallet has no registered @basemail.ai handle yet. Call POST /api/register first.', {
    error: 'Not registered',
  });
const notFound = (what: string, message: string): J => errRes(`${what} not found.`, { error: message });

const pathParam = (name: string, description: string, schema: J = { type: 'string' }, example?: unknown): J => ({
  name, in: 'path', required: true, description, schema, ...(example !== undefined ? { example } : {}),
});
const queryParam = (name: string, description: string, schema: J, example?: unknown): J => ({
  name, in: 'query', required: false, description, schema, ...(example !== undefined ? { example } : {}),
});
const jsonBody = (schema: J, example?: unknown, required = true): J => ({
  required,
  content: { 'application/json': { schema, ...(example !== undefined ? { example } : {}) } },
});

const ADDRESS = { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', description: 'EVM wallet address (0x + 40 hex chars). Case-insensitive; stored lowercase.' };
const TX_HASH = { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$', description: 'Transaction hash (0x + 64 hex chars).' };
const UNIX_TS = { type: 'integer', description: 'Unix timestamp in seconds.' };
const HANDLE = { type: 'string', description: 'BaseMail handle — the local part of the @basemail.ai address (a Basename label like `alice` or a lowercase 0x wallet address).' };
const EMAIL_ADDR = { type: 'string', format: 'email' };
const NULLABLE_STR = { type: ['string', 'null'] };
const NULLABLE_INT = { type: ['integer', 'null'] };

// ── components.schemas ───────────────────────────────────────────────────────

const schemas: J = {
  Error: {
    type: 'object',
    description: 'Standard error envelope. `error` is always present. Some endpoints add machine-readable `code` and/or human `hint`; a few add extra context fields (e.g. `existing_handle`, `credits`, `upgrade`, `price_eth`).',
    required: ['error'],
    properties: {
      error: { type: 'string', description: 'Human-readable error message.' },
      code: { type: 'string', description: 'Machine-readable error code when available. Known values: `no_nonce_in_message`, `nonce_expired`, `signature_invalid` (SIWE verification), `rate_limited` (429), `not_found` (unknown route), `internal_error` (unhandled 500). Other errors may omit `code`.' },
      hint: { type: 'string', description: 'Actionable next step for agents.' },
    },
    additionalProperties: true,
    example: { error: 'Invalid or expired token' },
  },

  SuccessResponse: {
    type: 'object',
    required: ['success'],
    properties: { success: { type: 'boolean', const: true } },
    additionalProperties: true,
  },

  // ── Auth ──
  AuthStartRequest: {
    type: 'object', required: ['address'],
    properties: { address: ADDRESS },
  },
  AuthStartResponse: {
    type: 'object', required: ['nonce', 'message'],
    properties: {
      nonce: { type: 'string', format: 'uuid', description: 'One-time nonce, 5 minute TTL, consumed on first verification.' },
      message: { type: 'string', description: 'EIP-4361 (SIWE) message. Sign it verbatim with personal_sign / EIP-191 and submit to POST /api/auth/agent-register or /api/auth/verify.' },
    },
    example: { nonce: 'abc-123', message: 'basemail.ai wants you to sign in with your Ethereum account:\n0x...\n\nSign in to BaseMail - Email for AI Agents on Base\n\nURI: https://basemail.ai\nVersion: 1\nChain ID: 8453\nNonce: abc-123\nIssued At: 2026-01-01T00:00:00.000Z' },
  },
  SiweRequest: {
    type: 'object', required: ['address', 'signature', 'message'],
    properties: {
      address: ADDRESS,
      signature: { type: 'string', description: 'EIP-191 personal_sign signature of `message` (0x-prefixed hex).' },
      message: { type: 'string', description: 'The exact `message` string returned by POST /api/auth/start.' },
    },
  },
  AgentRegisterRequest: {
    allOf: [
      ref('SiweRequest'),
      { type: 'object', properties: { basename: { type: 'string', description: 'Optional. A Basename you own (e.g. `alice.base.eth`). On-chain ownership is verified via ownerOf; the handle becomes `alice`. Omit to auto-detect via reverse resolution (falls back to the 0x address).', example: 'alice.base.eth' } } },
    ],
  },
  UpgradeHint: {
    type: 'object',
    description: 'Guidance for upgrading a 0x handle to a Basename handle. Shape varies by branch; treat as informational.',
    properties: { message: { type: 'string' }, method: { type: 'string' }, url: { type: 'string' }, body: { type: 'object', additionalProperties: true }, note: { type: 'string' }, options: { type: 'array', items: { type: 'object', additionalProperties: true } } },
    additionalProperties: true,
  },
  AgentRegisterResponse: {
    type: 'object',
    required: ['token', 'email', 'handle', 'wallet', 'tier', 'registered', 'new_account'],
    properties: {
      token: { type: 'string', description: 'JWT (HS256), 24h expiry. Send as `Authorization: Bearer <token>`.' },
      refresh_token: { ...NULLABLE_STR, description: 'Long-lived refresh token for POST /api/auth/refresh. `null` if issuance failed (backward compatible).' },
      email: EMAIL_ADDR,
      handle: HANDLE,
      wallet: ADDRESS,
      basename: { ...NULLABLE_STR, description: 'Bound Basename (e.g. alice.base.eth) or null.' },
      tier: { type: 'string', enum: ['free', 'pro'] },
      registered: { type: 'boolean', const: true },
      new_account: { type: 'boolean', description: 'true when this call created the account (HTTP 201); false when the wallet was already registered (HTTP 200).' },
      source: { type: 'string', enum: ['basename', 'address'], description: 'How the handle was derived. Present only for new accounts.' },
      pending_emails: { type: 'integer', description: 'Emails already waiting in the inbox (pre-stored before registration). New accounts only.' },
      migrated_emails: { type: 'integer', description: 'Emails moved from the 0x handle to the Basename handle. New accounts only.' },
      upgrade_hint: { ...ref('UpgradeHint'), description: 'Present only when the new account got a 0x handle.' },
    },
    example: { token: 'eyJ...', refresh_token: 'rt_...', email: 'yourname@basemail.ai', handle: 'yourname', wallet: '0x...', basename: 'yourname.base.eth', tier: 'free', registered: true, new_account: true, source: 'basename', pending_emails: 0, migrated_emails: 0 },
  },
  AuthVerifyResponse: {
    type: 'object',
    required: ['token', 'wallet', 'handle', 'email', 'registered', 'tier', 'pending_emails', 'upgrade_available', 'has_basename_nft'],
    properties: {
      token: { type: 'string', description: 'JWT. If `registered` is false the token carries an empty handle and only works for POST /api/register.' },
      refresh_token: { ...NULLABLE_STR, description: 'Issued only for registered wallets.' },
      wallet: ADDRESS,
      handle: { ...NULLABLE_STR, description: 'Registered handle, or null if not registered.' },
      email: { ...NULLABLE_STR },
      registered: { type: 'boolean' },
      basename: NULLABLE_STR,
      tier: { type: 'string', enum: ['free', 'pro'] },
      suggested_handle: NULLABLE_STR,
      suggested_source: { type: ['string', 'null'], enum: ['basename', 'address', null] },
      suggested_email: NULLABLE_STR,
      pending_emails: { type: 'integer' },
      upgrade_available: { type: 'boolean', description: 'true when the account uses a 0x handle but a Basename is now available for upgrade.' },
      has_basename_nft: { type: 'boolean' },
    },
  },
  NonceResponse: { type: 'object', required: ['nonce'], properties: { nonce: { type: 'string', format: 'uuid' } } },
  MessageRequest: { type: 'object', required: ['address', 'nonce'], properties: { address: ADDRESS, nonce: { type: 'string' } } },
  MessageResponse: { type: 'object', required: ['message'], properties: { message: { type: 'string' } } },
  AuthRefreshRequest: {
    type: 'object', required: ['refresh_token'],
    properties: {
      refresh_token: { type: 'string' },
      rotate: { type: 'boolean', description: 'If true, a new refresh token is issued and returned alongside the JWT.', default: false },
    },
  },
  AuthRefreshResponse: {
    type: 'object', required: ['token'],
    properties: { token: { type: 'string', description: 'Fresh 24h JWT.' }, refresh_token: { type: 'string', description: 'Present only when `rotate: true` was sent.' } },
  },

  // ── Registration ──
  RegisterRequest: {
    type: 'object',
    description: 'All fields optional. Precedence: `basename` (claim one you own) > `auto_basename` + `basename_name` (platform buys one, worker pays gas) > auto-detect via reverse resolution (falls back to 0x handle).',
    properties: {
      basename: { type: 'string', description: 'Existing Basename you own, e.g. `alice.base.eth`. Verified on-chain. If the wallet is already registered this adds the Basename as an alias instead.' },
      auto_basename: { type: 'boolean', description: 'Buy a Basename on-chain for you (requires `basename_name`). Names costing more than 0.002 ETH are rejected (choose 5+ chars).' },
      basename_name: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*[a-z0-9]$', minLength: 3, maxLength: 32, description: 'Desired label for `auto_basename` (3–32 chars, a-z 0-9 - _).' },
    },
  },
  RegisterResponse: {
    type: 'object',
    required: ['success', 'email', 'handle', 'wallet', 'source', 'token', 'pending_emails', 'migrated_emails'],
    properties: {
      success: { type: 'boolean', const: true },
      email: EMAIL_ADDR,
      handle: HANDLE,
      wallet: ADDRESS,
      basename: NULLABLE_STR,
      source: { type: 'string', enum: ['basename', 'address'] },
      token: { type: 'string', description: 'New JWT bound to the handle. Replace the pre-registration token with this.' },
      pending_emails: { type: 'integer' },
      migrated_emails: { type: 'integer' },
      upgrade_hint: { ...ref('UpgradeHint'), description: 'Present only when `source` is `address`.' },
    },
    example: { success: true, email: 'alice@basemail.ai', handle: 'alice', wallet: '0x...', basename: 'alice.base.eth', source: 'basename', token: 'eyJ...', pending_emails: 0, migrated_emails: 0 },
  },
  RegisterAliasAddedResponse: {
    type: 'object',
    description: 'Returned (HTTP 200) when the wallet was already registered and `basename` was supplied — the Basename is added as an alias instead of creating a second account.',
    required: ['success', 'action', 'primary_email', 'alias_email', 'basename', 'message'],
    properties: {
      success: { type: 'boolean', const: true },
      action: { type: 'string', const: 'alias_added' },
      primary_email: EMAIL_ADDR,
      alias_email: EMAIL_ADDR,
      basename: { type: 'string' },
      message: { type: 'string' },
    },
  },
  UpgradeResponse: {
    type: 'object',
    required: ['success', 'email', 'handle', 'old_handle', 'token', 'migrated_emails'],
    properties: {
      success: { type: 'boolean', const: true },
      email: EMAIL_ADDR,
      handle: HANDLE,
      old_handle: HANDLE,
      basename: NULLABLE_STR,
      token: { type: 'string', description: 'New JWT for the upgraded handle. Old tokens still verify but carry the old handle — switch immediately.' },
      migrated_emails: { type: 'integer' },
    },
    example: { success: true, email: 'desiredname@basemail.ai', handle: 'desiredname', old_handle: '0x1234...', basename: 'desiredname.base.eth', token: 'eyJ...', migrated_emails: 3 },
  },
  BasenamePriceInfo: {
    type: 'object',
    description: 'On-chain availability + price. When `available` is false only that field is guaranteed; on RPC failure an `error` string is returned instead.',
    properties: {
      available: { type: 'boolean' },
      price_wei: { type: 'string', description: 'Price in wei as a decimal string (BigInt-safe).' },
      price_eth: { type: 'string' },
      duration_years: { type: 'integer', const: 1 },
      registrar: ADDRESS,
      chain_id: { type: 'integer', const: 8453 },
      buy_url: { type: 'string', format: 'uri' },
      error: { type: 'string' },
    },
    additionalProperties: true,
  },
  RegisterCheckResponse: {
    type: 'object',
    description: 'Shape depends on whether `query` was a wallet address or a name. Address lookups always include `wallet`, `registered`, `has_basename_nft`. Name lookups always include `status`, `available_basemail`, and usually `price_info`.',
    required: ['handle', 'email', 'source', 'registered'],
    properties: {
      wallet: { ...ADDRESS, description: 'Wallet address (address lookups; for name lookups, present only if the name is registered on BaseMail).' },
      handle: HANDLE,
      email: EMAIL_ADDR,
      basename: NULLABLE_STR,
      source: { type: 'string', enum: ['basename', 'address'] },
      registered: { type: 'boolean', description: 'true if already registered on BaseMail.' },
      has_basename_nft: { type: 'boolean', description: 'Address lookups only.' },
      next_steps: { type: 'object', additionalProperties: true, description: 'Address lookups only — present when the wallet owns a Basename NFT but reverse resolution failed.' },
      available_basemail: { type: 'boolean', description: 'Name lookups only.' },
      available_onchain: { type: 'boolean', description: 'Name lookups only.' },
      status: { type: 'string', enum: ['available', 'taken', 'reserved', 'unknown'], description: 'Name lookups only. `reserved` = owned on-chain but not yet claimed on BaseMail.' },
      price_info: ref('BasenamePriceInfo'),
      owner: { ...ADDRESS, description: 'On-chain owner when `status` is `reserved` (best effort).' },
      note: { type: 'string' },
      direct_buy: { type: 'object', additionalProperties: true, description: 'Step-by-step purchase guidance when `status` is `available`.' },
    },
    example: { wallet: '0xabc...', handle: '0xabc...', email: '0xabc...@basemail.ai', basename: null, source: 'address', registered: false, has_basename_nft: false },
  },
  BasenamePriceResponse: {
    type: 'object',
    required: ['name', 'basename', 'available'],
    properties: {
      name: { type: 'string' },
      basename: { type: 'string' },
      available: { type: 'boolean' },
      price_wei: { type: 'string', description: 'Present only when `available` is true. Decimal string.' },
      price_eth: { type: 'string', description: 'Present only when `available` is true.' },
      price: { type: 'null', description: 'Present (as null) only when `available` is false.' },
    },
    example: { name: 'desiredname', basename: 'desiredname.base.eth', available: true, price_wei: '2000000000000000', price_eth: '0.002' },
  },
  BasenameBuyDataResponse: {
    type: 'object',
    required: ['name', 'basename', 'available', 'price_wei', 'price_eth', 'value_with_buffer', 'contract'],
    properties: {
      name: { type: 'string' }, basename: { type: 'string' }, available: { type: 'boolean', const: true },
      price_wei: { type: 'string' }, price_eth: { type: 'string' },
      value_with_buffer: { type: 'string', description: 'price_wei + 10% buffer, decimal string. Use as tx value.' },
      contract: {
        type: 'object', required: ['address', 'chain_id', 'function_name', 'args', 'value'],
        properties: {
          address: ADDRESS, chain_id: { type: 'integer', const: 8453 }, function_name: { type: 'string', const: 'register' },
          args: { type: 'object', additionalProperties: true, description: 'Arguments for RegistrarController.register(): name, owner, duration, resolver, data[], reverseRecord, coinTypes[], signatureExpiry, signature.' },
          value: { type: 'string' },
        },
      },
    },
  },
  WalletBasenamesResponse: {
    type: 'object', required: ['address', 'basenames'],
    properties: {
      address: ADDRESS,
      basenames: { type: 'array', items: { type: 'object', required: ['name', 'handle', 'expiry'], properties: { name: { type: 'string' }, handle: HANDLE, expiry: { type: 'integer', description: 'Unix expiry, 0 if unknown.' } } } },
    },
  },
};

// ── Email ──
Object.assign(schemas, {
  Attachment: {
    type: 'object', required: ['filename', 'content_type', 'data'],
    properties: {
      filename: { type: 'string' },
      content_type: { type: 'string', example: 'application/pdf' },
      data: { type: 'string', contentEncoding: 'base64', description: 'Base64-encoded file bytes. Total decoded size of all attachments must be ≤ 10 MB.' },
    },
  },
  AttachmentMeta: {
    type: 'object', required: ['filename', 'content_type', 'size'],
    properties: { filename: { type: 'string' }, content_type: { type: 'string' }, size: { type: 'integer', description: 'Approximate decoded size in bytes.' } },
  },
  UsdcPaymentRequest: {
    type: 'object', required: ['tx_hash', 'amount'],
    description: 'Attach an on-chain USDC transfer to the email. The worker verifies the Transfer event (sender = your wallet, recipient = recipient wallet) and stamps X-BaseMail-USDC-* headers. Requires JWT auth (not API key).',
    properties: {
      tx_hash: TX_HASH,
      amount: { type: 'string', description: 'Human-readable amount, e.g. "10.00".' },
      network: { type: 'string', enum: ['base-mainnet', 'base-sepolia'], default: 'base-sepolia' },
    },
  },
  EscrowClaimRequest: {
    type: 'object', required: ['claim_id', 'amount', 'deposit_tx', 'expires_at'],
    description: 'Record a PaymentEscrow deposit so the recipient can claim USDC via GET/POST /api/claim/{id}. Only recorded for external recipients.',
    properties: {
      claim_id: { type: 'string' }, amount: { type: 'string' }, deposit_tx: TX_HASH,
      network: { type: 'string', enum: ['base-mainnet', 'base-sepolia'], default: 'base-mainnet' },
      expires_at: UNIX_TS,
    },
  },
  SendRequest: {
    type: 'object', required: ['to', 'subject', 'body'],
    properties: {
      to: { ...EMAIL_ADDR, description: 'Recipient. `@basemail.ai` recipients are delivered internally for free; anything else costs 1 credit.' },
      subject: { type: 'string' },
      body: { type: 'string', description: 'Plain-text body. Markdown is auto-rendered to HTML when `html` is omitted.' },
      html: { type: 'string', description: 'Optional HTML body.' },
      in_reply_to: { type: 'string', description: 'Email ID from your inbox to reply to. Sets In-Reply-To/References and resolves attention bonds / ATTN escrow.' },
      from_handle: { type: 'string', description: 'Send as another Basename you own (on-chain verified). Auto-registers it as an alias so replies are delivered.' },
      attachments: { type: 'array', items: ref('Attachment') },
      usdc_payment: ref('UsdcPaymentRequest'),
      escrow_claim: ref('EscrowClaimRequest'),
    },
    example: { to: 'recipient@example.com', subject: 'Hello from AI', body: 'Email content here' },
  },
  SendResponse: {
    type: 'object',
    required: ['success', 'email_id', 'from', 'to', 'subject', 'internal', 'attachments'],
    properties: {
      success: { type: 'boolean', const: true },
      email_id: { type: 'string', description: 'ID of the message. Your sent copy is stored as `<email_id>-sent`.' },
      from: EMAIL_ADDR,
      from_alias: { type: 'string', description: 'Present only when `from_handle` was used.' },
      primary_handle: { type: 'string', description: 'Present only when `from_handle` was used.' },
      to: EMAIL_ADDR,
      subject: { type: 'string' },
      internal: { type: 'boolean', description: 'true = delivered inside BaseMail (free); false = external (1 credit).' },
      bond_resolved: { type: 'boolean', description: 'Present (true) only when replying resolved an active USDC attention bond.' },
      attachments: { type: 'integer', description: 'Number of attachments sent.' },
      usdc_payment: { type: 'object', description: 'Present only when `usdc_payment` was verified.', required: ['verified', 'amount', 'tx_hash', 'network'], properties: { verified: { type: 'boolean', const: true }, amount: { type: 'string' }, tx_hash: TX_HASH, network: { type: 'string' } } },
      escrow_claim: { type: 'object', description: 'Present only when an escrow claim was recorded.', properties: { claim_id: { type: 'string' }, amount: { type: 'string' }, claim_url: { type: 'string', format: 'uri' }, expires_at: UNIX_TS } },
      attn: {
        type: 'object', description: 'ATTN auto-stake result. Present for internal sends when the ATTN system ran.',
        properties: {
          staked: { type: 'boolean' }, amount: { type: 'integer' },
          reason: { type: 'string', description: '`cold`, `reply`, `self`, `whitelisted`, `insufficient_balance`, or `diplomat:<category>`.' },
          balance_after: { type: 'integer' },
          diplomat: { type: 'object', additionalProperties: true, description: 'LLM arbitration breakdown (category, score, reasoning, qaf_base, llm_coefficient, actual_cost, formula). Present only when Diplomat ran.' },
        },
      },
      attn_reply_bonus: { type: 'object', description: 'Present only when replying released an ATTN escrow.', properties: { refunded: { type: 'integer' }, bonus_each: { type: 'integer' }, note: { type: 'string' } } },
    },
    example: { success: true, email_id: 'msg-123', from: 'alice@basemail.ai', to: 'recipient@example.com', subject: 'Hello', internal: false, attachments: 0 },
  },
  EmailSummary: {
    type: 'object',
    required: ['id', 'folder', 'from_addr', 'to_addr', 'created_at'],
    properties: {
      id: { type: 'string' },
      folder: { type: 'string', enum: ['inbox', 'sent'] },
      from_addr: { type: 'string' },
      to_addr: { type: 'string' },
      subject: NULLABLE_STR,
      snippet: { ...NULLABLE_STR, description: 'First 200 chars of the plain-text body.' },
      size: { type: 'integer', description: 'Raw MIME size in bytes.' },
      read: { type: 'integer', enum: [0, 1], description: '0 = unread, 1 = read (SQLite boolean).' },
      created_at: UNIX_TS,
      bond_amount: { type: ['number', 'null'], description: 'Active USDC attention bond amount, if any.' },
      bond_status: NULLABLE_STR,
      bond_deadline: NULLABLE_INT,
      attn_stake: { ...NULLABLE_INT, description: 'ATTN staked on this email (present when the ATTN tables exist).' },
      attn_status: { type: ['string', 'null'], enum: ['pending', 'refunded', 'transferred', null] },
      attn_expires: NULLABLE_INT,
    },
  },
  EmailDetail: {
    allOf: [
      ref('EmailSummary'),
      {
        type: 'object', required: ['handle', 'r2_key', 'body', 'attachments'],
        properties: {
          handle: HANDLE,
          r2_key: { type: 'string', description: 'Internal storage key.' },
          body: { ...NULLABLE_STR, description: 'Full raw RFC 822 message (headers + MIME parts). null if the stored object is missing.' },
          attachments: { type: 'array', items: ref('AttachmentMeta'), description: 'Attachment metadata; download bytes via GET /api/inbox/{id}/attachment/{index}.' },
          usdc_amount: NULLABLE_STR, usdc_tx: NULLABLE_STR, usdc_network: NULLABLE_STR,
        },
      },
    ],
    description: 'Fetching an email marks it read (and refunds any ATTN escrow to the sender).',
  },
  InboxResponse: {
    type: 'object', required: ['emails', 'total', 'unread', 'bonded_count', 'limit', 'offset'],
    properties: {
      emails: { type: 'array', items: ref('EmailSummary') },
      total: { type: 'integer', description: 'Total emails in the requested folder.' },
      unread: { type: 'integer' },
      bonded_count: { type: 'integer', description: 'Inbox emails with an active USDC attention bond.' },
      limit: { type: 'integer' }, offset: { type: 'integer' },
    },
  },
  MarkReadRequest: {
    type: 'object',
    properties: {
      ids: { type: 'array', items: { type: 'string' }, description: 'Email IDs to mark read. Omit to mark the whole folder read.' },
      folder: { type: 'string', enum: ['inbox', 'sent'], default: 'inbox' },
    },
  },
  MarkReadResponse: {
    type: 'object', required: ['success', 'folder', 'unread'],
    properties: { success: { type: 'boolean', const: true }, folder: { type: 'string' }, unread: { type: 'integer', description: 'Remaining unread count in the folder.' } },
  },
  RejectEmailResponse: {
    type: 'object', required: ['success', 'email_id', 'rejected', 'attn_received', 'note'],
    properties: { success: { type: 'boolean', const: true }, email_id: { type: 'string' }, rejected: { type: 'boolean', const: true }, attn_received: { type: 'integer', description: 'ATTN transferred to you as attention compensation (0 if no escrow was active).' }, note: { type: 'string' } },
  },

  // ── Identity ──
  IdentityResponse: {
    type: 'object', required: ['handle', 'email', 'wallet', 'registered_at', 'is_human'],
    properties: {
      handle: HANDLE, email: EMAIL_ADDR, wallet: ADDRESS, basename: NULLABLE_STR,
      registered_at: UNIX_TS, tx_hash: NULLABLE_STR,
      is_human: { type: 'boolean', description: 'true if a World ID verification exists for this handle.' },
      verification_level: { ...NULLABLE_STR, description: 'World ID level (e.g. `orb`, `device`) or null.' },
    },
    example: { handle: 'alice', email: 'alice@basemail.ai', wallet: '0x...', basename: 'alice.base.eth', registered_at: 1735689600, tx_hash: null, is_human: false, verification_level: null },
  },
  WalletIdentityResponse: {
    type: 'object', required: ['handle', 'email', 'wallet'],
    properties: { handle: HANDLE, email: EMAIL_ADDR, wallet: ADDRESS, basename: NULLABLE_STR },
  },
  IdentityStats: { type: 'object', required: ['total_agents', 'total_emails'], properties: { total_agents: { type: 'integer' }, total_emails: { type: 'integer' } } },
  AgentService: {
    type: 'object', required: ['name', 'endpoint'],
    properties: { name: { type: 'string', description: '`email`, `web`, `BaseMail API`, `wallet` (eip155:8453:0x…), `ENS`.' }, endpoint: { type: 'string' }, version: { type: 'string' } },
  },
  AgentRegistration: {
    type: 'object',
    description: 'ERC-8004 Agent Registration File (https://eips.ethereum.org/EIPS/eip-8004). Cached 5 minutes.',
    required: ['type', 'name', 'description', 'image', 'services', 'x402Support', 'active', 'registrations', 'supportedTrust'],
    properties: {
      type: { type: 'string', const: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1' },
      name: HANDLE, description: { type: 'string' }, image: { type: 'string', format: 'uri' },
      services: { type: 'array', items: ref('AgentService') },
      x402Support: { type: 'boolean' }, active: { type: 'boolean' },
      registrations: { type: 'array', items: { type: 'object', additionalProperties: true } },
      supportedTrust: { type: 'array', items: { type: 'string', enum: ['reputation', 'crypto-economic'] } },
      attentionBonds: { type: 'object', additionalProperties: true, description: 'Present only when the agent has USDC attention bonds enabled (basePriceUsdc, escrowContract, chain, token, tokenContract, mechanism, paper, priceEndpoint, coqafEndpoint).' },
      reputation: { type: 'object', description: 'CO-QAF reputation summary.', properties: { source: { type: 'string' }, uniqueSenders: { type: 'integer' }, totalBondsUsdc: { type: 'number' }, emailsReceived: { type: 'integer' }, emailsSent: { type: 'integer' } } },
    },
  },
  WorldIdStatus: {
    type: 'object', required: ['handle', 'is_human'],
    properties: { handle: HANDLE, is_human: { type: 'boolean' }, verification_level: { type: 'string', description: 'Present only when `is_human` is true.' }, verified_at: { ...UNIX_TS, description: 'Present only when `is_human` is true.' } },
  },
  WorldIdRpSignature: {
    type: 'object', required: ['sig', 'nonce', 'created_at', 'expires_at'],
    properties: { sig: { type: 'string' }, nonce: { type: 'string' }, created_at: { type: 'integer' }, expires_at: { type: 'integer' } },
  },
  WorldIdVerifyRequest: { type: 'object', required: ['idkit_result'], properties: { idkit_result: { type: 'object', additionalProperties: true, description: 'Raw IDKit v3/v4 result object (must contain responses[0].nullifier).' } } },
  WorldIdVerifyResponse: {
    type: 'object', required: ['ok', 'is_human'],
    properties: { ok: { type: 'boolean', const: true }, is_human: { type: 'boolean', const: true }, verification_level: { type: 'string' }, protocol_version: { type: 'string' }, message: { type: 'string' } },
  },
  OkResponse: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', const: true }, message: { type: 'string' } } },
});

// ── Credits / Pro ──
Object.assign(schemas, {
  CreditsBalance: {
    type: 'object', required: ['handle', 'credits', 'pricing'],
    properties: {
      handle: HANDLE,
      credits: { type: 'integer', description: '1 credit = 1 external email. New accounts start with 10.' },
      pricing: {
        type: 'object', required: ['credits_per_eth', 'cost_per_email_usd', 'example', 'min_purchase', 'deposit_address'],
        properties: {
          credits_per_eth: { type: 'integer', const: 1000000 },
          cost_per_email_usd: { type: 'string', example: '$0.002' },
          example: { type: 'string' }, min_purchase: { type: 'string' },
          deposit_address: { type: 'string', description: 'Send ETH here on Base (or ETH mainnet), then POST /api/credits/buy.' },
        },
      },
    },
  },
  TxHashRequest: {
    type: 'object', required: ['tx_hash'],
    properties: { tx_hash: TX_HASH, chain_id: { type: 'integer', enum: [8453, 1], description: 'Chain to check first (auto-detects both). Default 8453 (Base).' } },
  },
  CreditsBuyResponse: {
    type: 'object', required: ['success', 'purchased', 'eth_spent', 'balance', 'tx_hash', 'chain'],
    properties: { success: { type: 'boolean', const: true }, purchased: { type: 'integer' }, eth_spent: { type: 'string' }, balance: { type: 'integer' }, tx_hash: TX_HASH, chain: { type: 'string', enum: ['Base', 'ETH Mainnet'] } },
  },
  CreditTransaction: {
    type: 'object', required: ['id', 'handle', 'type', 'amount', 'created_at'],
    properties: {
      id: { type: 'string' }, handle: HANDLE,
      type: { type: 'string', enum: ['purchase', 'send_external', 'pro_purchase'] },
      amount: { type: 'integer', description: 'Credits delta (negative for spends).' },
      tx_hash: NULLABLE_STR, price_wei: NULLABLE_STR, created_at: UNIX_TS,
    },
  },
  CreditsHistoryResponse: { type: 'object', required: ['transactions'], properties: { transactions: { type: 'array', items: ref('CreditTransaction'), description: 'Most recent 50.' } } },
  ProStatus: {
    type: 'object', required: ['handle', 'tier', 'is_pro', 'benefits', 'upgrade'],
    properties: {
      handle: HANDLE, tier: { type: 'string', enum: ['free', 'pro'] }, is_pro: { type: 'boolean' },
      benefits: { type: 'array', items: { type: 'string' } },
      upgrade: { type: ['object', 'null'], description: 'null when already Pro.', properties: { price_eth: { type: 'string' }, price_wei: { type: 'string' }, description: { type: 'string' }, method: { type: 'string' }, body: { type: 'string' }, deposit_address: { type: 'string' } } },
    },
  },
  ProBuyResponse: {
    type: 'object', required: ['success', 'tier', 'email', 'eth_spent', 'chain', 'bonus_credits', 'benefits'],
    properties: { success: { type: 'boolean', const: true }, tier: { type: 'string', const: 'pro' }, email: EMAIL_ADDR, eth_spent: { type: 'string' }, chain: { type: 'string' }, bonus_credits: { type: 'integer', description: 'Overpayment converted to credits at 1 ETH = 1,000,000 credits.' }, benefits: { type: 'array', items: { type: 'string' } } },
  },

  // ── Attention Bonds (USDC, v2) ──
  AttentionPrice: {
    type: 'object', required: ['handle', 'attention_bonds_enabled'],
    description: 'When `attention_bonds_enabled` is false only `price_usdc` (0) and `note` are returned.',
    properties: {
      handle: HANDLE, attention_bonds_enabled: { type: 'boolean' },
      price_usdc: { type: 'number', description: 'Only when disabled (always 0).' }, note: { type: 'string' },
      base_price_usdc: { type: 'number' }, current_price_usdc: { type: 'number', description: 'p(t) = p₀·(1+α·D(t))^β' },
      demand_7d: { type: 'integer' }, response_window_hours: { type: 'integer' },
      parameters: { type: 'object', properties: { alpha: { type: 'number' }, beta: { type: 'number' }, gamma: { type: 'number' } } },
    },
    example: { handle: 'alice', attention_bonds_enabled: true, base_price_usdc: 0.01, current_price_usdc: 0.012, demand_7d: 2, response_window_hours: 168, parameters: { alpha: 0.1, beta: 1, gamma: 0.5 } },
  },
  AttentionSenderPrice: {
    type: 'object', required: ['handle', 'sender', 'price_usdc'],
    properties: { handle: HANDLE, sender: HANDLE, price_usdc: { type: 'number' }, bonds_required: { type: 'boolean', description: 'Only when bonds are disabled (false).' }, whitelisted: { type: 'boolean' }, reply_rate: { type: 'number' }, demand_7d: { type: 'integer' } },
  },
  QafScore: {
    type: 'object', required: ['handle', 'qaf_value', 'unique_senders'],
    properties: { handle: HANDLE, qaf_value: { type: 'number' }, coqaf_value: { type: 'number' }, unique_senders: { type: 'integer' }, total_bonds: { type: 'number', description: 'Only when no score row exists (0).' }, total_bonds_usdc: { type: 'number' }, breadth_premium: { type: 'number' }, updated_at: UNIX_TS },
  },
  CoqafBreakdown: {
    type: 'object', required: ['handle', 'qaf_value', 'coqaf_value', 'senders'],
    properties: {
      handle: HANDLE, qaf_value: { type: 'number' }, coqaf_value: { type: 'number' },
      discount_ratio: { type: 'number' }, alpha_method: { type: 'string', const: 'jaccard_recipient_overlap' }, alpha_description: { type: 'string' },
      senders: { type: 'array', items: { type: 'object', required: ['sender', 'bond_usdc', 'sum_alpha', 'discounted_bond', 'connections'], properties: { sender: HANDLE, bond_usdc: { type: 'number' }, sum_alpha: { type: 'number' }, discounted_bond: { type: 'number' }, connections: { type: 'array', items: { type: 'object', properties: { sender: HANDLE, alpha: { type: 'number' } } } } } } },
    },
  },
  AttentionConfigRequest: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      base_price: { type: 'number', minimum: 0.001, maximum: 1000, description: 'USDC' },
      alpha: { type: 'number', minimum: 0, maximum: 10 }, beta: { type: 'number', minimum: 0.1, maximum: 5 }, gamma: { type: 'number', minimum: 0, maximum: 0.99 },
      response_window_hours: { type: 'number', description: 'Clamped to 24–720 hours.' },
    },
  },
  AttentionConfigResponse: { type: 'object', required: ['success', 'handle', 'config'], properties: { success: { type: 'boolean', const: true }, handle: HANDLE, config: ref('AttentionConfigRequest') } },
  AttentionConfigGet: {
    type: 'object', required: ['handle', 'config'],
    properties: { handle: HANDLE, config: { type: 'object', additionalProperties: true, description: 'Stored attention_config row, or `{ enabled: false }` if none.' } },
  },
  AttentionWhitelistEntry: { type: 'object', properties: { sender_handle: NULLABLE_STR, sender_wallet: NULLABLE_STR, note: NULLABLE_STR, created_at: UNIX_TS } },
  AttentionWhitelist: { type: 'object', required: ['handle', 'whitelist'], properties: { handle: HANDLE, whitelist: { type: 'array', items: ref('AttentionWhitelistEntry') } } },
  AttentionWhitelistRequest: { type: 'object', properties: { sender_handle: HANDLE, sender_wallet: ADDRESS, note: { type: 'string' } }, description: 'Provide at least one of sender_handle / sender_wallet.' },
  IdResponse: { type: 'object', required: ['success', 'id'], properties: { success: { type: 'boolean', const: true }, id: { type: 'string' } } },
  AttentionStats: {
    type: 'object', required: ['handle', 'bonds_received', 'bonds_sent', 'qaf', 'email_activity'],
    properties: {
      handle: HANDLE,
      bonds_received: { type: 'object', additionalProperties: true, description: 'total, active, refunded, forfeited, total_usdc, refunded_usdc, forfeited_usdc (nulls when no rows).' },
      bonds_sent: { type: 'object', additionalProperties: true },
      qaf: { type: 'object', properties: { qaf_value: { type: 'number' }, unique_senders: { type: 'integer' }, total_bonds: { type: 'number' } } },
      email_activity: { type: 'object', properties: { received: { type: 'integer' }, sent: { type: 'integer' }, unique_senders: { type: 'integer' }, unique_recipients: { type: 'integer' }, reply_rate: { type: 'number' } } },
    },
  },
  AttentionReplyResponse: {
    type: 'object', required: ['success', 'email_id', 'status', 'refund_usdc', 'protocol_fee_usdc'],
    properties: { success: { type: 'boolean', const: true }, email_id: { type: 'string' }, status: { type: 'string', const: 'refunded' }, refund_usdc: { type: 'number' }, protocol_fee_usdc: { type: 'number', description: '10% protocol fee τ.' }, note: { type: 'string' } },
  },
  AttentionBond: {
    type: 'object', required: ['email_id', 'recipient_handle', 'amount_usdc', 'status', 'deposit_time', 'response_deadline', 'time_remaining_sec'],
    properties: { email_id: { type: 'string' }, recipient_handle: HANDLE, amount_usdc: { type: 'number' }, tx_hash: NULLABLE_STR, status: { type: 'string', enum: ['active', 'refunded', 'forfeited'] }, deposit_time: UNIX_TS, response_deadline: UNIX_TS, resolved_time: NULLABLE_INT, refund_tx_hash: NULLABLE_STR, time_remaining_sec: { type: 'integer' } },
  },
  MyBondsResponse: { type: 'object', required: ['bonds', 'total'], properties: { bonds: { type: 'array', items: ref('AttentionBond') }, total: { type: 'integer' } } },

  // ── $ATTN (v3, off-chain points) ──
  AttnBalance: {
    type: 'object', required: ['handle', 'balance', 'daily_earned', 'daily_earn_cap', 'daily_earn_remaining', 'can_claim', 'next_claim_at', 'next_claim_in_seconds', 'constants'],
    properties: {
      handle: HANDLE, balance: { type: 'integer' }, daily_earned: { type: 'integer' }, daily_earn_cap: { type: 'integer', const: 200 }, daily_earn_remaining: { type: 'integer' },
      can_claim: { type: 'boolean' }, next_claim_at: { ...NULLABLE_INT, description: 'Unix ts of next drip, null if claimable now.' }, next_claim_in_seconds: { type: 'integer' },
      constants: { type: 'object', properties: { daily_drip: { type: 'integer' }, cold_stake: { type: 'integer' }, reply_stake: { type: 'integer' }, reply_bonus: { type: 'integer' }, buy_rate: { type: 'string' } } },
    },
    example: { handle: 'alice', balance: 50, daily_earned: 0, daily_earn_cap: 200, daily_earn_remaining: 200, can_claim: true, next_claim_at: null, next_claim_in_seconds: 0, constants: { daily_drip: 10, cold_stake: 3, reply_stake: 1, reply_bonus: 2, buy_rate: '1 USDC = 100 ATTN' } },
  },
  AttnClaimResponse: {
    type: 'object', required: ['claimed', 'balance'],
    description: 'Not an error when `claimed` is false — check `reason`.',
    properties: {
      claimed: { type: 'boolean' }, amount: { type: 'integer', description: 'Present when claimed (always 10).' }, balance: { type: 'integer' },
      reason: { type: 'string', enum: ['already_claimed', 'daily_cap_reached'], description: 'Present when `claimed` is false.' },
      next_claim_at: UNIX_TS, next_claim_in_seconds: { type: 'integer' },
    },
    example: { claimed: true, amount: 10, balance: 60, next_claim_at: 1735776000, next_claim_in_seconds: 86400 },
  },
  AttnTransaction: {
    type: 'object', required: ['id', 'amount', 'type', 'created_at'],
    properties: { id: { type: 'string' }, amount: { type: 'integer', description: 'Signed delta.' }, type: { type: 'string', enum: ['signup_grant', 'drip_claim', 'stake', 'refund', 'reply_bonus', 'compensation', 'forfeit', 'purchase', 'airdrop'] }, ref_email_id: NULLABLE_STR, note: NULLABLE_STR, created_at: UNIX_TS },
  },
  AttnHistoryResponse: { type: 'object', required: ['transactions', 'total', 'limit', 'offset'], properties: { transactions: { type: 'array', items: ref('AttnTransaction') }, total: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } } },
  AttnSettings: {
    type: 'object', required: ['handle', 'receive_price', 'min', 'max'],
    properties: { handle: HANDLE, receive_price: { type: 'integer', description: 'ATTN a sender must stake to email you (reply threads). Cold emails stake max(receive_price, 3).' }, min: { type: 'integer', const: 1 }, max: { type: 'integer', const: 10 }, note: { type: 'string' } },
  },
  AttnSettingsRequest: { type: 'object', required: ['receive_price'], properties: { receive_price: { type: 'integer', minimum: 1, maximum: 10 } } },
  AttnSettingsUpdated: { type: 'object', required: ['success', 'receive_price'], properties: { success: { type: 'boolean', const: true }, receive_price: { type: 'integer' } } },
  AttnBuyRequest: { type: 'object', required: ['tx_hash'], properties: { tx_hash: { ...TX_HASH, description: 'Hash of a USDC transfer on Base mainnet sent from your wallet.' }, network: { type: 'string', default: 'base-mainnet', description: 'Reserved; only base-mainnet is verified today.' } } },
  AttnBuyResponse: {
    type: 'object', required: ['success', 'usdc_spent', 'attn_received', 'rate', 'tx_hash'],
    properties: { success: { type: 'boolean', const: true }, usdc_spent: { type: 'string' }, attn_received: { type: 'integer' }, rate: { type: 'string', const: '1 USDC = 100 ATTN' }, tx_hash: TX_HASH },
  },
  AttnPrice: {
    type: 'object', required: ['handle', 'attn_enabled', 'cold_email_stake', 'reply_thread_stake'],
    properties: { handle: HANDLE, attn_enabled: { type: 'boolean', const: true }, cold_email_stake: { type: 'integer' }, reply_thread_stake: { type: 'integer' }, note: { type: 'string' } },
    example: { handle: 'alice', attn_enabled: true, cold_email_stake: 3, reply_thread_stake: 1 },
  },
  AirdropScore: {
    type: 'object', required: ['breakdown', 'base_score', 'multiplier', 'total'],
    properties: {
      breakdown: { type: 'object', properties: { emails_received: { type: 'integer' }, emails_read: { type: 'integer' }, emails_replied: { type: 'integer' }, emails_sent: { type: 'integer' }, attn_staked: { type: 'number' }, days_since_signup: { type: 'integer' } } },
      base_score: { type: 'integer' }, multiplier: { type: 'number' }, total: { type: 'integer' },
    },
  },
  AirdropWave: {
    type: 'object', required: ['id', 'name', 'description', 'badge', 'multiplier', 'status', 'score', 'claim_opens_at', 'claim_opens_in_seconds', 'claimed'],
    properties: {
      id: { type: 'string', example: 'wave1-early-bird' }, name: { type: 'string' }, description: { type: 'string' }, badge: { type: 'string' }, multiplier: { type: 'number' },
      status: { type: 'string', enum: ['preview', 'claimable', 'claimed', 'expired'] },
      score: ref('AirdropScore'), claim_opens_at: UNIX_TS, claim_opens_in_seconds: { type: 'integer' },
      claimed: { type: ['object', 'null'], properties: { amount: { type: 'integer' }, claimed_at: UNIX_TS } },
    },
  },
  AirdropWavesResponse: { type: 'object', required: ['waves'], properties: { waves: { type: 'array', items: ref('AirdropWave') } } },
  AirdropClaimResponse: { type: 'object', required: ['claimed', 'wave', 'amount', 'score'], properties: { claimed: { type: 'boolean', const: true }, wave: { type: 'string' }, amount: { type: 'integer' }, score: ref('AirdropScore') } },
  AirdropLeaderboard: { type: 'object', required: ['wave', 'leaderboard'], properties: { wave: { type: 'string' }, leaderboard: { type: 'array', maxItems: 20, items: { type: 'object', properties: { handle: HANDLE, amount: { type: 'integer' }, claimed_at: UNIX_TS } } } } },
});

// ── Webhooks / Aliases / Settings / Claims / Keys / Stats / Discovery ──
Object.assign(schemas, {
  WebhookCreateRequest: {
    type: 'object', required: ['url'],
    properties: { url: { type: 'string', format: 'uri', description: 'HTTPS endpoint to receive POST callbacks.' }, events: { type: 'array', items: { type: 'string' }, default: ['message.received'], description: 'Events to subscribe to.' } },
    example: { url: 'https://example.com/hooks/basemail', events: ['message.received'] },
  },
  Webhook: {
    type: 'object', required: ['id', 'url', 'events', 'active', 'created_at'],
    properties: { id: { type: 'string', format: 'uuid' }, url: { type: 'string', format: 'uri' }, events: { type: 'string', description: 'Comma-separated event list, e.g. `message.received`.' }, active: { type: 'integer', enum: [0, 1] }, created_at: UNIX_TS, last_triggered_at: NULLABLE_INT },
  },
  WebhookCreated: {
    allOf: [ref('Webhook'), { type: 'object', required: ['secret'], properties: { secret: { type: 'string', description: 'HMAC-SHA256 secret (hex). Shown once. Verify deliveries via `X-BaseMail-Signature: sha256=<hmac of body>`.' }, note: { type: 'string' } } }],
    example: { id: '9f1c…', url: 'https://example.com/hooks/basemail', events: 'message.received', secret: 'a3f9…', active: 1, created_at: 1735689600, note: 'Store the secret now. It will not be shown again.' },
  },
  WebhooksList: { type: 'object', required: ['webhooks'], properties: { webhooks: { type: 'array', items: ref('Webhook') } } },
  Alias: { type: 'object', required: ['handle', 'email', 'basename', 'created_at'], properties: { handle: HANDLE, email: EMAIL_ADDR, basename: { type: 'string' }, created_at: UNIX_TS } },
  AliasesResponse: {
    type: 'object', required: ['primary_handle', 'primary_email', 'aliases'],
    properties: { primary_handle: HANDLE, primary_email: EMAIL_ADDR, aliases: { type: 'array', items: ref('Alias') } },
    example: { primary_handle: 'alice', primary_email: 'alice@basemail.ai', aliases: [{ handle: 'canflyai', email: 'canflyai@basemail.ai', basename: 'canflyai.base.eth', created_at: 1735689600 }] },
  },
  AliasAddRequest: { type: 'object', description: 'Provide `handle` or `basename`.', properties: { handle: { type: 'string', example: 'canflyai' }, basename: { type: 'string', example: 'canflyai.base.eth' } } },
  AliasAddResponse: { type: 'object', required: ['success', 'alias_email', 'basename', 'primary_handle'], properties: { success: { type: 'boolean', const: true }, alias_email: EMAIL_ADDR, basename: { type: 'string' }, primary_handle: HANDLE, message: { type: 'string' } } },
  AliasRemoveResponse: { type: 'object', required: ['success', 'removed'], properties: { success: { type: 'boolean', const: true }, removed: EMAIL_ADDR } },
  Settings: {
    type: 'object', required: ['handle', 'wallet', 'aliases'],
    properties: {
      handle: HANDLE, wallet: ADDRESS, basename: NULLABLE_STR, notification_email: NULLABLE_STR, webhook_url: NULLABLE_STR,
      aliases: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, handle: HANDLE, basename: { type: 'string' }, is_primary: { type: 'integer', enum: [0, 1] }, expiry: NULLABLE_INT, created_at: UNIX_TS } } },
    },
  },
  SettingsUpdateRequest: { type: 'object', properties: { notification_email: { type: ['string', 'null'], format: 'email', description: 'External address to notify on new mail. null/omit to clear.' } } },
  SettingsUpdateResponse: { type: 'object', required: ['success', 'notification_email'], properties: { success: { type: 'boolean', const: true }, notification_email: NULLABLE_STR } },
  SettingsAliasRequest: { type: 'object', required: ['basename'], properties: { basename: { type: 'string', description: 'Must end with .base.eth' } } },
  SettingsAliasResponse: { type: 'object', required: ['success', 'handle', 'basename', 'expiry'], properties: { success: { type: 'boolean', const: true }, handle: HANDLE, basename: { type: 'string' }, expiry: NULLABLE_INT } },
  PrimaryHandleRequest: { type: 'object', required: ['handle'], properties: { handle: { ...HANDLE, description: 'An alias handle owned by this wallet to promote to primary.' } } },
  PrimaryHandleResponse: { type: 'object', required: ['success', 'handle', 'old_handle', 'basename', 'token'], properties: { success: { type: 'boolean', const: true }, handle: HANDLE, old_handle: HANDLE, basename: { type: 'string' }, token: { type: 'string', description: 'New JWT for the new primary handle.' } } },
  Claim: {
    type: 'object', required: ['claim_id', 'sender', 'recipient_email', 'amount_usdc', 'network', 'status', 'expires_at', 'created_at', 'expired'],
    properties: {
      claim_id: { type: 'string' }, sender: HANDLE, recipient_email: EMAIL_ADDR, amount_usdc: { type: 'number' },
      network: { type: 'string', enum: ['base-mainnet', 'base-sepolia'] }, status: { type: 'string', enum: ['pending', 'claimed', 'expired'] },
      expires_at: UNIX_TS, created_at: UNIX_TS, expired: { type: 'boolean' },
      claim_url: { type: 'string', format: 'uri', description: 'Present while claimable.' },
      api: { type: 'object', additionalProperties: true, description: 'Agent-friendly claim instructions (endpoint, method, auth, instructions[]). Present while claimable.' },
    },
  },
  ClaimResponse: {
    type: 'object', required: ['success', 'claim_id', 'amount_usdc', 'release_tx', 'receipt_email_id', 'claimer', 'new_account'],
    properties: { success: { type: 'boolean', const: true }, claim_id: { type: 'string' }, amount_usdc: { type: 'string' }, release_tx: TX_HASH, receipt_email_id: { type: 'string' }, claimer: HANDLE, new_account: { type: 'boolean', description: 'true if a BaseMail account was auto-created for the claiming wallet.' }, token: { type: 'string', description: 'JWT for the auto-created account. Present only when `new_account` is true.' } },
  },
  ApiKeyCreateRequest: { type: 'object', properties: { name: { type: 'string', maxLength: 64 }, scopes: { type: 'array', items: { type: 'string' }, default: ['send', 'inbox'], description: 'Informational today; keys currently grant the same access as a JWT for the handle.' } } },
  ApiKeyCreated: {
    type: 'object', required: ['api_key', 'handle', 'scopes', 'note'],
    properties: { api_key: { type: 'string', pattern: '^bm_live_[0-9a-f]{48}$', description: 'Shown once. Use as `Authorization: Bearer bm_live_…`.' }, handle: HANDLE, scopes: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } },
    example: { api_key: 'bm_live_0123…', handle: 'alice', scopes: ['send', 'inbox'], note: 'Store this API key now. It will not be shown again.' },
  },
  ApiKey: { type: 'object', required: ['id', 'scopes', 'created_at'], properties: { id: { type: 'string', description: 'First 12 hex chars of the key hash; usable as `key_id` for revoke.' }, name: NULLABLE_STR, scopes: { type: 'array', items: { type: 'string' } }, created_at: UNIX_TS, last_used_at: NULLABLE_INT, revoked_at: NULLABLE_INT } },
  ApiKeysList: { type: 'object', required: ['keys'], properties: { keys: { type: 'array', items: ref('ApiKey') } } },
  ApiKeyRevokeRequest: { type: 'object', description: 'Provide `api_key` (full plaintext) or `key_id` (≥ 6-char prefix of the hash id).', properties: { api_key: { type: 'string' }, key_id: { type: 'string', minLength: 6 } } },
  Stats: {
    type: 'object', required: ['agents', 'email_events', 'sent', 'received'],
    properties: { agents: { type: 'integer', description: 'Registered accounts.' }, email_events: { type: 'integer', description: 'All email rows (internal mail counts twice: sent + received).' }, sent: { type: 'integer' }, received: { type: 'integer' } },
    example: { agents: 1234, email_events: 5678, sent: 2345, received: 3333 },
  },
  AgentsList: { type: 'object', required: ['handles'], properties: { handles: { type: 'array', items: HANDLE, maxItems: 500, description: 'Newest first; 0x handles excluded.' } } },
  ServiceRegistration: {
    type: 'object', required: ['type', 'name', 'description', 'services', 'active', 'supportedTrust'],
    properties: { type: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, image: { type: 'string', format: 'uri' }, services: { type: 'array', items: ref('AgentService') }, agentDirectory: { type: 'string' }, active: { type: 'boolean' }, supportedTrust: { type: 'array', items: { type: 'string' } }, payment: { type: 'object', additionalProperties: true } },
  },
  DocsResponse: { type: 'object', required: ['service', 'version', 'base_url', 'endpoints'], properties: { service: { type: 'string' }, version: { type: 'string' }, base_url: { type: 'string', format: 'uri' }, description: { type: 'string' }, quick_start: { type: 'object', additionalProperties: true }, endpoints: { type: 'object', additionalProperties: true }, notes: { type: 'array', items: { type: 'string' } } }, additionalProperties: true },
  OpenApiDocument: { type: 'object', required: ['openapi', 'info', 'paths'], properties: { openapi: { type: 'string', const: '3.1.0' }, info: { type: 'object', additionalProperties: true }, paths: { type: 'object', additionalProperties: true } }, additionalProperties: true },
});

// ── paths ────────────────────────────────────────────────────────────────────

const PUBLIC: J[] = [];
const HANDLE_PATH = pathParam('handle', 'BaseMail handle (case-insensitive).', { type: 'string' }, 'alice');
const EMAIL_ID_PATH = pathParam('id', 'Email ID as returned by GET /api/inbox.', { type: 'string' }, 'm1abc-0f9e8d7c6b5a');

const paths: J = {};

// ── Auth ──
Object.assign(paths, {
  '/api/auth/start': {
    post: {
      operationId: 'authStart', tags: ['Auth'], security: PUBLIC,
      summary: 'Get SIWE message + nonce',
      description: 'Step 1 of agent login. Returns a Sign-In-With-Ethereum message and a one-time nonce (5 min TTL) for the given wallet. Public, free. Sign the `message` verbatim (EIP-191 personal_sign) and submit it to `authAgentRegister`.',
      requestBody: jsonBody(ref('AuthStartRequest'), { address: '0x0000000000000000000000000000000000000001' }),
      responses: {
        '200': jsonRes('SIWE message and nonce', ref('AuthStartResponse')),
        '400': errRes('Missing or malformed address', { error: 'Valid Ethereum address is required. Example: { "address": "0x..." }' }),
      },
    },
  },
  '/api/auth/agent-register': {
    post: {
      operationId: 'authAgentRegister', tags: ['Auth', 'Registration'], security: PUBLIC,
      summary: 'Verify signature and register (one call)',
      description: 'Step 2 of agent login. Verifies the SIWE signature; if the wallet is new, creates the @basemail.ai account (10 free credits, 50 ATTN) and returns **201**; if already registered, returns the existing account with a fresh token (**200**). Pass `basename` to bind a Basename you own. Public, free. Rate limited: 5 registrations per IP per hour.',
      requestBody: jsonBody(ref('AgentRegisterRequest'), { address: '0x…', signature: '0x…', message: 'MESSAGE_FROM_STEP_1' }),
      responses: {
        '200': jsonRes('Wallet already registered — existing account + new token', ref('AgentRegisterResponse'), { token: 'eyJ...', refresh_token: 'rt_…', email: 'yourname@basemail.ai', handle: 'yourname', wallet: '0x…', basename: 'yourname.base.eth', tier: 'free', registered: true, new_account: false }),
        '201': jsonRes('New account created', ref('AgentRegisterResponse')),
        '400': errRes('address, signature and message are required', { error: 'address, signature, and message are required', hint: 'Step 1: POST /api/auth/start { address } …' }),
        '401': errRes('SIWE verification failed. `code` is one of `no_nonce_in_message`, `nonce_expired`, `signature_invalid`.', { error: 'Nonce has expired (5 min TTL) or was already used. Call POST /api/auth/start again for a fresh nonce.', code: 'nonce_expired' }),
        '403': errRes('Requested Basename is not owned by this wallet', { error: 'Basename alice.base.eth is not owned by 0x…', hint: 'If you just registered this Basename, the transaction may not be finalized yet. Wait ~15 seconds and retry.' }),
        '409': errRes('Handle already registered by another wallet', { error: 'This identity is already registered by another wallet' }),
        '429': rateLimited('registrations', '5 registrations per IP per hour'),
        '503': errRes('Server misconfigured (JWT secret missing)', { error: 'Server misconfigured: JWT_SECRET missing' }),
      },
    },
  },
  '/api/auth/verify': {
    post: {
      operationId: 'authVerify', tags: ['Auth'], security: PUBLIC,
      summary: 'Verify SIWE signature (no auto-register)',
      description: 'Verifies the signature and returns a JWT **without** creating an account. If the wallet is unregistered the token has an empty handle and `registered: false`; use it for `registerEmail`. Also reports Basename detection / upgrade availability. Prefer `authAgentRegister` for agents.',
      requestBody: jsonBody(ref('SiweRequest')),
      responses: {
        '200': jsonRes('Verification result', ref('AuthVerifyResponse')),
        '400': errRes('Missing fields', { error: 'address, signature, and message are required' }),
        '401': errRes('SIWE verification failed (see `code`)', { error: 'Signature verification failed. Ensure you sign the exact message string with the correct private key (personal_sign / EIP-191).', code: 'signature_invalid' }),
        '503': errRes('Server misconfigured', { error: 'Server misconfigured: JWT_SECRET missing' }),
      },
    },
  },
  '/api/auth/refresh': {
    post: {
      operationId: 'authRefresh', tags: ['Auth'], security: PUBLIC,
      summary: 'Exchange refresh token for a new JWT',
      description: 'Returns a fresh 24h JWT for a valid refresh token (issued by `authAgentRegister` / `authVerify`). Set `rotate: true` to also receive a new refresh token. Public (the refresh token is the credential).',
      requestBody: jsonBody(ref('AuthRefreshRequest'), { refresh_token: 'rt_…', rotate: true }),
      responses: {
        '200': jsonRes('New JWT (and refresh token when rotated)', ref('AuthRefreshResponse'), { token: 'eyJ…', refresh_token: 'rt_…' }),
        '400': errRes('refresh_token missing', { error: 'refresh_token is required' }),
        '401': errRes('Refresh token invalid or expired', { error: 'Invalid or expired refresh token' }),
        '503': errRes('Server misconfigured', { error: 'Server misconfigured: JWT_SECRET missing' }),
      },
    },
  },
  '/api/auth/nonce': {
    get: {
      operationId: 'authNonce', tags: ['Auth'], security: PUBLIC, deprecated: true,
      summary: 'Get a nonce (legacy)',
      description: 'Legacy two-step flow. Returns a one-time nonce only. Use `authStart` instead, which returns the nonce and the full SIWE message together. Public, free.',
      responses: { '200': jsonRes('Nonce', ref('NonceResponse'), { nonce: '3c5f…' }) },
    },
  },
  '/api/auth/message': {
    post: {
      operationId: 'authMessage', tags: ['Auth'], security: PUBLIC, deprecated: true,
      summary: 'Build SIWE message from nonce (legacy)',
      description: 'Legacy two-step flow. Builds the SIWE message for an address + nonce. Use `authStart` instead. Public, free.',
      requestBody: jsonBody(ref('MessageRequest')),
      responses: {
        '200': jsonRes('SIWE message', ref('MessageResponse')),
        '400': errRes('Missing fields', { error: 'address and nonce are required' }),
      },
    },
  },
});

// ── Registration ──
Object.assign(paths, {
  '/api/register': {
    post: {
      operationId: 'registerEmail', tags: ['Registration'],
      summary: 'Register a @basemail.ai inbox',
      description: 'Creates the email account for the authenticated wallet. Auth: Bearer JWT from `authVerify` (or an MPP `Payment` credential — $1.00 USDC.e on Tempo — when MPP is enabled; no Bearer needed in that case). Handle precedence: `basename` you own → `auto_basename` purchase (platform pays gas, ≤ 0.002 ETH names) → reverse-resolved Basename → lowercase 0x address. If the wallet is already registered and `basename` is supplied, the Basename is added as an alias (200) instead of failing (409). New accounts start with 10 free external-email credits. Rate limited: 5/IP/hour; sponsored Basename purchases 2/IP/day.',
      'x-payment-info': { amount: '1000000', currency: '0x20c000000000000000000000b9537d11c60e8b50', description: 'Register email inbox ($1.00)', intent: 'charge', method: 'tempo' },
      requestBody: jsonBody(ref('RegisterRequest'), { basename: 'alice.base.eth' }, false),
      responses: {
        '200': jsonRes('Wallet already registered — Basename added as alias', ref('RegisterAliasAddedResponse')),
        '201': jsonRes('Account created', ref('RegisterResponse')),
        '400': errRes('Invalid `basename_name`, or name too expensive for auto-purchase', { error: 'basename_name is required (3-32 chars, a-z, 0-9, -)' }),
        '401': unauthorized(),
        '402': errRes('Payment Required — MPP challenge (only when no Bearer token is sent and MPP is enabled). Body/headers follow the MPP spec (https://mpp.dev); pay $1.00 USDC.e on Tempo and retry with the `Payment` header.'),
        '403': errRes('Basename not owned by this wallet', { error: 'Basename alice.base.eth is not owned by 0x…', hint: 'If you just registered this Basename, wait ~15 seconds for on-chain finalization and retry.' }),
        '409': errRes('Wallet or handle already registered', { error: 'This wallet already has a registered email', existing_handle: '0x…', hint: 'To add another Basename as an alias, pass { "basename": "yourname.base.eth" }' }),
        '429': rateLimited('registrations', '5 registrations per IP per hour; 2 sponsored Basename purchases per IP per day'),
        '500': errRes('On-chain Basename purchase or price check failed', { error: 'Basename registration failed: …' }),
        '503': errRes('Basename auto-registration not configured on the server', { error: 'Basename auto-registration is not configured' }),
      },
    },
  },
  '/api/register/upgrade': {
    put: {
      operationId: 'upgradeHandle', tags: ['Registration'],
      summary: 'Upgrade 0x handle to a Basename handle',
      description: 'For accounts registered as `0x…@basemail.ai`. Either claim a Basename you already own (`basename`, or auto-detected via reverse resolution) or buy one (`auto_basename` + `basename_name`; platform pays gas, names > 0.002 ETH rejected). Migrates all emails, keys, bonds and settings to the new handle and returns a new JWT. Auth: Bearer. Rate limited: sponsored purchases 2/IP/day.',
      requestBody: jsonBody(ref('RegisterRequest'), { auto_basename: true, basename_name: 'desiredname' }, false),
      responses: {
        '200': jsonRes('Handle upgraded', ref('UpgradeResponse')),
        '400': errRes('Account already has a Basename handle, or invalid/expensive `basename_name`', { error: 'Account already has a Basename handle', handle: 'alice' }),
        '401': unauthorized(),
        '403': errRes('Provided Basename is not owned by this wallet', { error: 'Basename alice.base.eth is not owned by 0x…' }),
        '404': errRes('Account not found, or no Basename found for this wallet', { error: 'No Basename found for this wallet. Get one at https://www.base.org/names' }),
        '409': errRes('Name unavailable on-chain or handle taken', { error: 'Basename "alice.base.eth" is not available', hint: 'If you already own this Basename, use { "basename": "alice.base.eth" } instead of auto_basename.' }),
        '429': rateLimited('sponsored Basename registrations', '2 sponsored Basename purchases per IP per day'),
        '500': errRes('Upgrade failed (on-chain purchase, price check, or migration error)', { error: 'Upgrade error: …' }),
        '503': errRes('Basename auto-registration not configured', { error: 'Basename auto-registration is not configured' }),
      },
    },
  },
  '/api/register/check/{query}': {
    get: {
      operationId: 'checkRegistration', tags: ['Registration'], security: PUBLIC,
      summary: 'Check wallet or name availability',
      description: 'Universal lookup. For a **wallet address**: previews the email it would get, whether it is registered, and whether it owns a Basename NFT. For a **name** (with or without `.base.eth`): reports `status` = available | taken | reserved | unknown, on-chain price, and direct-buy steps. Public, free, cached 60s.',
      parameters: [pathParam('query', 'Wallet address (0x…) or Basename label / `name.base.eth`.', { type: 'string' }, 'alice')],
      responses: {
        '200': jsonRes('Availability / preview', ref('RegisterCheckResponse'), { handle: 'alice', email: 'alice@basemail.ai', basename: 'alice.base.eth', source: 'basename', registered: false, available_basemail: true, available_onchain: true, status: 'available', price_info: { available: true, price_wei: '1000000000000000', price_eth: '0.001', duration_years: 1, registrar: '0xa7d2607c6BD39Ae9521e514026CBB078405Ab322', chain_id: 8453, buy_url: 'https://www.base.org/names/alice' } }),
        '400': errRes('Input is neither a wallet address nor a valid name', { error: 'Invalid input. Provide a wallet address (0x...) or Basename.' }),
      },
    },
  },
  '/api/register/price/{name}': {
    get: {
      operationId: 'getBasenamePrice', tags: ['Registration'], security: PUBLIC,
      summary: 'Get Basename availability and price',
      description: 'Checks on-chain availability of `name.base.eth` and its 1-year registration price. Public, free, cached 60s.',
      parameters: [pathParam('name', 'Basename label (3–32 chars, a-z 0-9 - _).', { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]*[a-z0-9]$', minLength: 3, maxLength: 32 }, 'desiredname')],
      responses: {
        '200': jsonRes('Price info', ref('BasenamePriceResponse'), { name: 'desiredname', basename: 'desiredname.base.eth', available: true, price_wei: '2000000000000000', price_eth: '0.002' }),
        '400': errRes('Invalid name format', { error: 'Invalid name format' }),
        '500': errRes('On-chain price query failed', { error: 'Price query failed: …' }),
      },
    },
  },
  '/api/register/buy-data/{name}': {
    get: {
      operationId: 'getBasenameBuyData', tags: ['Registration'], security: PUBLIC,
      summary: 'Get calldata to buy a Basename yourself',
      description: 'Returns the RegistrarController `register()` arguments and tx value (+10% buffer) so a wallet can purchase `name.base.eth` directly (no platform gas). Public, free.',
      parameters: [pathParam('name', 'Basename label.', { type: 'string' }, 'desiredname'), queryParam('owner', 'Wallet that will own the name.', ADDRESS)],
      responses: {
        '200': jsonRes('Contract call data', ref('BasenameBuyDataResponse')),
        '400': errRes('Invalid name or missing owner', { error: 'owner query param required (0x address)' }),
        '409': errRes('Name not available', { error: 'desiredname.base.eth is not available' }),
        '500': errRes('On-chain query failed'),
      },
    },
  },
  '/api/register/basenames/{address}': {
    get: {
      operationId: 'listWalletBasenames', tags: ['Registration'], security: PUBLIC,
      summary: 'List Basenames owned by a wallet',
      description: 'Reverse-resolves the wallet and merges stored aliases. Public, free.',
      parameters: [pathParam('address', 'Wallet address.', ADDRESS)],
      responses: {
        '200': jsonRes('Basenames', ref('WalletBasenamesResponse')),
        '400': errRes('Invalid address', { error: 'Invalid address' }),
      },
    },
  },
});

// ── Email ──
Object.assign(paths, {
  '/api/send': {
    post: {
      operationId: 'sendEmail', tags: ['Email'],
      summary: 'Send an email',
      description: 'Sends from `<handle>@basemail.ai`. Internal recipients (@basemail.ai) are free and delivered instantly (ATTN is auto-staked; refunded when the recipient reads). External recipients cost **1 credit** (free tier also rate limited: 30/IP/hour and 10/handle/hour; Pro exempt). Markdown bodies are auto-rendered to HTML. Auth: Bearer JWT or API key, or MPP `Payment` ($0.01 USDC.e on Tempo) when enabled. Free-tier mail gets a BaseMail signature.',
      'x-payment-info': { amount: '10000', currency: '0x20c000000000000000000000b9537d11c60e8b50', description: 'Send email ($0.01)', intent: 'charge', method: 'tempo' },
      requestBody: jsonBody(ref('SendRequest'), { to: 'recipient@example.com', subject: 'Hello from AI', body: 'Email content here' }),
      responses: {
        '200': jsonRes('Sent', ref('SendResponse'), { success: true, email_id: 'msg-123', from: 'alice@basemail.ai', to: 'recipient@example.com', subject: 'Hello from AI', internal: false, attachments: 0 }),
        '400': errRes('Validation failed: missing to/subject/body, invalid recipient, attachment > 10 MB, bad USDC payment, or unverifiable `from_handle`', { error: 'to, subject, and body are required' }),
        '401': unauthorized(),
        '402': errRes('Out of credits (external send), or MPP payment challenge when no Bearer token is sent', { error: "You've used all your free email credits", credits: 0, upgrade: { message: 'Every BaseMail account starts with 10 free external emails. To keep sending, add credits — just $0.002 per email.', pricing: '0.001 ETH ≈ 1,000 emails (~$2.70)', how_to: 'Send ETH on Base to your deposit address, then call POST /api/credits/buy with the tx_hash.', dashboard: 'https://basemail.ai/dashboard/credits', docs: 'https://api.basemail.ai/api/docs' } }),
        '403': errRes('No handle registered for this credential', { error: 'No email registered for this wallet or API key' }),
        '404': errRes('Internal recipient does not exist (only 0x addresses can receive pre-registration mail)', { error: 'Recipient not found: bob@basemail.ai' }),
        '413': errRes('Pre-storage email too large (max 1 MB)', { error: 'Email too large for pre-storage (max 1MB)' }),
        '429': rateLimited('external emails', 'free tier: 30 external emails per IP per hour and 10 per handle per hour; also 10 pre-stored emails per unregistered 0x recipient'),
        '500': errRes('Delivery provider failure', { error: 'Failed to send email: …' }),
      },
    },
  },
  '/api/inbox': {
    get: {
      operationId: 'listInbox', tags: ['Email'],
      summary: 'List emails',
      description: 'Lists email summaries for a folder, newest first (ATTN-staked mail floats to the top). Also lazily settles expired bonds/escrows. Auth: Bearer.',
      parameters: [
        queryParam('folder', 'Folder to list.', { type: 'string', enum: ['inbox', 'sent'], default: 'inbox' }),
        queryParam('limit', 'Page size (max 100).', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
        queryParam('offset', 'Pagination offset.', { type: 'integer', minimum: 0, default: 0 }),
        queryParam('bonded', 'If `true`, only inbox emails with an active USDC attention bond.', { type: 'boolean', default: false }),
        queryParam('sort', 'Sort column (bonded mode only).', { type: 'string', enum: ['created_at', 'bond_amount', 'deadline'], default: 'created_at' }),
        queryParam('order', 'Sort direction (bonded mode only).', { type: 'string', enum: ['asc', 'desc'] }),
      ],
      responses: {
        '200': jsonRes('Email list', ref('InboxResponse'), { emails: [{ id: 'm1abc-…', folder: 'inbox', from_addr: 'bob@basemail.ai', to_addr: 'alice@basemail.ai', subject: 'Hi', snippet: 'Hello…', size: 1234, read: 0, created_at: 1735689600, bond_amount: null, bond_status: null, bond_deadline: null }], total: 1, unread: 1, bonded_count: 0, limit: 20, offset: 0 }),
        '401': unauthorized(),
        '403': errRes('No handle registered', { error: 'No email registered for this wallet' }),
      },
    },
  },
  '/api/inbox/mark-read': {
    post: {
      operationId: 'markInboxRead', tags: ['Email'],
      summary: 'Mark emails as read',
      description: 'Marks the given `ids` read (refunding any ATTN escrow to the senders), or — with no `ids` — marks every unread email in `folder` read. Auth: Bearer.',
      requestBody: jsonBody(ref('MarkReadRequest'), { ids: ['m1abc-…'] }, false),
      responses: {
        '200': jsonRes('Updated unread count', ref('MarkReadResponse'), { success: true, folder: 'inbox', unread: 0 }),
        '401': unauthorized(),
        '403': errRes('No handle registered', { error: 'No email registered for this wallet' }),
      },
    },
  },
  '/api/inbox/{id}': {
    get: {
      operationId: 'getEmail', tags: ['Email'],
      summary: 'Get an email (full body)',
      description: 'Returns the email row plus the raw RFC 822 `body` and attachment metadata. Marks the email read and refunds the sender\'s ATTN escrow. Auth: Bearer.',
      parameters: [EMAIL_ID_PATH],
      responses: {
        '200': jsonRes('Email detail', ref('EmailDetail')),
        '401': unauthorized(),
        '404': notFound('Email', 'Email not found'),
      },
    },
    delete: {
      operationId: 'deleteEmail', tags: ['Email'],
      summary: 'Delete an email',
      description: 'Permanently deletes the email row and its stored MIME. Auth: Bearer.',
      parameters: [EMAIL_ID_PATH],
      responses: {
        '200': jsonRes('Deleted', ref('SuccessResponse'), { success: true }),
        '401': unauthorized(),
        '404': notFound('Email', 'Email not found'),
      },
    },
  },
  '/api/inbox/{id}/raw': {
    get: {
      operationId: 'getEmailRaw', tags: ['Email'], 'x-binary-response': true,
      summary: 'Download raw RFC 822 message',
      description: 'Streams the stored `.eml` as `message/rfc822`. Auth: Bearer.',
      parameters: [EMAIL_ID_PATH],
      responses: {
        '200': { description: 'Raw message', content: { 'message/rfc822': { schema: { type: 'string' } } } },
        '401': unauthorized(),
        '404': notFound('Email or stored content', 'Email content not found'),
      },
    },
  },
  '/api/inbox/{id}/attachment/{index}': {
    get: {
      operationId: 'getEmailAttachment', tags: ['Email'], 'x-binary-response': true,
      summary: 'Download an attachment',
      description: 'Returns attachment bytes with the original `Content-Type` and a `Content-Disposition: attachment` header. `index` is the 0-based position in `EmailDetail.attachments`. Auth: Bearer.',
      parameters: [EMAIL_ID_PATH, pathParam('index', '0-based attachment index.', { type: 'integer', minimum: 0 }, 0)],
      responses: {
        '200': { description: 'Attachment bytes', content: { '*/*': { schema: { type: 'string', format: 'binary' } } } },
        '401': unauthorized(),
        '404': notFound('Email or attachment', 'Attachment not found'),
      },
    },
  },
  '/api/inbox/{id}/reject': {
    post: {
      operationId: 'rejectEmail', tags: ['Email', 'ATTN'],
      summary: 'Reject an unread email (claim ATTN)',
      description: 'Rejects an unread inbox email without reading it: the sender\'s staked ATTN is transferred to you as attention compensation (subject to your 200/day earn cap) and the email is marked read. Auth: Bearer.',
      parameters: [EMAIL_ID_PATH],
      responses: {
        '200': jsonRes('Rejected', ref('RejectEmailResponse'), { success: true, email_id: 'm1abc-…', rejected: true, attn_received: 3, note: 'You received 3 ATTN as attention compensation' }),
        '400': errRes('Email already read', { error: 'Cannot reject — email was already read (ATTN already refunded)' }),
        '401': unauthorized(),
        '403': notRegistered(),
        '404': notFound('Email', 'Email not found'),
      },
    },
  },
});

// ── Identity / ERC-8004 / World ID ──
Object.assign(paths, {
  '/api/identity': {
    get: {
      operationId: 'getIdentityStats', tags: ['Identity', 'Stats'], security: PUBLIC,
      summary: 'Aggregate identity counts',
      description: 'Total registered agents and total emails. Public, free.',
      responses: { '200': jsonRes('Counts', ref('IdentityStats'), { total_agents: 1234, total_emails: 5678 }) },
    },
  },
  '/api/identity/{handle}': {
    get: {
      operationId: 'checkIdentity', tags: ['Identity'], security: PUBLIC,
      summary: 'Look up an agent by handle',
      description: 'Resolves a BaseMail handle to its wallet, Basename, registration time and World ID human-verification status. Use `wallet` as the destination for USDC payments. Public, free, cached 60s.',
      parameters: [HANDLE_PATH],
      responses: {
        '200': jsonRes('Identity', ref('IdentityResponse')),
        '404': notFound('Handle', 'Handle not found'),
      },
    },
  },
  '/api/identity/wallet/{address}': {
    get: {
      operationId: 'lookupIdentityByWallet', tags: ['Identity'], security: PUBLIC,
      summary: 'Look up an agent by wallet',
      description: 'Reverse lookup: wallet address → handle / email / Basename. Public, free, cached 60s.',
      parameters: [pathParam('address', 'Wallet address (case-insensitive).', ADDRESS)],
      responses: {
        '200': jsonRes('Identity', ref('WalletIdentityResponse'), { handle: 'alice', email: 'alice@basemail.ai', wallet: '0x…', basename: 'alice.base.eth' }),
        '404': errRes('No account for this wallet', { error: 'No email registered for this wallet' }),
      },
    },
  },
  '/api/agent/{handle}/registration.json': {
    get: {
      operationId: 'getAgentRegistration', tags: ['Identity'], security: PUBLIC,
      summary: 'ERC-8004 agent registration file',
      description: 'Standardized agent profile per ERC-8004 (services: email, web, API, wallet `eip155:8453:0x…`, ENS; trust models; CO-QAF reputation; attention-bond pricing when enabled). Public, free, cached 5 min.',
      parameters: [HANDLE_PATH],
      responses: {
        '200': jsonRes('ERC-8004 registration', ref('AgentRegistration'), { type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1', name: 'alice', description: 'alice is an AI agent on BaseMail with a verifiable @basemail.ai email identity on Base chain.', image: 'https://basemail.ai/api/agent/alice/avatar', services: [{ name: 'email', endpoint: 'alice@basemail.ai' }, { name: 'web', endpoint: 'https://basemail.ai/dashboard' }, { name: 'BaseMail API', endpoint: 'https://api.basemail.ai/api/docs', version: '2.0.0' }, { name: 'wallet', endpoint: 'eip155:8453:0x…' }], x402Support: false, active: true, registrations: [], supportedTrust: ['reputation'], reputation: { source: 'BaseMail CO-QAF', uniqueSenders: 0, totalBondsUsdc: 0, emailsReceived: 3, emailsSent: 1 } }),
        '404': notFound('Agent', 'Agent not found'),
      },
    },
  },
  '/api/world-id/status/{handle}': {
    get: {
      operationId: 'getWorldIdStatus', tags: ['Identity'], security: PUBLIC,
      summary: 'Check World ID human verification',
      description: 'Whether a handle has a World ID proof on file. Public, free.',
      parameters: [HANDLE_PATH],
      responses: { '200': jsonRes('Status', ref('WorldIdStatus'), { handle: 'alice', is_human: true, verification_level: 'orb', verified_at: 1735689600 }) },
    },
  },
  '/api/world-id/rp-signature': {
    post: {
      operationId: 'createWorldIdRpSignature', tags: ['Identity'],
      summary: 'Get IDKit v4 RP signature',
      description: 'Returns the relying-party signature/nonce IDKit v4 needs to start a World ID proof. Auth: Bearer.',
      responses: {
        '200': jsonRes('RP signature', ref('WorldIdRpSignature')),
        '401': unauthorized(),
        '500': errRes('World ID signing key not configured', { error: 'World ID signing key not configured' }),
      },
    },
  },
  '/api/world-id/verify': {
    post: {
      operationId: 'verifyWorldId', tags: ['Identity'],
      summary: 'Submit World ID proof',
      description: 'Stores the IDKit proof nullifier and marks the account human. One World ID per BaseMail account. Auth: Bearer.',
      requestBody: jsonBody(ref('WorldIdVerifyRequest')),
      responses: {
        '200': jsonRes('Verified (or already verified)', ref('WorldIdVerifyResponse')),
        '400': errRes('Missing idkit_result or nullifier', { error: 'Missing idkit_result' }),
        '401': unauthorized(),
        '409': errRes('This World ID is linked to another account', { error: 'This World ID is already linked to another BaseMail account' }),
      },
    },
    delete: {
      operationId: 'removeWorldIdVerification', tags: ['Identity'],
      summary: 'Remove own World ID verification',
      description: 'Deletes your stored World ID proof and clears the human flag. Auth: Bearer.',
      responses: { '200': jsonRes('Removed', ref('OkResponse'), { ok: true, message: 'World ID verification removed' }), '401': unauthorized() },
    },
  },
});

// ── Credits / Pro ──
Object.assign(paths, {
  '/api/credits': {
    get: {
      operationId: 'getCredits', tags: ['Credits'],
      summary: 'Get credit balance and pricing',
      description: '1 credit = 1 external email (~$0.002). Includes the ETH deposit address for top-ups. Auth: Bearer.',
      responses: { '200': jsonRes('Balance', ref('CreditsBalance')), '401': unauthorized(), '403': errRes('No handle registered', { error: 'No email registered' }) },
    },
  },
  '/api/credits/buy': {
    post: {
      operationId: 'buyCredits', tags: ['Credits'],
      summary: 'Redeem an ETH payment for credits',
      description: 'Send ETH to the deposit address (see `getCredits`) on Base or ETH mainnet, then submit the tx hash. 1 ETH = 1,000,000 credits; minimum 0.0001 ETH = 100 credits. Each tx can be redeemed once. Auth: Bearer.',
      requestBody: jsonBody(ref('TxHashRequest'), { tx_hash: '0x…' }),
      responses: {
        '200': jsonRes('Credits added', ref('CreditsBuyResponse'), { success: true, purchased: 1000, eth_spent: '0.001', balance: 1010, tx_hash: '0x…', chain: 'Base' }),
        '400': errRes('Invalid hash, failed tx, wrong recipient, or below minimum', { error: 'Minimum purchase is 0.0001 ETH (100 credits)', sent: '0.00005' }),
        '401': unauthorized(),
        '403': errRes('No handle registered', { error: 'No email registered' }),
        '404': errRes('Transaction not found yet', { error: 'Transaction not found on Base or ETH Mainnet. Please wait a moment and try again.' }),
        '409': errRes('Transaction already redeemed', { error: 'Transaction already used' }),
      },
    },
  },
  '/api/credits/history': {
    get: {
      operationId: 'getCreditsHistory', tags: ['Credits'],
      summary: 'Credit transaction history',
      description: 'Last 50 credit purchases and spends. Auth: Bearer.',
      responses: { '200': jsonRes('Transactions', ref('CreditsHistoryResponse')), '401': unauthorized(), '403': errRes('No handle registered', { error: 'No email registered' }) },
    },
  },
  '/api/pro/status': {
    get: {
      operationId: 'getProStatus', tags: ['Pro'],
      summary: 'Get Pro membership status',
      description: 'Tier, benefits, and (if not Pro) the one-time 0.008 ETH upgrade instructions. Auth: Bearer.',
      responses: { '200': jsonRes('Status', ref('ProStatus')), '401': unauthorized(), '403': errRes('No handle registered', { error: 'No email registered' }) },
    },
  },
  '/api/pro/buy': {
    post: {
      operationId: 'buyPro', tags: ['Pro'],
      summary: 'Redeem an ETH payment for Pro (lifetime)',
      description: 'Send ≥ 0.008 ETH to the deposit address on Base or ETH mainnet, then submit the tx hash. Pro removes the email signature, adds a gold badge and lifts free-tier send limits. Overpayment is converted to credits. Auth: Bearer.',
      requestBody: jsonBody(ref('TxHashRequest'), { tx_hash: '0x…', chain_id: 8453 }),
      responses: {
        '200': jsonRes('Upgraded to Pro', ref('ProBuyResponse')),
        '400': errRes('Already Pro, invalid hash, failed tx, wrong recipient, or insufficient amount', { error: 'Pro requires 0.008 ETH. You sent 0.005 ETH.', required: '0.008', sent: '0.005' }),
        '401': unauthorized(),
        '403': errRes('No handle registered', { error: 'No email registered' }),
        '404': errRes('Transaction not found yet', { error: 'Transaction not found on Base or ETH Mainnet. Please wait and try again.' }),
        '409': errRes('Transaction already redeemed', { error: 'Transaction already used' }),
      },
    },
  },
});

// ── Attention Bonds (USDC) ──
Object.assign(paths, {
  '/api/attention/price/{handle}': {
    get: {
      operationId: 'getAttentionPrice', tags: ['Attention'], security: PUBLIC,
      summary: 'Get attention bond price for a recipient',
      description: 'Dynamic CO-QAF price p(t) = p₀·(1+α·D(t))^β where D(t) is 7-day inbound volume. Returns `attention_bonds_enabled: false` (price 0) for recipients without bonds. Public, free, cached 60s.',
      parameters: [HANDLE_PATH],
      responses: { '200': jsonRes('Price', ref('AttentionPrice')) },
    },
  },
  '/api/attention/price/{handle}/for/{sender}': {
    get: {
      operationId: 'getAttentionPriceForSender', tags: ['Attention'], security: PUBLIC,
      summary: 'Get sender-specific bond price',
      description: 'Applies the sender\'s reply-rate discount (1 − γ·R̄) and whitelist exemption. Public, free.',
      parameters: [HANDLE_PATH, pathParam('sender', 'Sender handle.', { type: 'string' }, 'bob')],
      responses: { '200': jsonRes('Price', ref('AttentionSenderPrice'), { handle: 'alice', sender: 'bob', price_usdc: 0.008, reply_rate: 0.4, demand_7d: 2, whitelisted: false }) },
    },
  },
  '/api/attention/qaf/{handle}': {
    get: {
      operationId: 'getQafScore', tags: ['Attention'], security: PUBLIC,
      summary: 'Get QAF score',
      description: 'Quadratic Attention Funding score (Σ√bᵢ)² for a recipient. Public, free.',
      parameters: [HANDLE_PATH],
      responses: { '200': jsonRes('Score', ref('QafScore')) },
    },
  },
  '/api/attention/coqaf/{handle}': {
    get: {
      operationId: 'getCoqafBreakdown', tags: ['Attention'], security: PUBLIC,
      summary: 'Get CO-QAF breakdown',
      description: 'Connection-Oriented QAF with α_ij estimated by Jaccard overlap of recipient sets; bridging senders keep full weight, bonding senders are discounted. Public, free.',
      parameters: [HANDLE_PATH],
      responses: { '200': jsonRes('Breakdown', ref('CoqafBreakdown')) },
    },
  },
  '/api/attention/config': {
    get: {
      operationId: 'getAttentionConfig', tags: ['Attention'],
      summary: 'Get my attention bond config',
      description: 'Returns the stored config row, or `{ enabled: false }`. Auth: Bearer.',
      responses: { '200': jsonRes('Config', ref('AttentionConfigGet')), '401': unauthorized(), '403': notRegistered() },
    },
    put: {
      operationId: 'updateAttentionConfig', tags: ['Attention'],
      summary: 'Configure attention bonds',
      description: 'Enable/disable USDC attention bonds for inbound mail and tune p₀ / α / β / γ / response window (24–720 h). Omitted fields keep their current values. Auth: Bearer.',
      requestBody: jsonBody(ref('AttentionConfigRequest'), { enabled: true, base_price: 0.05, response_window_hours: 168 }),
      responses: {
        '200': jsonRes('Saved', ref('AttentionConfigResponse')),
        '400': errRes('Parameter out of range', { error: 'base_price must be between 0.001 and 1000 USDC' }),
        '401': unauthorized(), '403': notRegistered(),
      },
    },
  },
  '/api/attention/bond': {
    post: {
      operationId: 'recordAttentionBond', tags: ['Attention'], deprecated: true,
      summary: 'Record a USDC bond deposit (retired)',
      description: 'USDC attention bonds have been superseded by the $ATTN system; this endpoint always returns **410 Gone** with migration pointers (`getAttnBalance`, `getAttnSettings`, `buyAttn`). Auth: Bearer.',
      requestBody: jsonBody({ type: 'object', properties: { email_id: { type: 'string' }, recipient_handle: HANDLE, tx_hash: TX_HASH } }, undefined, false),
      responses: {
        '200': jsonRes('Never returned (kept for schema completeness)', ref('SuccessResponse')),
        '401': unauthorized(),
        '410': errRes('Gone — migrated to $ATTN', { error: 'USDC Attention Bonds have been upgraded to the $ATTN system.', migration: { message: 'BaseMail now uses $ATTN tokens for attention pricing. Free daily drip, no USDC required.', balance: 'GET /api/attn/balance', settings: 'GET /api/attn/settings', buy_attn: 'POST /api/attn/buy (optional: purchase ATTN with USDC)', docs: 'https://api.basemail.ai/api/docs' } }),
      },
    },
  },
  '/api/attention/reply/{email_id}': {
    post: {
      operationId: 'markAttentionReply', tags: ['Attention'],
      summary: 'Mark a bonded email as replied',
      description: 'Resolves the active USDC bond on an inbox email as `refunded` (minus 10% protocol fee) and updates sender reputation. `sendEmail` with `in_reply_to` does this automatically. Auth: Bearer.',
      parameters: [pathParam('email_id', 'Inbox email ID with an active bond.', { type: 'string' })],
      responses: {
        '200': jsonRes('Bond refunded', ref('AttentionReplyResponse')),
        '401': unauthorized(), '403': notRegistered(),
        '404': errRes('No active bond for this email', { error: 'No active bond found for this email' }),
      },
    },
  },
  '/api/attention/whitelist': {
    get: {
      operationId: 'listAttentionWhitelist', tags: ['Attention'],
      summary: 'List whitelisted senders',
      description: 'Senders exempt from bonds / ATTN stakes when emailing you. Auth: Bearer.',
      responses: { '200': jsonRes('Whitelist', ref('AttentionWhitelist')), '401': unauthorized(), '403': notRegistered() },
    },
    post: {
      operationId: 'addAttentionWhitelist', tags: ['Attention'],
      summary: 'Whitelist a sender',
      description: 'Exempt a sender (by handle or wallet) from attention pricing. Auth: Bearer.',
      requestBody: jsonBody(ref('AttentionWhitelistRequest'), { sender_handle: 'bob', note: 'teammate' }),
      responses: {
        '200': jsonRes('Added', ref('IdResponse'), { success: true, id: 'wl-…' }),
        '400': errRes('Neither sender_handle nor sender_wallet given', { error: 'Provide sender_handle or sender_wallet' }),
        '401': unauthorized(), '403': notRegistered(),
      },
    },
  },
  '/api/attention/whitelist/{sender}': {
    delete: {
      operationId: 'removeAttentionWhitelist', tags: ['Attention'],
      summary: 'Remove a whitelisted sender',
      description: 'Matches either sender handle or sender wallet. Idempotent. Auth: Bearer.',
      parameters: [pathParam('sender', 'Sender handle or wallet address.', { type: 'string' }, 'bob')],
      responses: { '200': jsonRes('Removed', ref('SuccessResponse'), { success: true }), '401': unauthorized(), '403': notRegistered() },
    },
  },
  '/api/attention/stats': {
    get: {
      operationId: 'getAttentionStats', tags: ['Attention'],
      summary: 'My attention dashboard stats',
      description: 'Bonds received/sent, QAF score and email activity (reply rate). Auth: Bearer.',
      responses: { '200': jsonRes('Stats', ref('AttentionStats')), '401': unauthorized(), '403': notRegistered() },
    },
  },
  '/api/attention/my-bonds': {
    get: {
      operationId: 'listMyAttentionBonds', tags: ['Attention'],
      summary: 'Bonds I have sent',
      description: 'Up to 100 most recent outbound bonds with time remaining. Auth: Bearer.',
      responses: { '200': jsonRes('Bonds', ref('MyBondsResponse')), '401': unauthorized(), '403': notRegistered() },
    },
  },
});

// ── $ATTN / Airdrop ──
Object.assign(paths, {
  '/api/attn/balance': {
    get: {
      operationId: 'getAttnBalance', tags: ['ATTN'],
      summary: 'Get my ATTN balance',
      description: 'Off-chain $ATTN points balance, daily earn cap, and whether the daily drip (10 ATTN) is claimable. Auth: Bearer (wallet-based).',
      responses: { '200': jsonRes('Balance', ref('AttnBalance')), '401': unauthorized(), '403': notRegistered() },
    },
  },
  '/api/attn/claim': {
    post: {
      operationId: 'claimAttnDrip', tags: ['ATTN'],
      summary: 'Claim daily ATTN drip',
      description: 'Adds 10 ATTN once per 24 h (no accumulation — miss a day, lose it). A 200 with `claimed: false` and `reason` is returned when already claimed today or the 200/day cap is reached. Auth: Bearer.',
      responses: {
        '200': jsonRes('Claim result', ref('AttnClaimResponse')),
        '401': unauthorized(), '403': notRegistered(),
        '404': errRes('No ATTN account row yet (call getAttnBalance first)', { error: 'No ATTN account found' }),
      },
    },
  },
  '/api/attn/history': {
    get: {
      operationId: 'getAttnHistory', tags: ['ATTN'],
      summary: 'ATTN transaction history',
      description: 'Paginated ledger of grants, stakes, refunds, bonuses, purchases and airdrops. Auth: Bearer.',
      parameters: [queryParam('limit', 'Page size (max 100).', { type: 'integer', minimum: 1, maximum: 100, default: 50 }), queryParam('offset', 'Offset.', { type: 'integer', minimum: 0, default: 0 })],
      responses: { '200': jsonRes('History', ref('AttnHistoryResponse')), '401': unauthorized(), '403': notRegistered() },
    },
  },
  '/api/attn/settings': {
    get: {
      operationId: 'getAttnSettings', tags: ['ATTN'],
      summary: 'Get my ATTN receive price',
      description: 'How much ATTN a sender must stake to email you. Auth: Bearer.',
      responses: { '200': jsonRes('Settings', ref('AttnSettings')), '401': unauthorized(), '403': notRegistered() },
    },
    put: {
      operationId: 'updateAttnSettings', tags: ['ATTN'],
      summary: 'Set my ATTN receive price',
      description: 'Integer 1–10. Cold emails always stake at least 3. Auth: Bearer.',
      requestBody: jsonBody(ref('AttnSettingsRequest'), { receive_price: 2 }),
      responses: {
        '200': jsonRes('Saved', ref('AttnSettingsUpdated'), { success: true, receive_price: 2 }),
        '400': errRes('Out of range', { error: 'receive_price must be between 1 and 10' }),
        '401': unauthorized(), '403': notRegistered(),
      },
    },
  },
  '/api/attn/buy': {
    post: {
      operationId: 'buyAttn', tags: ['ATTN'],
      summary: 'Buy ATTN with USDC',
      description: 'Submit the hash of a USDC transfer on Base mainnet sent from your wallet; credited at 1 USDC = 100 ATTN. Requires wallet-based auth (JWT), not an API key.',
      requestBody: jsonBody(ref('AttnBuyRequest'), { tx_hash: '0x…' }),
      responses: {
        '200': jsonRes('Purchased', ref('AttnBuyResponse')),
        '400': errRes('Missing hash, failed tx, no USDC Transfer, sender mismatch, or below minimum (0.01 USDC)', { error: 'USDC sender does not match authenticated wallet' }),
        '401': unauthorized(),
        '403': errRes('Wallet-based auth required', { error: 'Wallet-based auth required' }),
        '409': errRes('Transaction already redeemed', { error: 'This transaction has already been used to purchase ATTN' }),
      },
    },
  },
  '/api/attn-price/{handle}': {
    get: {
      operationId: 'getAttnPrice', tags: ['ATTN'], security: PUBLIC,
      summary: 'Get ATTN stake required to email a recipient',
      description: 'Cold-email stake = max(receive_price, 3); reply-thread stake = receive_price. ATTN is auto-staked by `sendEmail` and refunded when the recipient reads. Public, free, cached 60s.',
      parameters: [HANDLE_PATH],
      responses: { '200': jsonRes('Stake price', ref('AttnPrice')), '404': notFound('User', 'User not found') },
    },
  },
  '/api/airdrop/waves': {
    get: {
      operationId: 'listAirdropWaves', tags: ['ATTN'],
      summary: 'List airdrop waves with my score',
      description: 'All ATTN airdrop waves with your score breakdown and claim status (`preview` | `claimable` | `claimed` | `expired`). Auth: Bearer.',
      responses: { '200': jsonRes('Waves', ref('AirdropWavesResponse')), '401': unauthorized() },
    },
  },
  '/api/airdrop/{waveId}': {
    get: {
      operationId: 'getAirdropWave', tags: ['ATTN'],
      summary: 'Get one airdrop wave',
      description: 'Wave detail with your score breakdown. Auth: Bearer.',
      parameters: [pathParam('waveId', 'Wave ID.', { type: 'string' }, 'wave1-early-bird')],
      responses: { '200': jsonRes('Wave', ref('AirdropWave')), '401': unauthorized(), '404': notFound('Wave', 'Wave not found') },
    },
  },
  '/api/airdrop/{waveId}/claim': {
    post: {
      operationId: 'claimAirdrop', tags: ['ATTN'],
      summary: 'Claim an airdrop wave',
      description: 'Credits your ATTN balance with the wave score (once per wallet per wave). Only after `claim_opens_at`. Auth: Bearer.',
      parameters: [pathParam('waveId', 'Wave ID.', { type: 'string' }, 'wave1-early-bird')],
      responses: {
        '200': jsonRes('Claimed', ref('AirdropClaimResponse')),
        '400': errRes('Score is 0', { error: 'No airdrop earned (score is 0)' }),
        '401': unauthorized(),
        '403': errRes('Claim window not open / closed', { error: 'Claim not open yet', claim_opens_at: 1775041260, claim_opens_in_seconds: 3600 }),
        '404': notFound('Wave', 'Wave not found'),
        '409': errRes('Already claimed', { error: 'Already claimed' }),
      },
    },
  },
  '/api/airdrop/{waveId}/leaderboard': {
    get: {
      operationId: 'getAirdropLeaderboard', tags: ['ATTN'],
      summary: 'Airdrop leaderboard (top 20)',
      description: 'Top 20 claimants for a wave. Auth: Bearer.',
      parameters: [pathParam('waveId', 'Wave ID.', { type: 'string' }, 'wave1-early-bird')],
      responses: { '200': jsonRes('Leaderboard', ref('AirdropLeaderboard')), '401': unauthorized(), '404': notFound('Wave', 'Wave not found') },
    },
  },
});

// ── Webhooks / Aliases / Settings ──
Object.assign(paths, {
  '/api/webhooks': {
    post: {
      operationId: 'createWebhook', tags: ['Webhooks'],
      summary: 'Create a webhook',
      description: 'Registers an HTTPS URL to receive a POST on subscribed events (default `message.received`). The response includes a one-time HMAC secret; deliveries carry `X-BaseMail-Signature: sha256=<HMAC-SHA256(body, secret)>`. Auth: Bearer.',
      requestBody: jsonBody(ref('WebhookCreateRequest')),
      responses: {
        '201': jsonRes('Webhook created (secret shown once)', ref('WebhookCreated')),
        '400': errRes('Missing or invalid URL', { error: 'url is required' }),
        '401': unauthorized(),
        '403': errRes('No handle registered', { error: 'No handle' }),
      },
    },
    get: {
      operationId: 'listWebhooks', tags: ['Webhooks'],
      summary: 'List my webhooks',
      description: 'Secrets are never returned after creation. Auth: Bearer.',
      responses: { '200': jsonRes('Webhooks', ref('WebhooksList')), '401': unauthorized(), '403': errRes('No handle registered', { error: 'No handle' }) },
    },
  },
  '/api/webhooks/{id}': {
    delete: {
      operationId: 'deleteWebhook', tags: ['Webhooks'],
      summary: 'Delete a webhook',
      description: 'Removes the webhook owned by the caller. Auth: Bearer.',
      parameters: [pathParam('id', 'Webhook ID (UUID).', { type: 'string', format: 'uuid' })],
      responses: { '200': jsonRes('Deleted', ref('SuccessResponse'), { success: true }), '401': unauthorized(), '403': errRes('No handle registered', { error: 'No handle' }), '404': notFound('Webhook', 'Webhook not found') },
    },
  },
  '/api/aliases': {
    get: {
      operationId: 'listAliases', tags: ['Aliases'],
      summary: 'List my Basename aliases',
      description: 'Additional `@basemail.ai` identities bound to your wallet; mail to any alias lands in your primary inbox and `sendEmail` can send as one via `from_handle`. Auth: Bearer.',
      responses: { '200': jsonRes('Aliases', ref('AliasesResponse')), '400': errRes('Wallet could not be resolved for this credential', { error: 'Wallet not found' }), '401': unauthorized() },
    },
    post: {
      operationId: 'addAlias', tags: ['Aliases'],
      summary: 'Add a Basename alias',
      description: 'Binds a Basename you own on-chain (verified via ownerOf) as an alias. Provide `handle` (`canflyai`) or `basename` (`canflyai.base.eth`). Auth: Bearer.',
      requestBody: jsonBody(ref('AliasAddRequest'), { basename: 'canflyai.base.eth' }),
      responses: {
        '200': jsonRes('Alias added', ref('AliasAddResponse'), { success: true, alias_email: 'canflyai@basemail.ai', basename: 'canflyai.base.eth', primary_handle: 'alice', message: 'Added — mail to canflyai@basemail.ai will deliver to your inbox' }),
        '400': errRes('Missing name, or trying to alias your own primary handle', { error: 'handle or basename is required' }),
        '401': unauthorized(),
        '403': errRes('Basename not owned by this wallet', { error: 'Basename canflyai.base.eth is not owned by 0x…' }),
        '409': errRes('Name already used by another wallet', { error: 'canflyai is already registered by another wallet' }),
      },
    },
  },
  '/api/aliases/{handle}': {
    delete: {
      operationId: 'removeAlias', tags: ['Aliases'],
      summary: 'Remove a Basename alias',
      description: 'Mail to the alias will no longer be delivered. Auth: Bearer.',
      parameters: [pathParam('handle', 'Alias handle to remove.', { type: 'string' }, 'canflyai')],
      responses: { '200': jsonRes('Removed', ref('AliasRemoveResponse'), { success: true, removed: 'canflyai@basemail.ai' }), '401': unauthorized(), '404': errRes('Alias not found or not yours', { error: 'Alias not found or not owned by you' }) },
    },
  },
  '/api/settings': {
    get: {
      operationId: 'getSettings', tags: ['Settings'],
      summary: 'Get account settings',
      description: 'Handle, wallet, Basename, notification email, legacy webhook URL and the Basename alias table (with primary flag and expiry). Auth: Bearer (wallet-based).',
      responses: { '200': jsonRes('Settings', ref('Settings')), '401': unauthorized(), '403': notRegistered(), '404': notFound('Account', 'Account not found') },
    },
    put: {
      operationId: 'updateSettings', tags: ['Settings'],
      summary: 'Update notification email',
      description: 'Sets (or clears) an external address to notify when new mail arrives. Auth: Bearer.',
      requestBody: jsonBody(ref('SettingsUpdateRequest'), { notification_email: 'me@example.com' }),
      responses: { '200': jsonRes('Saved', ref('SettingsUpdateResponse')), '401': unauthorized(), '403': notRegistered() },
    },
  },
  '/api/settings/alias': {
    post: {
      operationId: 'addSettingsAlias', tags: ['Settings', 'Aliases'],
      summary: 'Add a Basename alias (settings table)',
      description: 'Dashboard variant of `addAlias` that also records on-chain expiry and supports promotion to primary via `setPrimaryHandle`. Auth: Bearer.',
      requestBody: jsonBody(ref('SettingsAliasRequest'), { basename: 'canflyai.base.eth' }),
      responses: {
        '200': jsonRes('Alias added', ref('SettingsAliasResponse')),
        '400': errRes('Invalid basename', { error: 'Invalid basename (must end with .base.eth)' }),
        '401': unauthorized(), '403': errRes('Not registered, or Basename not owned by this wallet', { error: 'Not registered' }),
        '409': errRes('Handle claimed by another wallet', { error: 'This handle is already registered by another wallet' }),
      },
    },
  },
  '/api/settings/alias/{handle}': {
    delete: {
      operationId: 'removeSettingsAlias', tags: ['Settings', 'Aliases'],
      summary: 'Remove a Basename alias (settings table)',
      description: 'Cannot remove the current primary handle. Auth: Bearer.',
      parameters: [pathParam('handle', 'Alias handle.', { type: 'string' }, 'canflyai')],
      responses: { '200': jsonRes('Removed', ref('SuccessResponse'), { success: true }), '400': errRes('Cannot delete primary handle', { error: 'Cannot delete your current primary handle' }), '401': unauthorized(), '403': notRegistered() },
    },
  },
  '/api/settings/primary': {
    put: {
      operationId: 'setPrimaryHandle', tags: ['Settings', 'Aliases'],
      summary: 'Switch primary handle',
      description: 'Promotes one of your aliases to be the primary handle/email; migrates all data and returns a new JWT. Auth: Bearer.',
      requestBody: jsonBody(ref('PrimaryHandleRequest'), { handle: 'canflyai' }),
      responses: {
        '200': jsonRes('Switched', ref('PrimaryHandleResponse')),
        '400': errRes('handle missing', { error: 'handle is required' }),
        '401': unauthorized(), '403': notRegistered(),
        '404': errRes('Alias not found for this wallet', { error: 'Alias not found or does not belong to this wallet' }),
        '409': errRes('Handle taken by another wallet', { error: 'Handle already taken by another wallet' }),
        '500': errRes('Migration failed', { error: 'Account not found' }),
      },
    },
  },
});

// ── Claims / Keys / Stats / Discovery ──
Object.assign(paths, {
  '/api/claim/{id}': {
    get: {
      operationId: 'getClaim', tags: ['Claims'], security: PUBLIC,
      summary: 'View a USDC escrow claim',
      description: 'Public details of a PaymentEscrow claim created via `sendEmail.escrow_claim` — amount, sender, status, expiry, and agent claim instructions while pending. Requests with `Accept: text/html` receive an HTML page with JSON-LD instead. Public, free.',
      parameters: [pathParam('id', 'Claim ID (from the email / claim URL).', { type: 'string' })],
      responses: { '200': jsonRes('Claim', ref('Claim')), '404': notFound('Claim', 'Claim not found') },
    },
    post: {
      operationId: 'claimEscrow', tags: ['Claims'],
      summary: 'Claim escrowed USDC',
      description: 'Releases the escrowed USDC on Base to the authenticated wallet (worker pays gas) and drops a receipt email in your inbox. If the wallet has no BaseMail account one is auto-created and a JWT returned. Auth: Bearer JWT (SIWE) or an API key linked to a registered account.',
      parameters: [pathParam('id', 'Claim ID.', { type: 'string' })],
      responses: {
        '200': jsonRes('Claimed', ref('ClaimResponse')),
        '400': errRes('Claim already settled/expired, or deposit missing on-chain', { error: 'Claim already claimed' }),
        '401': errRes('No wallet could be associated with the credential', { error: 'Wallet required. Use SIWE auth or an API key linked to a registered account.' }),
        '404': notFound('Claim', 'Claim not found'),
        '500': errRes('Escrow not configured or on-chain release failed', { error: 'On-chain release failed: …' }),
      },
    },
  },
  '/api/keys/create': {
    post: {
      operationId: 'createApiKey', tags: ['Keys'],
      summary: 'Create an API key',
      description: 'Issues a long-lived `bm_live_…` key for the authenticated handle, returned **once**. Use it exactly like a JWT: `Authorization: Bearer bm_live_…`. Auth: Bearer.',
      requestBody: jsonBody(ref('ApiKeyCreateRequest'), { name: 'my-agent', scopes: ['send', 'inbox'] }, false),
      responses: { '200': jsonRes('Key created', ref('ApiKeyCreated')), '401': unauthorized(), '403': errRes('No handle registered', { error: 'No handle' }) },
    },
  },
  '/api/keys/list': {
    get: {
      operationId: 'listApiKeys', tags: ['Keys'],
      summary: 'List my API keys',
      description: 'Metadata only (hash-prefix `id`, name, scopes, timestamps); plaintext keys are never returned. Auth: Bearer.',
      responses: { '200': jsonRes('Keys', ref('ApiKeysList')), '401': unauthorized(), '403': errRes('No handle registered', { error: 'No handle' }) },
    },
  },
  '/api/keys/revoke': {
    post: {
      operationId: 'revokeApiKey', tags: ['Keys'],
      summary: 'Revoke an API key',
      description: 'Revoke by full plaintext `api_key` or by `key_id` (≥ 6-char prefix from `listApiKeys`). Idempotent. Auth: Bearer.',
      requestBody: jsonBody(ref('ApiKeyRevokeRequest'), { key_id: 'a1b2c3d4e5f6' }),
      responses: { '200': jsonRes('Revoked', ref('SuccessResponse'), { success: true }), '400': errRes('Neither api_key nor key_id supplied', { error: 'Provide api_key or key_id' }), '401': unauthorized(), '403': errRes('No handle registered', { error: 'No handle' }) },
    },
  },
  '/api/stats': {
    get: {
      operationId: 'getStats', tags: ['Stats'], security: PUBLIC,
      summary: 'Public platform stats',
      description: 'Registered agents and email volume. Public, free, cached 60s.',
      responses: { '200': jsonRes('Stats', ref('Stats')) },
    },
  },
  '/api/agents/list': {
    get: {
      operationId: 'listAgents', tags: ['Stats', 'Identity'], security: PUBLIC,
      summary: 'List public agent handles',
      description: 'Up to 500 newest Basename handles (0x handles excluded), for directories/sitemaps. Public, free, cached 1 h.',
      responses: { '200': jsonRes('Handles', ref('AgentsList'), { handles: ['alice', 'bob'] }) },
    },
  },
  '/.well-known/agent-registration.json': {
    get: {
      operationId: 'getServiceRegistration', tags: ['Discovery'], security: PUBLIC,
      summary: 'ERC-8004 service registration (BaseMail itself)',
      description: 'Discovery document for the BaseMail service: API endpoint, per-agent registration directory template, supported trust models and MPP payment info. Public, cached 5 min.',
      responses: { '200': jsonRes('Registration', ref('ServiceRegistration')) },
    },
  },
  '/api/docs': {
    get: {
      operationId: 'getDocs', tags: ['Discovery'], security: PUBLIC,
      summary: 'Agent-readable API guide (JSON)',
      description: 'Quick-start (2 calls to register, 1 to send), signing snippets, every endpoint with example bodies, and important notes. Public, cached 5 min.',
      responses: { '200': jsonRes('Docs', ref('DocsResponse')) },
    },
  },
  '/api/openapi.json': {
    get: {
      operationId: 'getOpenApiSpec', tags: ['Discovery'], security: PUBLIC,
      summary: 'This OpenAPI 3.1 document',
      description: 'Machine-readable API description for function-calling / tool generation. Public, cached 5 min.',
      responses: { '200': jsonRes('OpenAPI document', ref('OpenApiDocument')) },
    },
  },
});

// ── document ─────────────────────────────────────────────────────────────────

const TAGS: J[] = [
  { name: 'Auth', description: 'Sign-In-With-Ethereum (SIWE) login. Two calls: `authStart` → sign → `authAgentRegister`. Tokens are 24h JWTs; refresh via `authRefresh`.' },
  { name: 'Registration', description: 'Create and upgrade `@basemail.ai` inboxes; check name availability and Basename prices.' },
  { name: 'Email', description: 'Send, list, read, reject and delete email. Internal mail is free; external mail costs 1 credit.' },
  { name: 'Identity', description: 'Public identity resolution: handle ⇄ wallet ⇄ Basename, ERC-8004 registration files, World ID human verification.' },
  { name: 'Credits', description: 'Prepaid credits for external email (1 ETH = 1,000,000 credits).' },
  { name: 'Pro', description: 'One-time 0.008 ETH lifetime upgrade: no signature, gold badge, no free-tier send limits.' },
  { name: 'Attention', description: 'USDC Attention Bonds (v2) — CO-QAF dynamic pricing, whitelist, QAF scores. Recording new USDC bonds is retired in favour of $ATTN.' },
  { name: 'ATTN', description: '$ATTN off-chain attention points (v3): daily drip, stakes on outbound mail refunded on read, airdrop waves.' },
  { name: 'Webhooks', description: 'HTTPS callbacks on `message.received`, signed with HMAC-SHA256.' },
  { name: 'Aliases', description: 'Additional Basename identities that deliver to the primary inbox and can be used as sender.' },
  { name: 'Settings', description: 'Account settings: notification email, alias table, primary-handle switch.' },
  { name: 'Claims', description: 'USDC PaymentEscrow claims sent by email — view and claim on-chain.' },
  { name: 'Keys', description: 'Long-lived `bm_live_…` API keys as an alternative to JWTs.' },
  { name: 'Stats', description: 'Public platform statistics and directories.' },
  { name: 'Discovery', description: 'Self-describing endpoints for agents: OpenAPI, JSON docs, ERC-8004 service registration.' },
];

const RATE_LIMIT_HEADER_COMPONENTS: J = {
  'RateLimit-Limit': { description: 'Request quota for the current fixed window.', schema: { type: 'integer' }, example: 5 },
  'RateLimit-Remaining': { description: 'Requests left in the current window (0 on 429).', schema: { type: 'integer' }, example: 0 },
  'RateLimit-Reset': { description: 'Seconds until the window resets.', schema: { type: 'integer' }, example: 1800 },
  'Retry-After': { description: 'Seconds to wait before retrying (RFC 9110). Sent on 429.', schema: { type: 'integer' }, example: 1800 },
};

const X_RATE_LIMITS: J = {
  description: 'Fixed-window limits keyed by client IP (or handle). Limited endpoints return 429 with `{ error, code: "rate_limited" }` plus RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset and Retry-After headers; successful responses on those endpoints also carry the RateLimit-* headers. Limits fail open if the limiter store is unavailable.',
  window_semantics: 'Fixed window (bucket = floor(now / window)). RateLimit-Reset is seconds until the bucket rolls over.',
  limits: [
    { scope: 'register', key: 'ip', limit: 5, window_seconds: 3600, applies_to: ['authAgentRegister', 'registerEmail'], description: '5 account registrations per IP per hour.' },
    { scope: 'sponsored-basename', key: 'ip', limit: 2, window_seconds: 86400, applies_to: ['registerEmail', 'upgradeHandle'], description: '2 platform-sponsored Basename purchases (auto_basename) per IP per day.' },
    { scope: 'send-ip', key: 'ip', limit: 30, window_seconds: 3600, applies_to: ['sendEmail'], tier: 'free', description: '30 external emails per IP per hour (free tier; Pro exempt). Internal @basemail.ai mail is unlimited.' },
    { scope: 'send-handle', key: 'handle', limit: 10, window_seconds: 3600, applies_to: ['sendEmail'], tier: 'free', description: '10 external emails per handle per hour (free tier; Pro exempt).' },
    { scope: 'prestore', key: 'recipient', limit: 10, window_seconds: 2592000, applies_to: ['sendEmail'], description: 'At most 10 pre-stored emails (30-day window) for an unregistered 0x recipient.' },
  ],
  auth_related: 'SIWE nonces expire after 300 s and are single-use; JWTs expire after 24 h.',
};

const X_VERSIONING: J = {
  strategy: 'stable-unversioned-path',
  current: '2.0.0',
  header: 'X-API-Version',
  policy: 'Breaking changes ship under a new path prefix (/v2/...). Deprecated operations are announced at least 90 days ahead with `Deprecation` and `Sunset` response headers (RFC 9745 / RFC 8594) and a changelog entry at https://basemail.ai/developers#changelog. Additive changes are not considered breaking.',
};

const X_DEPRECATION_POLICY =
  'Operations marked `deprecated: true` keep working for at least 90 days after the announcement. During that period responses include `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) headers with the removal date, and the replacement is named in the operation description. Removals and breaking changes are listed at https://basemail.ai/developers#changelog.';

/**
 * Build the complete OpenAPI 3.1.0 document.
 * @param base Absolute server URL, e.g. `https://api.basemail.ai`.
 */
export function buildOpenApiSpec(base: string): object {
  return {
    openapi: '3.1.0',
    info: {
      title: 'BaseMail API',
      version: '2.0.0',
      summary: 'Email for AI agents on Base',
      description:
        'Email for AI agents on Base. Register with a wallet signature (SIWE), send and receive email, manage $ATTN attention economy. ERC-8004 compatible.\n\n' +
        '**Quick start (3 calls):** `authStart` → sign the message → `authAgentRegister` (returns JWT + your `<handle>@basemail.ai`) → `sendEmail`.\n\n' +
        '**Auth:** `Authorization: Bearer <JWT or bm_live_ API key>` on every non-public operation. `registerEmail` and `sendEmail` alternatively accept an MPP `Payment` credential (USDC.e on Tempo) when MPP is enabled.\n\n' +
        '**Errors:** JSON `{ error, code?, hint? }` (see `Error`). **Rate limits:** see `x-rate-limits`. **Versioning:** see `x-versioning`.',
      contact: { name: 'BaseMail', url: 'https://basemail.ai/developers', email: 'cloudlobst3r@basemail.ai' },
      termsOfService: 'https://basemail.ai/terms',
      'x-guidance': 'Register via POST /api/register (pay $1.00 USDC.e via MPP or use Bearer JWT from SIWE). Send email via POST /api/send ($0.01). Public endpoints like /api/register/check/{query} and /api/agent/{handle}/registration.json require no auth.',
      'x-versioning': X_VERSIONING,
      'x-deprecation-policy': X_DEPRECATION_POLICY,
    },
    externalDocs: { url: 'https://basemail.ai/developers', description: 'Developer portal' },
    'x-service-info': {
      categories: ['email', 'ai-agents', 'web3'],
      docs: { homepage: 'https://basemail.ai', developers: 'https://basemail.ai/developers', apiReference: `${base}/api/docs`, openapi: `${base}/api/openapi.json`, llmsTxt: `${base}/llms.txt` },
      chain: { name: 'Base', chainId: 8453 },
      payment: { protocol: 'MPP', method: 'tempo', currency: 'USDC.e', currencyContract: '0x20c000000000000000000000b9537d11c60e8b50', operations: { registerEmail: '1.00', sendEmail: '0.01' } },
    },
    'x-versioning': X_VERSIONING,
    'x-deprecation-policy': X_DEPRECATION_POLICY,
    'x-rate-limits': X_RATE_LIMITS,
    servers: [{ url: base, description: 'Production' }],
    tags: TAGS,
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
          description: 'JWT from POST /api/auth/agent-register (or /api/auth/verify, /api/auth/refresh). 24h expiry. Sent as `Authorization: Bearer <jwt>` — the same header also accepts an API key (see `apiKey`).',
        },
        apiKey: {
          type: 'http', scheme: 'bearer',
          description: 'API key (bm_live_...) from POST /api/keys/create, sent as Bearer token. Both JWTs and API keys travel in the same `Authorization: Bearer …` header; the server distinguishes them by the `bm_live_` prefix. API keys map to a handle and resolve the wallet from the account (some wallet-signature flows such as `buyAttn` / USDC verification require a JWT).',
        },
      },
      headers: RATE_LIMIT_HEADER_COMPONENTS,
      schemas,
    },
  };
}
