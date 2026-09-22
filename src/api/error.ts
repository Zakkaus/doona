import type {ErrorResponse} from './model';

import type {Key} from '../i18n/messages';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string | null = null,
    public details: unknown = null,
    // Seconds the backend asked to wait before trying again, when it said so.
    public retryAfter: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
  // A 503 or 429 with a Retry-After is the backend saying not now, not no: a poll waits it out before it
  // counts as a failure. A bare 503 is a proxy with nothing behind it, and shows at once.
  get transient() {
    return (this.status === 503 || this.status === 429) && this.retryAfter !== null;
  }
}

export async function responseError(response: Response): Promise<ApiError> {
  const body: Partial<ErrorResponse> | null = await response.json().catch(() => null);
  const retryAfter = Number(response.headers.get('Retry-After'));
  return new ApiError(
    response.status,
    body?.error?.code ?? '',
    body?.error?.message ?? (response.statusText || `HTTP ${response.status}`),
    body?.request_id ?? null,
    body?.error?.details ?? null,
    retryAfter > 0 ? retryAfter : null
  );
}

// Local failures carry a message key; detail preserves backend text.
export class LocalError extends Error {
  constructor(
    public key: Key,
    public detail: string | null = null
  ) {
    super(key);
    this.name = 'LocalError';
  }
}
