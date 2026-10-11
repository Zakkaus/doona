// XHTTP options of a vless or trojan share link: the request fields in its query, the rest in its Xray `extra`
// JSON. The link stays the only copy: a write changes just the parameters whose shown value changed, so every other
// byte survives, and honk alone decides what is valid.

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

export function writeXhttp(link: string, next: XhttpFields): string {
  const parsed = parse(link);
  if (!parsed) return link;
  const {current} = parsed;
  const params = [...parsed.params];
  const extra = structuredClone(parsed.extra);
  const setParam = (key: string, value: string) => {
    const at = params.findIndex(param => decode(param.split('=', 1)[0]) === key);
    const param = `${key}=${encodeURIComponent(value)}`;
    if (!value) {
      if (at >= 0) params.splice(at, 1);
    } else if (at >= 0) params[at] = param;
    else params.push(param);
  };
  for (const key of ['mode', 'path', 'host'] as const) {
    if (next[key] === current[key]) continue;
    setParam(key, next[key]);
    // The query claim wins; a stale copy in extra would only resurface once the query claim is cleared.
    delete extra[key];
  }
  for (const key of ranges) if (next[key] !== current[key]) put(extra, key, scalar(next[key].trim()));
  if (next.noGRPCHeader !== current.noGRPCHeader) put(extra, 'noGRPCHeader', next.noGRPCHeader);
  // Only named headers can live in the link; rows still waiting for a name change nothing.
  if (JSON.stringify(next.headers) !== JSON.stringify(current.headers)) put(extra, 'headers', Object.fromEntries(next.headers.filter(([name]) => name.trim())));
  if (!next.download) put(extra, 'downloadSettings', null);
  else if (JSON.stringify(next.download) !== JSON.stringify(current.download)) {
    const old = isObject(extra.downloadSettings) ? extra.downloadSettings : {};
    const settings: Json = {...old};
    const tls = isObject(old.tlsSettings) ? {...old.tlsSettings} : {};
    const xhttp = isObject(old.xhttpSettings) ? {...old.xhttpSettings} : {};
    put(tls, 'serverName', next.download.serverName);
    put(xhttp, 'path', next.download.path);
    put(xhttp, 'host', next.download.host);
    // honk accepts only an H2-over-TLS XHTTP download peer, so those two members are not choices.
    Object.assign(settings, {address: next.download.address, port: scalar(next.download.port), network: 'xhttp', security: 'tls'});
    put(settings, 'tlsSettings', tls);
    put(settings, 'xhttpSettings', xhttp);
    extra.downloadSettings = settings;
  }
  if (JSON.stringify(extra) !== JSON.stringify(parsed.extra)) setParam('extra', Object.keys(extra).length ? JSON.stringify(extra) : '');
  const written = `${parsed.head}${params.length ? `?${params.join('&')}` : ''}${parsed.fragment}`;
  // Unchanged means the very same string, surrounding blanks included, so a caller can compare links directly.
  return written === link.trim() ? link : written;
}
