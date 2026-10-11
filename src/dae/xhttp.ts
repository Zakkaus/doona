// XHTTP options of a vless or trojan share link: request fields in its query, the rest in its Xray `extra` JSON.
// Writes preserve unchanged query parameter strings, but may normalize empty separators or surrounding blanks.
// Changing extra uses JSON.parse/JSON.stringify: whitespace is normalized and numbers use JavaScript precision.
// The link stays the only saved copy, and honk alone decides what is valid.

export type XhttpDownload = {address: string; port: string; serverName: string; path: string; host: string};
export type XhttpFields = {
  mode: string;
  path: string;
  host: string;
  headers: Array<[string, string]>;
  xPaddingBytes: string;
  noGRPCHeader: boolean;
  scMaxEachPostBytes: string;
  scMinPostsIntervalMs: string;
  download: XhttpDownload | null;
};
export type XhttpChange = Partial<Omit<XhttpFields, 'download'>> & {download?: Partial<XhttpDownload> | null};
export const xhttpModes = ['auto', 'packet-up', 'stream-up', 'stream-one'];
const ranges = ['xPaddingBytes', 'scMaxEachPostBytes', 'scMinPostsIntervalMs'] as const;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const decode = (raw: string) => decodeURIComponent(raw.replace(/\+/g, ' '));
// Xray reads a bare count as a number and anything else, `min-max` included, as text.
const scalar = (value: string) => (/^\d+$/.test(value) ? Number(value) : value);

// A value a field can show and write back unchanged. Any other shape makes the link one these fields do not edit.
function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  throw new Error('not editable');
}
function rangeText(value: unknown): string {
  return isObject(value) && typeof value.min === 'number' && typeof value.max === 'number' ? `${value.min}-${value.max}` : text(value);
}

// Empty text, false, null and empty objects are what a field leaves unset, so they remove the member.
function put(target: Json, key: string, value: unknown) {
  if (value === '' || value === false || value == null || (isObject(value) && !Object.keys(value).length)) delete target[key];
  else target[key] = value;
}

function fields(query: Partial<Record<string, string>>, extra: Json): XhttpFields {
  const {headers = {}, downloadSettings: download} = extra;
  if (!isObject(headers) || (download !== undefined && !isObject(download))) throw new Error('not editable');
  const member = (group: string, name: string) => {
    const value = download?.[group];
    if (value !== undefined && !isObject(value)) throw new Error('not editable');
    return text(value?.[name]);
  };
  return {
    mode: query.mode ?? text(extra.mode),
    path: query.path ?? text(extra.path),
    host: query.host ?? text(extra.host),
    headers: Object.entries(headers).map(([name, value]) => {
      if (typeof value !== 'string') throw new Error('not editable');
      return [name, value];
    }),
    xPaddingBytes: rangeText(extra.xPaddingBytes),
    noGRPCHeader: extra.noGRPCHeader === true,
    scMaxEachPostBytes: rangeText(extra.scMaxEachPostBytes),
    scMinPostsIntervalMs: rangeText(extra.scMinPostsIntervalMs),
    download: download
      ? {
          address: text(download.address),
          port: text(download.port),
          serverName: member('tlsSettings', 'serverName'),
          path: member('xhttpSettings', 'path'),
          host: member('xhttpSettings', 'host')
        }
      : null
  };
}

function parse(link: string) {
  const match = /^((?:vless|trojan):\/\/[^?#]*)(?:\?([^#]*))?(#.*)?$/i.exec(link.trim());
  if (!match) return null;
  const params = (match[2] ?? '').split('&').filter(Boolean);
  try {
    const query: Partial<Record<string, string>> = {};
    for (const param of params) {
      const key = decode(param.split('=', 1)[0]);
      if (!['type', 'network', 'mode', 'path', 'host', 'extra'].includes(key)) continue;
      // A repeated claim is honk's to reconcile; structured editing would have to pick one.
      if (key in query) return null;
      query[key] = decode(param.includes('=') ? param.slice(param.indexOf('=') + 1) : '');
    }
    const transport = query.type ?? query.network;
    if (transport !== 'xhttp' && transport !== 'splithttp') return null;
    const extra: unknown = query.extra === undefined ? {} : JSON.parse(query.extra);
    if (!isObject(extra)) return null;
    return {head: match[1], params, fragment: match[3] ?? '', extra, current: fields(query, extra)};
  } catch {
    return null;
  }
}

// The structured view of an XHTTP link, or null for any other link or one too irregular to edit field by field.
export function readXhttp(link: string): XhttpFields | null {
  return parse(link)?.current ?? null;
}

// HTTP header names are case-insensitive; only later named rows offend, so the first stays editable too.
export function duplicateXhttpHeaders(headers: XhttpFields['headers']): Set<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  headers.forEach(([name], index) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) duplicates.add(index);
    seen.add(key);
  });
  return duplicates;
}

export function writeXhttp(link: string, change: XhttpChange): string {
  const parsed = parse(link);
  if (!parsed) return link;
  // Keep the original link until edited duplicate rows are corrected, without blocking unrelated patches.
  if (change.headers && duplicateXhttpHeaders(change.headers).size) return link;
  const {current, params, extra} = parsed;
  const before = JSON.stringify(extra);
  let changed = false;
  const setParam = (key: string, value: string) => {
    const at = params.findIndex(param => decode(param.split('=', 1)[0]) === key);
    const param = `${key}=${encodeURIComponent(value).replace(/'/g, '%27')}`;
    if (!value) {
      if (at < 0) return;
      params.splice(at, 1);
    } else if (at >= 0) params[at] = param;
    else params.push(param);
    changed = true;
  };
  for (const key of ['mode', 'path', 'host'] as const) {
    const value = change[key];
    if (value === undefined || value === current[key]) continue;
    setParam(key, value);
    // The query claim wins; a stale copy in extra would only resurface once the query claim is cleared.
    delete extra[key];
  }
  for (const key of ranges) {
    const value = change[key];
    if (value !== undefined && value !== current[key]) put(extra, key, scalar(value.trim()));
  }
  if (change.noGRPCHeader !== undefined && change.noGRPCHeader !== current.noGRPCHeader) put(extra, 'noGRPCHeader', change.noGRPCHeader);
  if (change.headers) {
    // Compare only named rows: a pending row must not remove an explicitly empty headers object.
    const headers = change.headers.map(([name, value]) => [name.trim(), value]).filter(([name]) => name);
    if (
      headers.length !== current.headers.length ||
      headers.some(([name, value], index) => name !== current.headers[index][0] || value !== current.headers[index][1])
    )
      put(extra, 'headers', Object.fromEntries(headers));
  }
  if (change.download === null) delete extra.downloadSettings;
  else if (change.download !== undefined) {
    // honk accepts only an H2-over-TLS XHTTP download peer; initialize those claims when creating one.
    const settings: Json = isObject(extra.downloadSettings) ? extra.downloadSettings : {network: 'xhttp', security: 'tls'};
    for (const key of ['address', 'port'] as const) {
      const value = change.download[key];
      if (value !== undefined && value !== current.download?.[key]) put(settings, key, key === 'port' ? scalar(value) : value);
    }
    for (const [key, group] of [
      ['serverName', 'tlsSettings'],
      ['path', 'xhttpSettings'],
      ['host', 'xhttpSettings']
    ] as const) {
      const value = change.download[key];
      if (value === undefined || value === current.download?.[key]) continue;
      const nested = isObject(settings[group]) ? settings[group] : {};
      put(nested, key, value);
      put(settings, group, nested);
    }
    extra.downloadSettings = settings;
  }
  const serialized = JSON.stringify(extra);
  if (serialized !== before) setParam('extra', Object.keys(extra).length ? serialized : '');
  // Unchanged means the very same string, surrounding blanks and separators included.
  return changed ? `${parsed.head}${params.length ? `?${params.join('&')}` : ''}${parsed.fragment}` : link;
}
