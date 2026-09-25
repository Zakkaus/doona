import type {ErrorResponse} from './model';

import type {Key} from '../i18n';
import type {Params, Translator} from '../i18n/index';
import {backendMessage} from '../i18n/backend';

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

// A request that gets no response at all fails with the browser's own words ("Failed to fetch", "Load failed"); it is
// reported as a network failure in the page language instead. A cancelled request keeps its AbortError.
export async function send(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
    if (error instanceof TypeError && !signal?.aborted) throw clientError(0, 'network_error', error.message, 'ui.errNetwork');
    throw error;
  }
}

// Local failures carry a message key; detail preserves backend text.
export class LocalError extends Error {
  constructor(
    public key: Key,
    public detail: string | null = null,
    public code: string | null = null
  ) {
    super(key);
    this.name = 'LocalError';
  }
}

// The words for a failure: doona's own errors in the current language, the backend's message as it sent it.
export function errorText(error: unknown, t: Translator): string {
  if (error instanceof LocalError) {
    const text = t(error.key);
    return error.detail ? t('ui.valuePair', {label: text, value: error.code ? backendMessage(error.code, error.detail, t) : error.detail}) : text;
  }
  if (error instanceof ApiError && error.text) return t(error.text.key, error.text.params);
  const message = error instanceof ApiError ? backendMessage(error.code, error.message, t) : error instanceof Error ? error.message : String(error);
  return error instanceof ApiError && error.requestId ? message + t('ui.requestNote', {id: error.requestId}) : message;
}

// What to tell the person about a failed action, wrapped in that action's failure wording. An operation whose outcome
// is unknown did not fail: it is reported on its own, neutrally.
export function failureNotice(error: unknown, t: Translator, wrap: (error: string) => string) {
  if (error instanceof LocalError && error.key === 'ui.operationUnknown') return {kind: 'neutral' as const, text: t(error.key)};
  return {kind: 'negative' as const, text: wrap(errorText(error, t))};
}
