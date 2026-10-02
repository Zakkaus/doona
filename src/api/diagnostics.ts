import {ApiError, LocalError, type OperationRef} from './error';

// The last API failures and unknown operation outcomes, kept in memory only so a person can copy them into a bug report
// without opening the browser console. Request bodies and configuration text are never stored.
export type Diagnostic = {
  time: string;
  request: {method: string; path: string} | null;
  status: number | null;
  code: string | null;
  message: string;
  details: unknown;
  requestId: string | null;
  operation: OperationRef | null;
};

export const DIAGNOSTICS_LIMIT = 20;
let ring: Diagnostic[] = [];
const listeners = new Set<() => void>();

export const diagnostics = {
  snapshot: () => ring,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  clear() {
    ring = [];
    listeners.forEach(listener => listener());
  }
};

const SECRET_KEY = /secret|token|password|passwd|authorization|credential|cookie|api[_-]?key|private/i;
// Keys that carry what the person wrote or the backend echoed back, not what went wrong.
const BODY_KEY = /^(content|body|text|source_text|config|candidate)$/i;
const MAX_TEXT = 300;
const MAX_ITEMS = 20;
const MAX_DEPTH = 4;

// A string without credentials in a URL or a bearer token, and without a query string, cut to a readable length.
export function scrubText(text: string): string {
  const clean = text
    .replace(/(\bbearer\s+)[\w.~+/=-]+/gi, '$1[redacted]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, '$1')
    .replace(/(https?:\/\/[^\s?#]*)\?[^\s#]*/gi, '$1');
  return clean.length > MAX_TEXT ? clean.slice(0, MAX_TEXT) + '…' : clean;
}

// A value as the API returned it, with secrets and bodies replaced and the size bounded.
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[omitted]';
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map(item => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_ITEMS)
      .map(([key, item]) => [key, SECRET_KEY.test(key) ? '[redacted]' : BODY_KEY.test(key) ? '[omitted]' : redact(item, depth + 1)])
  );
}

export function diagnosticOf(error: unknown, now = new Date()): Diagnostic {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null;
  const source = error instanceof ApiError || error instanceof LocalError ? error : cause instanceof ApiError || cause instanceof LocalError ? cause : error;
  const base = {time: now.toISOString(), request: null, status: null, code: null, details: null, requestId: null, operation: null};
  if (source instanceof ApiError)
    return {
      ...base,
      request: source.request,
      status: source.status,
      code: source.code || null,
      message: scrubText(source.message),
      details: redact(source.details),
      requestId: source.requestId
    };
  if (source instanceof LocalError)
    return {...base, code: source.code, message: scrubText(source.detail ?? source.key), details: redact(source.details), operation: source.operation};
  return {...base, message: scrubText(source instanceof Error ? source.message : String(source))};
}

// Records a failure and returns its entry, the newest last; the oldest beyond the limit goes.
export function recordDiagnostic(error: unknown): Diagnostic {
  const entry = diagnosticOf(error);
  ring = [...ring, entry].slice(-DIAGNOSTICS_LIMIT);
  listeners.forEach(listener => listener());
  return entry;
}

export type DiagnosticsHeader = {doona: string; engine?: string; route: string};

// Plain text for a bug report: the versions and the page first, then one block per entry.
export function formatDiagnostics(entries: Diagnostic[], {doona, engine, route}: DiagnosticsHeader): string {
  const head = [`doona ${doona}`, engine && `engine ${engine}`, `page ${route}`].filter(Boolean).join('\n');
  const blocks = entries.map(({time, request, status, code, message, details, requestId, operation}) =>
    [
      `[${time}]${request ? ` ${request.method} ${request.path}` : ''}`,
      status !== null && `status: ${status}`,
      code && `code: ${code}`,
      `message: ${message}`,
      requestId && `request_id: ${requestId}`,
      operation && `operation: ${operation.id} ${operation.kind} ${operation.status}`,
      details !== null && `details: ${JSON.stringify(details)}`
    ]
      .filter(Boolean)
      .join('\n')
  );
  return [head, ...blocks].join('\n\n');
}
