import { privateKeyToAccount } from 'viem/accounts';
import { authenticateWithPrivateKey, refreshToken as apiRefreshToken, signInWithPrivateKey } from './auth';
import { BaseMailError, errorFromResponse } from './errors';
import type {
  AccountSettings,
  ApiKeyInfo,
  AttnBalance,
  AttnClaimResult,
  AttnHistoryOptions,
  AttnHistoryResult,
  AttnSettings,
  AuthResult,
  BaseMailOptions,
  CreateKeyOptions,
  CreateKeyResult,
  EmailDetail,
  Identity,
  InboxOptions,
  InboxResult,
  MarkReadOptions,
  MarkReadResult,
  RegisterOptions,
  RevokeKeyOptions,
  SendOptions,
  SendResult,
  Webhook,
  WebhookCreateOptions,
  WebhookCreated,
} from './types';

export const DEFAULT_BASE_URL = 'https://api.basemail.ai';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class BaseMail {
  readonly baseUrl: string;
  /** Wallet address when constructed with `privateKey` (lowercase 0x...). */
  readonly wallet?: string;

  private readonly fetchFn: typeof fetch;
  private privateKey?: string;
  private apiKey?: string;
  private token?: string;
  private refreshTokenValue?: string;
  private authPromise?: Promise<void>;

  public readonly keys: KeysNamespace;
  public readonly attn: AttnNamespace;
  public readonly webhooks: WebhooksNamespace;

  constructor(options: BaseMailOptions) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new Error('No fetch implementation found. Use Node >= 18 or pass { fetch } to the constructor.');
    }
    this.fetchFn = f;

    if (options.apiKey) {
      this.apiKey = options.apiKey;
    } else if (options.privateKey || options.token || options.refreshToken) {
      // token / refreshToken may accompany privateKey as a warm session.
      this.token = options.token;
      this.refreshTokenValue = options.refreshToken;
      if (options.privateKey) {
        this.privateKey = options.privateKey;
        this.wallet = privateKeyToAccount(options.privateKey as `0x${string}`).address.toLowerCase();
      }
    } else {
      throw new Error('Provide one of: privateKey, apiKey, or token');
    }

    this.keys = new KeysNamespace(this);
    this.attn = new AttnNamespace(this);
    this.webhooks = new WebhooksNamespace(this);
  }

  // ── Auth ──

  /**
   * Register (or log in) with the wallet's private key via POST /api/auth/agent-register.
   * A wallet that is already registered just gets a fresh JWT (HTTP 200, `new_account: false`).
   *
   * You rarely need to call this: every other method signs in lazily on first use
   * (POST /api/auth/verify, which is not rate limited) and registers only if the
   * wallet has no inbox yet. Call it explicitly to bind a `basename`, or to get the
   * full registration payload (`refresh_token`, `pending_emails`, ...).
   *
   * Note: agent-register is rate limited to 5 calls per IP per hour.
   */
  async register(options?: RegisterOptions): Promise<AuthResult> {
    if (!this.privateKey) throw new Error('register() requires privateKey auth');
    const result = await authenticateWithPrivateKey(this.privateKey, this.baseUrl, this.fetchFn, options?.basename);
    this.token = result.token;
    this.refreshTokenValue = result.refresh_token ?? undefined;
    this.authPromise = Promise.resolve();
    return result;
  }

  /** Current JWT (undefined until the first authenticated call when using `privateKey`). */
  getToken(): string | undefined {
    return this.token;
  }

  /** Current refresh token, if the server issued one. */
  getRefreshToken(): string | undefined {
    return this.refreshTokenValue;
  }

  /** Sign in with the private key; registers the wallet only if it has no inbox yet. */
  private async siweLogin(): Promise<void> {
    const pk = this.privateKey!;
    const v = await signInWithPrivateKey(pk, this.baseUrl, this.fetchFn);
    if (v.registered && v.handle) {
      this.token = v.token;
      this.refreshTokenValue = v.refresh_token ?? undefined;
      return;
    }
    const r = await authenticateWithPrivateKey(pk, this.baseUrl, this.fetchFn);
    this.token = r.token;
    this.refreshTokenValue = r.refresh_token ?? undefined;
  }

  private async ensureAuth(): Promise<void> {
    if (this.apiKey || this.token) return;
    if (this.refreshTokenValue && (await this.tryRefresh())) return;
    if (!this.privateKey) throw new Error('No auth credentials');
    if (!this.authPromise) {
      this.authPromise = this.siweLogin();
      this.authPromise.catch(() => {
        this.authPromise = undefined;
      });
    }
    await this.authPromise;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshTokenValue) return false;
    try {
      const r = await apiRefreshToken(this.refreshTokenValue, this.baseUrl, this.fetchFn);
      this.token = r.token;
      if (r.refresh_token) this.refreshTokenValue = r.refresh_token;
      this.authPromise = Promise.resolve();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Re-authenticate after a 401. Tries the refresh token first, then falls
   * back to a fresh SIWE sign-in when a private key is available.
   */
  private async reauth(): Promise<boolean> {
    if (this.apiKey) return false;
    if (await this.tryRefresh()) return true;
    this.refreshTokenValue = undefined; // dead refresh token; don't retry it
    if (this.privateKey) {
      this.token = undefined;
      this.authPromise = undefined;
      await this.ensureAuth();
      return true;
    }
    return false;
  }

  private getAuthHeader(): string {
    if (this.apiKey) return `Bearer ${this.apiKey}`;
    if (this.token) return `Bearer ${this.token}`;
    throw new Error('Not authenticated');
  }

  /**
   * Low-level authenticated request. Throws `BaseMailError` on non-2xx.
   * Retries once after re-authenticating on 401 (privateKey / refreshToken auth).
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    authenticated = true,
  ): Promise<T> {
    if (authenticated) await this.ensureAuth();

    const doFetch = () => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (authenticated) headers['Authorization'] = this.getAuthHeader();
      return this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    };

    let res = await doFetch();
    if (res.status === 401 && authenticated && (await this.reauth())) {
      res = await doFetch();
    }
    if (!res.ok) throw await errorFromResponse(method, path, res);
    return (await res.json()) as T;
  }

  // ── Mail ──

  /** Send an email. `@basemail.ai` recipients are delivered internally for free. */
  async send(options: SendOptions): Promise<SendResult> {
    return this.request<SendResult>('POST', '/api/send', options as unknown as Record<string, unknown>);
  }

  /** List emails in the inbox (default) or sent folder. */
  async inbox(options?: InboxOptions): Promise<InboxResult> {
    const params = new URLSearchParams();
    if (options) {
      for (const [k, v] of Object.entries(options)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
    }
    const qs = params.toString();
    return this.request<InboxResult>('GET', `/api/inbox${qs ? '?' + qs : ''}`);
  }

  /** Fetch one email with its full raw RFC 822 body and attachment metadata. */
  async read(emailId: string): Promise<EmailDetail> {
    return this.request<EmailDetail>('GET', `/api/inbox/${encodeURIComponent(emailId)}`);
  }

  /** Mark emails as read (omit `ids` to mark the whole folder). */
  async markRead(options: MarkReadOptions = {}): Promise<MarkReadResult> {
    return this.request<MarkReadResult>('POST', '/api/inbox/mark-read', options as Record<string, unknown>);
  }

  /** Delete an email by ID. */
  async delete(emailId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/inbox/${encodeURIComponent(emailId)}`);
  }

  // ── Identity ──

  /** Public lookup by handle (no auth). Accepts `alice`, `alice@basemail.ai`, or a 0x address handle. */
  async identity(handle: string): Promise<Identity> {
    const h = handle.replace(/@basemail\.ai$/i, '');
    return this.request<Identity>('GET', `/api/identity/${encodeURIComponent(h)}`, undefined, false);
  }

  /** Public lookup by wallet address (no auth). */
  async identityByWallet(address: string): Promise<Identity> {
    return this.request<Identity>('GET', `/api/identity/wallet/${encodeURIComponent(address)}`, undefined, false);
  }

  /** The authenticated account (handle, wallet, basename, aliases, notification settings). */
  async me(): Promise<AccountSettings> {
    return this.request<AccountSettings>('GET', '/api/settings');
  }
}

// ── Namespaced sub-clients ──

class KeysNamespace {
  constructor(private client: BaseMail) {}

  /** Create a long-lived API key. The `api_key` is shown once. */
  async create(options: CreateKeyOptions = {}): Promise<CreateKeyResult> {
    return this.client.request<CreateKeyResult>('POST', '/api/keys/create', options as Record<string, unknown>);
  }

  async list(): Promise<{ keys: ApiKeyInfo[] }> {
    return this.client.request('GET', '/api/keys/list');
  }

  /** Revoke by `key_id` (from `list()`) or by the full `api_key`. */
  async revoke(options: RevokeKeyOptions): Promise<{ success: boolean }> {
    if (!options.api_key && !options.key_id) throw new Error('revoke() requires api_key or key_id');
    return this.client.request('POST', '/api/keys/revoke', options as Record<string, unknown>);
  }
}

class AttnNamespace {
  constructor(private client: BaseMail) {}

  async balance(): Promise<AttnBalance> {
    return this.client.request<AttnBalance>('GET', '/api/attn/balance');
  }

  /** Claim the daily ATTN drip. */
  async claim(): Promise<AttnClaimResult> {
    return this.client.request<AttnClaimResult>('POST', '/api/attn/claim');
  }

  async history(options: AttnHistoryOptions | number = {}): Promise<AttnHistoryResult> {
    const opts = typeof options === 'number' ? { limit: options } : options;
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset !== undefined) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return this.client.request<AttnHistoryResult>('GET', `/api/attn/history${qs ? '?' + qs : ''}`);
  }

  async settings(): Promise<AttnSettings> {
    return this.client.request<AttnSettings>('GET', '/api/attn/settings');
  }

  /** Set the ATTN a sender must stake to email you. */
  async setSettings(receive_price: number): Promise<{ success: boolean; receive_price: number }> {
    return this.client.request('PUT', '/api/attn/settings', { receive_price });
  }
}

class WebhooksNamespace {
  constructor(private client: BaseMail) {}

  /** Create a webhook. The HMAC `secret` is shown once. */
  async create(options: WebhookCreateOptions): Promise<WebhookCreated> {
    return this.client.request<WebhookCreated>('POST', '/api/webhooks', options as unknown as Record<string, unknown>);
  }

  async list(): Promise<{ webhooks: Webhook[] }> {
    return this.client.request('GET', '/api/webhooks');
  }

  async delete(webhookId: string): Promise<{ success: boolean }> {
    return this.client.request('DELETE', `/api/webhooks/${encodeURIComponent(webhookId)}`);
  }
}

export { BaseMailError };
