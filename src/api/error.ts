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

// Local failures carry a message key; detail, code and details preserve the backend's error.
export class LocalError extends Error {
  constructor(
    public key: Key,
    public detail: string | null = null,
    public code: string | null = null,
    public details: unknown = null
  ) {
    super(key);
    this.name = 'LocalError';
  }
}

// The backend's part of a local failure, in its words when it sent a known code.
const localDetail = (error: LocalError, t: Translator) =>
  error.detail ? (error.code ? backendMessage(error.code, error.detail, t, error.details) : error.detail) : undefined;

// The words for a failure: doona's own errors in the current language, the backend's message as it sent it.
export function errorText(error: unknown, t: Translator): string {
  if (error instanceof LocalError) {
    const detail = localDetail(error, t);
    return detail ? t('ui.valuePair', {label: t(error.key), value: detail}) : t(error.key);
  }
  if (error instanceof ApiError && error.text) return t(error.text.key, error.text.params);
  const message =
    error instanceof ApiError ? backendMessage(error.code, error.message, t, error.details) : error instanceof Error ? error.message : String(error);
  return error instanceof ApiError && error.requestId ? message + t('ui.requestNote', {id: error.requestId}) : message;
}

// The request note errorText appends, as every language words ui.requestNote: request_id in half- or full-width
// brackets. A toast drops it; the places that stay on screen keep it for a bug report.
const REQUEST_NOTE = /\s*[(（]request_id[:：][^)）]*[)）]/g;
export const withoutRequestNote = (text: string) => text.replace(REQUEST_NOTE, '');

// What to tell the person about a failed action: the action's summary, with the error as its detail. An operation
// whose outcome is unknown did not fail: it is reported on its own, neutrally. A file written but not applied is
// reported under its own summary too, since the action's would say the write failed.
export type Notice = {kind: 'neutral' | 'negative'; text: string; detail?: string};
export function failureNotice(error: unknown, t: Translator, summary: string): Notice {
  if (error instanceof LocalError && error.key === 'ui.operationUnknown') return {kind: 'neutral', text: t(error.key)};
  if (error instanceof LocalError && error.key === 'ui.writtenNotApplied') return {kind: 'negative', text: t(error.key), detail: localDetail(error, t)};
  return {kind: 'negative', text: summary, detail: errorText(error, t)};
}

// A notice as one line, for a place that shows it inline rather than as a toast.
export const noticeText = ({text, detail}: Notice, t: Translator) => (detail ? t('ui.valuePair', {label: text, value: detail}) : text);
