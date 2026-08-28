// Types mirror https://api.basemail.ai/api/openapi.json (OpenAPI 3.1).
// Field names are kept identical to the wire format (snake_case).

export interface BaseMailOptions {
  /** Ethereum private key (0x...). The SDK signs a SIWE message locally and exchanges it for a JWT. */
  privateKey?: string;
  /** BaseMail API key (bm_live_...). Long-lived; create one with `client.keys.create()`. */
  apiKey?: string;
  /**
   * Existing JWT (24h expiry) from POST /api/auth/agent-register or /api/auth/verify.
   * May be combined with `privateKey` as a warm session: the SDK uses the token first and
   * only signs a new SIWE message when the token (and refresh token) no longer work.
   */
  token?: string;
  /** Optional refresh token (bm_refresh_...) that pairs with `token`; used to mint a new JWT on 401. */
  refreshToken?: string;
  /** API base URL (default: https://api.basemail.ai) */
  baseUrl?: string;
  /** Custom fetch implementation (defaults to globalThis.fetch). */
  fetch?: typeof fetch;
}

export type Handle = string;
export type UnixSeconds = number;

// ── Auth ──

export interface RegisterOptions {
  /** A Basename you own (e.g. `alice.base.eth`). Omit to auto-detect (falls back to the 0x address). */
  basename?: string;
}

export interface AuthResult {
  /** JWT (HS256), 24h expiry. */
  token: string;
  /** Long-lived refresh token for POST /api/auth/refresh. `null` if issuance failed. */
  refresh_token?: string | null;
  email: string;
  handle: Handle;
  wallet: string;
  basename?: string | null;
  tier: 'free' | 'pro';
  registered: true;
  /** true when this call created the account (HTTP 201). */
  new_account: boolean;
  /** How the handle was derived. New accounts only. */
  source?: 'basename' | 'address';
  pending_emails?: number;
  migrated_emails?: number;
  upgrade_hint?: Record<string, unknown>;
}

/** Response of POST /api/auth/verify (sign-in without auto-registering). */
export interface VerifyResult {
  token: string;
  refresh_token?: string | null;
  wallet: string;
  /** null when the wallet is not registered yet. */
  handle: Handle | null;
  email: string | null;
  registered: boolean;
  basename?: string | null;
  tier?: 'free' | 'pro';
  suggested_handle?: string | null;
  [extra: string]: unknown;
}

export interface RefreshResult {
  token: string;
  /** Present only when `rotate: true` was sent. */
  refresh_token?: string;
}

// ── Send ──

export interface Attachment {
  filename: string;
  content_type: string;
  /** Base64-encoded file bytes. Total decoded size of all attachments must be <= 10 MB. */
  data: string;
}

export interface SendOptions {
  /** Recipient. `@basemail.ai` recipients are delivered internally for free; anything else costs 1 credit. */
  to: string;
  subject: string;
  /** Plain-text body. Markdown is auto-rendered to HTML when `html` is omitted. */
  body: string;
  /** Optional HTML body. */
  html?: string;
  /** Email ID from your inbox to reply to. */
  in_reply_to?: string;
  /** Send as another Basename you own (on-chain verified). */
  from_handle?: string;
  attachments?: Attachment[];
  /** Attach an on-chain USDC transfer to the email. */
  usdc_payment?: {
    tx_hash: string;
    amount: string;
    network?: 'base-mainnet' | 'base-sepolia';
  };
  /** Record a PaymentEscrow deposit so the recipient can claim USDC. */
  escrow_claim?: {
    claim_id: string;
    amount: string;
    deposit_tx: string;
    network?: 'base-mainnet' | 'base-sepolia';
    expires_at: UnixSeconds;
  };
}

export interface SendResult {
  success: boolean;
  /** ID of the message. Your sent copy is stored as `<email_id>-sent`. */
  email_id: string;
  from: string;
  from_alias?: string;
  primary_handle?: string;
  to: string;
  subject: string;
  /** true = delivered inside BaseMail (free); false = external (1 credit). */
  internal: boolean;
  bond_resolved?: boolean;
  /** Number of attachments sent. */
  attachments: number;
  usdc_payment?: { verified: boolean; amount: string; tx_hash: string; network: string };
  escrow_claim?: { claim_id?: string; amount?: string; claim_url?: string; expires_at?: UnixSeconds };
  /** ATTN auto-stake result. Present for internal sends when the ATTN system ran. */
  attn?: {
    staked?: boolean;
    amount?: number;
    reason?: string;
    balance_after?: number;
    diplomat?: Record<string, unknown>;
  };
  attn_reply_bonus?: { refunded?: number; bonus_each?: number; note?: string };
}

// ── Inbox ──

export type Folder = 'inbox' | 'sent';

export interface InboxOptions {
  folder?: Folder;
  /** Page size (max 100, default 20). */
  limit?: number;
  offset?: number;
  /** If true, only inbox emails with an active USDC attention bond. */
  bonded?: boolean;
  /** Sort column (bonded mode only). */
  sort?: 'created_at' | 'bond_amount' | 'deadline';
  /** Sort direction (bonded mode only). */
  order?: 'asc' | 'desc';
}

/** Email summary as returned by GET /api/inbox. */
export interface Email {
  id: string;
  folder: Folder;
  from_addr: string;
  to_addr: string;
  subject?: string | null;
  /** First 200 chars of the plain-text body. */
  snippet?: string | null;
  /** Raw MIME size in bytes. */
  size?: number;
  /** 0 = unread, 1 = read. */
  read?: 0 | 1;
  created_at: UnixSeconds;
  bond_amount?: number | null;
  bond_status?: string | null;
  bond_deadline?: UnixSeconds | null;
  attn_stake?: number | null;
  attn_status?: 'pending' | 'refunded' | 'transferred' | null;
  attn_expires?: UnixSeconds | null;
}

export interface AttachmentInfo {
  filename: string;
  content_type: string;
  /** Approximate decoded size in bytes. Download via GET /api/inbox/{id}/attachment/{index}. */
  size: number;
}

/** Full email as returned by GET /api/inbox/{id}. */
export interface EmailDetail extends Email {
  handle: Handle;
  r2_key: string;
  /** Full raw RFC 822 message (headers + MIME parts). null if the stored object is missing. */
  body: string | null;
  attachments: AttachmentInfo[];
  usdc_amount?: string | null;
  usdc_tx?: string | null;
  usdc_network?: string | null;
}

export interface InboxResult {
  emails: Email[];
  /** Total emails in the requested folder. */
  total: number;
  unread: number;
  /** Inbox emails with an active USDC attention bond. */
  bonded_count: number;
  limit: number;
  offset: number;
}

export interface MarkReadOptions {
  /** Email IDs to mark read. Omit to mark the whole folder read. */
  ids?: string[];
  folder?: Folder;
}

export interface MarkReadResult {
  success: boolean;
  folder: string;
  /** Remaining unread count in the folder. */
  unread: number;
}

// ── Identity ──

/** Public identity from GET /api/identity/{handle}. */
export interface Identity {
  handle: Handle;
  email: string;
  wallet: string;
  basename?: string | null;
  registered_at?: UnixSeconds;
  tx_hash?: string | null;
  /** true if a World ID verification exists for this handle. */
  is_human?: boolean;
  verification_level?: string | null;
}

/** Authenticated account settings from GET /api/settings. */
export interface AccountSettings {
  handle: Handle;
  wallet: string;
  basename?: string | null;
  notification_email?: string | null;
  webhook_url?: string | null;
  aliases: Array<{
    id?: string;
    handle?: Handle;
    basename?: string;
    is_primary?: 0 | 1;
    expiry?: UnixSeconds | null;
    created_at?: UnixSeconds;
  }>;
}

// ── API keys ──

export interface CreateKeyOptions {
  name?: string;
  /** Informational today; keys currently grant the same access as a JWT for the handle. */
  scopes?: string[];
}

export interface CreateKeyResult {
  /** Shown once. Use as `Authorization: Bearer bm_live_...` or `new BaseMail({ apiKey })`. */
  api_key: string;
  handle: Handle;
  scopes: string[];
  note?: string;
}

export interface ApiKeyInfo {
  /** First 12 hex chars of the key hash; usable as `key_id` for revoke. */
  id: string;
  name: string | null;
  scopes: string[];
  created_at: UnixSeconds;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface RevokeKeyOptions {
  api_key?: string;
  key_id?: string;
}

// ── ATTN ──

export interface AttnBalance {
  handle: Handle;
  balance: number;
  daily_earned: number;
  daily_earn_cap: number;
  daily_earn_remaining: number;
  can_claim: boolean;
  /** Unix ts of next drip, null if claimable now. */
  next_claim_at: UnixSeconds | null;
  next_claim_in_seconds: number;
  constants?: {
    daily_drip?: number;
    cold_stake?: number;
    reply_stake?: number;
    reply_bonus?: number;
    buy_rate?: string;
  };
}

export interface AttnClaimResult {
  claimed: boolean;
  /** Present when claimed. */
  amount?: number;
  balance: number;
  /** Present when `claimed` is false. */
  reason?: 'already_claimed' | 'daily_cap_reached';
  next_claim_at?: UnixSeconds;
  next_claim_in_seconds?: number;
}

export interface AttnTransaction {
  id: string;
  /** Signed delta. */
  amount: number;
  type:
    | 'signup_grant'
    | 'drip_claim'
    | 'stake'
    | 'refund'
    | 'reply_bonus'
    | 'compensation'
    | 'forfeit'
    | 'purchase'
    | 'airdrop';
  ref_email_id?: string | null;
  note?: string | null;
  created_at: UnixSeconds;
}

export interface AttnHistoryOptions {
  /** Page size (max 100, default 50). */
  limit?: number;
  offset?: number;
}

export interface AttnHistoryResult {
  transactions: AttnTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface AttnSettings {
  handle: Handle;
  /** ATTN a sender must stake to email you. */
  receive_price: number;
  min: number;
  max: number;
  note?: string;
}

// ── Webhooks ──

export interface WebhookCreateOptions {
  /** HTTPS endpoint to receive POST callbacks. */
  url: string;
  /** Events to subscribe to, e.g. `['message.received']`. */
  events?: string[];
}

export interface Webhook {
  id: string;
  url: string;
  /** Comma-separated event list, e.g. `message.received`. */
  events: string;
  active: 0 | 1;
  created_at: UnixSeconds;
  last_triggered_at: number | null;
}

export interface WebhookCreated extends Webhook {
  /** HMAC-SHA256 secret (hex). Shown once. Verify deliveries via `X-BaseMail-Signature: sha256=<hmac of body>`. */
  secret: string;
  note?: string;
}

// ── Errors ──

/** Standard error envelope returned by every non-2xx response. */
export interface ApiErrorBody {
  error: string;
  /** e.g. `nonce_expired`, `signature_invalid`, `rate_limited`, `not_found`, `internal_error`. */
  code?: string;
  /** Actionable next step for agents. */
  hint?: string;
  [extra: string]: unknown;
}
