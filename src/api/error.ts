import type {ErrorResponse} from './model';

import type {Key} from '../i18n';
import type {Params, Translator} from '../i18n/index';
import {backendMessage, oneLine, type BackendMessage} from '../i18n/backend';

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

// A backend that accepts the connection and never answers would leave the request, and every consumer sharing it,
// waiting forever. A write gets longer, since the backend may be applying it. The limit runs until the headers arrive
// and then between chunks of the body, so a large body arriving steadily is not cut off, only one that stalls.
export const READ_DEADLINE_MS = 15000;
export const WRITE_DEADLINE_MS = 30000;

// The caller's signal and the deadline as one. AbortSignal.any lets the browser drop the pair once both are gone; the
// fallback forwards through listeners, which release removes once the request is over.
function either(caller: AbortSignal, deadline: AbortSignal): {signal: AbortSignal; release: () => void} {
  if (typeof AbortSignal.any === 'function') return {signal: AbortSignal.any([caller, deadline]), release: () => {}};
  const both = new AbortController();
  if (caller.aborted) {
    both.abort(caller.reason);
    return {signal: both.signal, release: () => {}};
  }
  const fromCaller = () => both.abort(caller.reason);
  const fromDeadline = () => both.abort(deadline.reason);
  caller.addEventListener('abort', fromCaller, {once: true});
  deadline.addEventListener('abort', fromDeadline, {once: true});
  return {
    signal: both.signal,
    release: () => {
      caller.removeEventListener('abort', fromCaller);
      deadline.removeEventListener('abort', fromDeadline);
    }
  };
}

// One request's deadline: `arm` starts the limit over, `over` stops it and releases the caller's signal once the
// request has finished, failed or been cancelled.
type Deadline = {signal: AbortSignal; arm: () => void; over: () => void};
function deadlineFor(caller: AbortSignal | null, limit: number, timeout: ApiError): Deadline {
  const controller = new AbortController();
  const joined = caller ? either(caller, controller.signal) : {signal: controller.signal, release: () => {}};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(timeout), limit);
  };
  arm();
  return {
    signal: joined.signal,
    arm,
    over: () => {
      clearTimeout(timer);
      joined.release();
    }
  };
}

// The body is read after send has returned, and some engines error the stream with a plain AbortError rather than the
// abort reason. A read that fails once the deadline has passed fails with the timeout error; a caller abort keeps its
// own error. A body-less response has nothing to stall and passes as it is, and so does a no-content status, which
// Chromium gives an empty stream but a Response cannot be built with. A body nobody reads keeps the deadline, which
// then frees the connection. The rebuilt response keeps the original's url, type and redirect flag.
const NO_CONTENT = new Set([204, 205, 304]);
function bodyWithin(response: Response, caller: AbortSignal | null, deadline: Deadline, timeout: ApiError): Response {
  if (!response.body || NO_CONTENT.has(response.status)) {
    deadline.over();
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const {done, value} = await reader.read();
        if (done) {
          deadline.over();
          controller.close();
        } else {
          deadline.arm();
          controller.enqueue(value);
        }
      } catch (error) {
        deadline.over();
        controller.error(deadline.signal.aborted && !caller?.aborted ? timeout : error);
      }
    },
    cancel: reason => {
      deadline.over();
      return reader.cancel(reason);
    }
  });
  const rebuilt = new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
  for (const key of ['url', 'type', 'redirected'] as const) Object.defineProperty(rebuilt, key, {value: response[key]});
  return rebuilt;
}

// A request that gets no response at all fails with the browser's own words ("Failed to fetch", "Load failed"); it is
// reported as a network failure in the page language instead. A cancelled request keeps its AbortError. A stalled
// body read fails with the timeout error as well. A write that timed out may still have been applied, and its text
// says so.
export async function send(input: RequestInfo | URL, init?: RequestInit, write?: boolean): Promise<Response> {
  const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const writes = write ?? (method !== 'GET' && method !== 'HEAD');
  const limit = writes ? WRITE_DEADLINE_MS : READ_DEADLINE_MS;
  const timeout = clientError(0, 'timeout', `No response within ${limit / 1000} seconds`, writes ? 'ui.errTimeoutWrite' : 'ui.errTimeout', {
    seconds: limit / 1000
  });
  const deadline = deadlineFor(signal, limit, timeout);
  try {
    const response = await fetch(input, {...init, signal: deadline.signal});
    // The headers are in; from here the limit runs between chunks of the body.
    deadline.arm();
    return bodyWithin(response, signal, deadline, timeout);
  } catch (error) {
    deadline.over();
    if (signal?.aborted) throw error;
    if (deadline.signal.aborted) throw timeout;
    if (error instanceof TypeError) throw clientError(0, 'network_error', error.message, 'ui.errNetwork');
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
  error.detail ? (error.code ? oneLine(backendMessage(error.code, error.detail, t, error.details), t) : error.detail) : undefined;

// The words for a failure: doona's own errors in the current language, the backend's message as it sent it. A code
// honk reuses keeps the backend's words as the detail, which carries the request note when there is one and it is shown:
// a toast leaves it out, the places that stay on screen keep it for a bug report.
export function errorLines(error: unknown, t: Translator, showRequestId = true): BackendMessage {
  if (error instanceof LocalError) {
    const detail = localDetail(error, t);
    return {summary: detail ? t('ui.valuePair', {label: t(error.key), value: detail}) : t(error.key)};
  }
  if (error instanceof ApiError && error.text) return {summary: t(error.text.key, error.text.params)};
  if (!(error instanceof ApiError)) return {summary: error instanceof Error ? error.message : String(error)};
  const {summary, detail} = backendMessage(error.code, error.message, t, error.details);
  const note = showRequestId && error.requestId ? t('ui.requestNote', {requestId: error.requestId}) : '';
  return detail ? {summary, detail: detail + note} : {summary: summary + note};
}

// The same words on one line.
export const errorText = (error: unknown, t: Translator, showRequestId = true) => oneLine(errorLines(error, t, showRequestId), t);

// The backend's request id for a failure, or for the failure that stopped a partial one.
export const requestIdOf = (error: unknown): string | undefined =>
  error instanceof ApiError ? (error.requestId ?? undefined) : error instanceof Error && error.cause instanceof ApiError ? requestIdOf(error.cause) : undefined;

// What to tell the person about a failed action: the action's summary, with the error as its detail. An operation
// whose outcome is unknown did not fail: it is reported on its own, neutrally. A file written but not applied is
// reported under its own summary too, since the action's would say the write failed, and so is an activation that
// left the change active or its outcome unknown.
export type Notice = {kind: 'neutral' | 'negative'; text: string; detail?: string; requestId?: string};
const ownSummary = new Set<Key>([
  'ui.writtenNotApplied',
  'ui.activationDegraded',
  'ui.activationDegradedSaved',
  'ui.activationDegradedUnconfirmed',
  'ui.activationNotSaved',
  'ui.activationUnknown'
]);
export function failureNotice(error: unknown, t: Translator, summary: string): Notice {
  if (error instanceof LocalError && error.key === 'ui.operationUnknown') return {kind: 'neutral', text: t(error.key)};
  if (error instanceof LocalError && ownSummary.has(error.key)) return {kind: 'negative', text: t(error.key), detail: localDetail(error, t)};
  return {kind: 'negative', text: summary, detail: errorText(error, t, false), requestId: requestIdOf(error)};
}

// A notice as one line, for a place that shows it inline rather than as a toast.
export const noticeText = ({text, detail, requestId}: Notice, t: Translator, showRequestId = true) =>
  detail ? t('ui.valuePair', {label: text, value: detail + (showRequestId && requestId ? t('ui.requestNote', {requestId}) : '')}) : text;
