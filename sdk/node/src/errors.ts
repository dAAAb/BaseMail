import type { ApiErrorBody } from './types';

/**
 * Thrown for every non-2xx API response. Carries the HTTP status plus the
 * machine-readable `code` / `hint` fields from the BaseMail error envelope.
 */
export class BaseMailError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly hint?: string;
  readonly method: string;
  readonly path: string;
  readonly body: ApiErrorBody | null;
  /** Seconds to wait before retrying (from `Retry-After`, sent on 429). */
  readonly retryAfter?: number;

  constructor(method: string, path: string, status: number, body: ApiErrorBody | null, retryAfter?: number) {
    const msg = body?.error || `HTTP ${status}`;
    super(`${method} ${path} failed (${status}): ${msg}${body?.hint ? ` — ${body.hint}` : ''}`);
    this.name = 'BaseMailError';
    this.status = status;
    this.code = body?.code;
    this.hint = body?.hint;
    this.method = method;
    this.path = path;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

export async function errorFromResponse(method: string, path: string, res: Response): Promise<BaseMailError> {
  let body: ApiErrorBody | null = null;
  try {
    const json = (await res.json()) as unknown;
    if (json && typeof json === 'object') body = json as ApiErrorBody;
  } catch {
    body = null;
  }
  const ra = res.headers.get('Retry-After');
  const retryAfter = ra && /^\d+$/.test(ra) ? Number(ra) : undefined;
  return new BaseMailError(method, path, res.status, body, retryAfter);
}
