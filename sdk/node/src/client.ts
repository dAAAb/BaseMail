import { authenticateWithPrivateKey } from './auth';
import type {
  BaseMailOptions,
  RegisterOptions,
  SendOptions,
  InboxOptions,
  InboxResult,
  Email,
  Identity,
  AuthResult,
  CreateKeyOptions,
  CreateKeyResult,
  ApiKeyInfo,
  RevokeKeyOptions,
  AttnBalance,
  WebhookCreateOptions,
  Webhook,
} from './types';

const DEFAULT_BASE_URL = 'https://api.basemail.ai';

export class BaseMail {
  private baseUrl: string;
  private privateKey?: string;
  private apiKey?: string;
  private token?: string;
  private authPromise?: Promise<void>;

  public readonly keys: KeysNamespace;
  public readonly attn: AttnNamespace;
  public readonly webhooks: WebhooksNamespace;

  constructor(options: BaseMailOptions) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');

    if (options.apiKey) {
      this.apiKey = options.apiKey;
    } else if (options.token) {
      this.token = options.token;
    } else if (options.privateKey) {
      this.privateKey = options.privateKey;
    } else {
      throw new Error('Provide one of: privateKey, apiKey, or token');
    }

    this.keys = new KeysNamespace(this);
    this.attn = new AttnNamespace(this);
    this.webhooks = new WebhooksNamespace(this);
  }

  /**
   * Ensure we have a valid auth token (auto-SIWE if using privateKey).
   */
  private async ensureAuth(): Promise<void> {
    if (this.apiKey || this.token) return;
    if (!this.privateKey) throw new Error('No auth credentials');

    if (!this.authPromise) {
      this.authPromise = authenticateWithPrivateKey(this.privateKey, this.baseUrl).then(
        (result) => {
          this.token = result.token;
        },
      );
    }
    await this.authPromise;
  }

  private getAuthHeader(): string {
    if (this.apiKey) return `Bearer ${this.apiKey}`;
    if (this.token) return `Bearer ${this.token}`;
    throw new Error('Not authenticated');
  }

  /**
   * Make an authenticated API request. Auto-refreshes JWT on 401 for privateKey auth.
   */
  async request<T = any>(
    method: string,
    path: string,
    body?: Record<string, any>,
    authenticated = true,
  ): Promise<T> {
    if (authenticated) await this.ensureAuth();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authenticated) headers['Authorization'] = this.getAuthHeader();

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Auto-refresh on 401 if using privateKey
    if (res.status === 401 && this.privateKey && authenticated) {
      this.token = undefined;
      this.authPromise = undefined;
      await this.ensureAuth();
      headers['Authorization'] = this.getAuthHeader();

      const retryRes = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({}));
        throw new Error(`${method} ${path} failed: ${(err as any).error || retryRes.statusText}`);
      }
      return (await retryRes.json()) as T;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${method} ${path} failed: ${(err as any).error || res.statusText}`);
    }

    return (await res.json()) as T;
  }

  // ── Core API Methods ──

  /**
   * Register a new agent (only needed once for new agents with privateKey auth).
   */
  async register(options?: RegisterOptions): Promise<AuthResult> {
    if (!this.privateKey) {
      throw new Error('register() requires privateKey auth');
    }
    const result = await authenticateWithPrivateKey(
      this.privateKey,
      this.baseUrl,
      options?.basename,
    );
    this.token = result.token;
    this.authPromise = Promise.resolve();
    return result;
  }

  /**
   * Send an email.
   */
  async send(options: SendOptions): Promise<{ success: boolean; email_id: string; from: string; to: string }> {
    return this.request('POST', '/api/send', options);
  }

  /**
   * List emails in inbox or sent folder.
   */
  async inbox(options?: InboxOptions): Promise<InboxResult> {
    const params = new URLSearchParams();
    if (options?.folder) params.set('folder', options.folder);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));
    const qs = params.toString();
    return this.request('GET', `/api/inbox${qs ? '?' + qs : ''}`);
  }

  /**
   * Read a single email by ID.
   */
  async read(emailId: string): Promise<Email> {
    return this.request('GET', `/api/inbox/${emailId}`);
  }

  /**
   * Delete an email by ID.
   */
  async delete(emailId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/inbox/${emailId}`);
  }

  /**
   * Look up a public identity by handle or wallet address.
   */
  async identity(query: string): Promise<Identity> {
    return this.request('GET', `/api/identity/${query}`, undefined, false);
  }
}

// ── Namespaced sub-clients ──

class KeysNamespace {
  constructor(private client: BaseMail) {}

  async create(options?: CreateKeyOptions): Promise<CreateKeyResult> {
    return this.client.request('POST', '/api/keys/create', options || {});
  }

  async list(): Promise<{ keys: ApiKeyInfo[] }> {
    return this.client.request('GET', '/api/keys/list');
  }

  async revoke(options: RevokeKeyOptions): Promise<{ success: boolean }> {
    return this.client.request('POST', '/api/keys/revoke', options);
  }
}

class AttnNamespace {
  constructor(private client: BaseMail) {}

  async balance(): Promise<AttnBalance> {
    return this.client.request('GET', '/api/attn/balance');
  }

  async claim(): Promise<{ claimed: boolean; amount?: number; balance?: number }> {
    return this.client.request('POST', '/api/attn/claim');
  }

  async history(limit?: number): Promise<{ transactions: any[] }> {
    const qs = limit ? `?limit=${limit}` : '';
    return this.client.request('GET', `/api/attn/history${qs}`);
  }

  async settings(): Promise<{ receive_price: number }> {
    return this.client.request('GET', '/api/attn/settings');
  }

  async setSettings(receive_price: number): Promise<any> {
    return this.client.request('PUT', '/api/attn/settings', { receive_price });
  }
}

class WebhooksNamespace {
  constructor(private client: BaseMail) {}

  async create(options: WebhookCreateOptions): Promise<Webhook & { secret: string }> {
    return this.client.request('POST', '/api/webhooks', options);
  }

  async list(): Promise<{ webhooks: Webhook[] }> {
    return this.client.request('GET', '/api/webhooks');
  }

  async delete(webhookId: string): Promise<{ success: boolean }> {
    return this.client.request('DELETE', `/api/webhooks/${webhookId}`);
  }
}
