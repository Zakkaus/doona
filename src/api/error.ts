import type {ErrorResponse} from './model';

import type {Key} from '../i18n/messages';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string | null = null,
    public details: unknown = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function responseError(response: Response): Promise<ApiError> {
  const body: Partial<ErrorResponse> | null = await response.json().catch(() => null);
  return new ApiError(
    response.status,
    body?.error?.code ?? '',
    body?.error?.message ?? response.statusText,
    body?.request_id ?? null,
    body?.error?.details ?? null
  );
}

// A failure the client raises itself: an operation that ended without success, a request the backend cannot take.
// The message is a message key, so errorText renders it in the page's language; `detail` is the backend's text.
export class LocalError extends Error {
  constructor(
    public key: Key,
    public detail: string | null = null
  ) {
    super(key);
    this.name = 'LocalError';
  }
}
