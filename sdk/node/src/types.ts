export interface BaseMailOptions {
  /** Ethereum private key (0x...) - auto SIWE auth */
  privateKey?: string;
  /** BaseMail API key (bm_live_...) */
  apiKey?: string;
  /** Existing JWT token */
  token?: string;
  /** API base URL (default: https://api.basemail.ai) */
  baseUrl?: string;
}

export interface RegisterOptions {
  basename?: string;
}

export interface SendOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  in_reply_to?: string;
  attachments?: Array<{
    filename: string;
    content_type: string;
    data: string;
  }>;
}

export interface InboxOptions {
  folder?: 'inbox' | 'sent';
  limit?: number;
  offset?: number;
}

export interface InboxResult {
  emails: Email[];
  total: number;
  unread: number;
}

export interface Email {
  id: string;
  from_addr: string;
  to_addr: string;
  subject: string;
  snippet?: string;
  body?: string;
  read: number;
  created_at: number;
  folder?: string;
}

export interface Identity {
  handle: string;
  email: string;
  basename?: string;
  wallet?: string;
}

export interface AuthResult {
  token: string;
  refresh_token?: string;
  email: string;
  handle: string;
  wallet: string;
  registered: boolean;
  new_account?: boolean;
}

export interface CreateKeyOptions {
  name?: string;
  scopes?: string[];
}

export interface CreateKeyResult {
  api_key: string;
  handle: string;
  scopes: string[];
}

export interface ApiKeyInfo {
  id: string;
  name: string | null;
  scopes: string[];
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface RevokeKeyOptions {
  api_key?: string;
  key_id?: string;
}

export interface AttnBalance {
  handle: string;
  balance: number;
  daily_earned: number;
  daily_earn_cap: number;
  can_claim: boolean;
  next_claim_in_seconds: number;
}

export interface WebhookCreateOptions {
  url: string;
  events?: string[];
}

export interface Webhook {
  id: string;
  url: string;
  events: string;
  active: number;
  created_at: number;
  last_triggered_at: number | null;
}
