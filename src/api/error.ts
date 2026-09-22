import type {ErrorResponse} from './model';

import type {Key} from '../i18n/messages';
import type {Params} from '../i18n/index';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string | null = null,
    public details: unknown = null,
    // Seconds the backend asked to wait before trying again, when it said so.
    public retryAfter: number | null = null,
    // Set when doona raised the error itself, so the text shown is translated rather than the English message.
    public text: {key: Key; params?: Params} | null = null
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

// A contract failure detected by doona: it keeps the status and code callers branch on, and a translated text.
export const clientError = (status: number, code: string, message: string, key: Key, params?: Params) =>
  new ApiError(status, code, message, null, null, null, {key, params});

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
