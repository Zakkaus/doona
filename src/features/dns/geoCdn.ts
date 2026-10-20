import {ApiError, LocalError} from '../../api/error';
import type {GeoQuery} from './geoInput';

// The DNS page's geosite query reads Loyalsoldier's geosite.dat from a CDN and
// answers in the browser, so it works with any backend — including one whose
// native API has no geodata query endpoint. The file is downloaded once,
// cached in IndexedDB, and revalidated in the background at most once a day;
// the parsed list is kept in memory for the session.
export const GEOSITE_CDN_URL = 'https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat';

// The query and its answer, in the shape the results view renders.
export type GeodataQuery = GeoQuery & {attr?: string; limit?: number};
export type GeodataQueryEntry = {type: 'keyword' | 'regexp' | 'domain' | 'full'; value: string; attrs: string[]};
export type GeodataQueryResponse =
  | {action: 'show'; code: string; total: number; truncated: boolean; entries: GeodataQueryEntry[]}
  | {action: 'find'; value?: string; total: number; truncated: boolean; matches: (GeodataQueryEntry & {code: string})[]};

type GeoEntry = {type: GeodataQueryEntry['type']; value: string; attrs: string[]};
type GeoCategory = {code: string; entries: GeoEntry[]};

// v2ray's Domain.Type enum, in the API's words.
const TYPE_NAMES: GeodataQueryEntry['type'][] = ['keyword', 'regexp', 'domain', 'full'];

// --- Minimal protobuf decoding -------------------------------------------------
// Just enough of the wire format for v2ray's GeoSiteList: varints and
// length-delimited fields. Unknown fields are skipped, so a newer dat layout
// still parses.

class Reader {
  offset = 0;
  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.buf.length;
  }

  varint(): number {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (this.offset >= this.buf.length) throw new Error('truncated varint');
      const byte = this.buf[this.offset++]!;
      value += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return value;
      shift += 7;
      if (shift > 63) throw new Error('varint too long');
    }
  }

  tag(): {field: number; wire: number} {
    const key = this.varint();
    return {field: Math.floor(key / 8), wire: key % 8};
  }

  bytes(): Uint8Array {
    const length = this.varint();
    if (this.offset + length > this.buf.length) throw new Error('truncated field');
    const out = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  string(): string {
    return new TextDecoder().decode(this.bytes());
  }

  skip(wire: number): void {
    if (wire === 0) void this.varint();
    else if (wire === 1) this.offset += 8;
    else if (wire === 2) void this.bytes();
    else if (wire === 5) this.offset += 4;
    else throw new Error(`unsupported wire type ${wire}`);
  }
}

// GeoSiteList { repeated GeoSite entry = 1 }
export function parseGeositeList(buf: Uint8Array): GeoCategory[] {
  const categories: GeoCategory[] = [];
  const reader = new Reader(buf);
  while (!reader.done) {
    const {field, wire} = reader.tag();
    if (field === 1 && wire === 2) categories.push(parseCategory(reader.bytes()));
    else reader.skip(wire);
  }
  return categories;
}

// GeoSite { string country_code = 1; repeated Domain domain = 2 }
function parseCategory(buf: Uint8Array): GeoCategory {
  let code = '';
  const entries: GeoEntry[] = [];
  const reader = new Reader(buf);
  while (!reader.done) {
    const {field, wire} = reader.tag();
    if (field === 1 && wire === 2) code = reader.string().toLowerCase();
    else if (field === 2 && wire === 2) {
      const entry = parseEntry(reader.bytes());
      if (entry) entries.push(entry);
    } else reader.skip(wire);
  }
  return {code, entries};
}

// Domain { Type type = 1; string value = 2; repeated Attribute attribute = 3 }
// Attribute { string key = 1; ... } — only the key is kept, as the API reports.
function parseEntry(buf: Uint8Array): GeoEntry | null {
  let kind = 0;
  let value = '';
  const attrs: string[] = [];
  const reader = new Reader(buf);
  while (!reader.done) {
    const {field, wire} = reader.tag();
    if (field === 1 && wire === 0) kind = reader.varint();
    else if (field === 2 && wire === 2) value = reader.string();
    else if (field === 3 && wire === 2) {
      const key = parseAttributeKey(reader.bytes());
      if (key) attrs.push(key);
    } else reader.skip(wire);
  }
  const type = TYPE_NAMES[kind];
  return type ? {type, value, attrs} : null;
}

function parseAttributeKey(buf: Uint8Array): string {
  const reader = new Reader(buf);
  while (!reader.done) {
    const {field, wire} = reader.tag();
    if (field === 1 && wire === 2) return reader.string().toLowerCase();
    reader.skip(wire);
  }
  return '';
}

// --- Storage -------------------------------------------------------------------
// The raw dat in IndexedDB (Cache Storage needs a secure context, which a LAN
// http origin is not). Every failure degrades to memory-only caching.

const DB_NAME = 'doona-geodata';
const STORE_NAME = 'dat';
const RECORD_KEY = 'loyalsoldier-geosite';
type StoredDat = {buf: ArrayBuffer; etag: string | null; savedAt: number};

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readStoredDat(): Promise<StoredDat | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => {
        db.close();
        resolve((request.result as StoredDat | undefined) ?? null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

async function writeStoredDat(stored: StoredDat): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(stored, RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

// --- Loading -------------------------------------------------------------------

const REVALIDATE_AFTER_MS = 24 * 60 * 60 * 1000;
let parsed: GeoCategory[] | null = null;
let loading: Promise<GeoCategory[]> | null = null;
let storedMeta: {etag: string | null; savedAt: number} | null = null;
let revalidating = false;

async function fetchDat(headers?: Record<string, string>): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(GEOSITE_CDN_URL, headers ? {headers} : undefined);
  } catch {
    throw new LocalError('dns.geodataFetchFailed');
  }
  if (!response.ok)
    throw new ApiError(response.status, 'geodata_cdn_http', `HTTP ${response.status}`, null, null, null, {
      key: 'dns.geodataFetchStatus',
      params: {status: String(response.status)}
    });
  return response;
}

function parseOrFail(buf: Uint8Array): GeoCategory[] {
  try {
    const categories = parseGeositeList(buf);
    if (categories.length === 0) throw new Error('empty list');
    return categories;
  } catch {
    throw new LocalError('dns.geodataParseFailed');
  }
}

async function loadFresh(): Promise<GeoCategory[]> {
  const stored = await readStoredDat();
  if (stored) {
    storedMeta = {etag: stored.etag, savedAt: stored.savedAt};
    try {
      parsed = parseGeositeList(new Uint8Array(stored.buf));
      void revalidateIfStale();
      return parsed;
    } catch {
      // A corrupt cache is worse than a download: fall through to the network.
    }
  }
  const response = await fetchDat();
  const buf = new Uint8Array(await response.arrayBuffer());
  parsed = parseOrFail(buf);
  const etag = response.headers.get('etag');
  storedMeta = {etag, savedAt: Date.now()};
  void writeStoredDat({buf: buf.buffer as ArrayBuffer, etag, savedAt: storedMeta.savedAt});
  return parsed;
}

// The background freshness check: at most once a day, and the data in hand is
// kept whatever happens — a failed check is retried on a later visit.
async function revalidateIfStale(): Promise<void> {
  if (revalidating || !storedMeta || Date.now() - storedMeta.savedAt < REVALIDATE_AFTER_MS) return;
  revalidating = true;
  try {
    const response = await fetch(GEOSITE_CDN_URL, storedMeta.etag ? {headers: {'If-None-Match': storedMeta.etag}} : undefined);
    if (response.status === 304) {
      storedMeta = {...storedMeta, savedAt: Date.now()};
      const stored = await readStoredDat();
      if (stored) void writeStoredDat({...stored, savedAt: storedMeta.savedAt});
      return;
    }
    if (!response.ok) return;
    const buf = new Uint8Array(await response.arrayBuffer());
    const categories = parseGeositeList(buf);
    if (categories.length === 0) return;
    parsed = categories;
    const etag = response.headers.get('etag');
    storedMeta = {etag, savedAt: Date.now()};
    void writeStoredDat({buf: buf.buffer as ArrayBuffer, etag, savedAt: storedMeta.savedAt});
  } catch {
    // Offline or a bad body: the cached data stays in force.
  } finally {
    revalidating = false;
  }
}

function loadGeodata(): Promise<GeoCategory[]> {
  if (parsed) {
    void revalidateIfStale();
    return Promise.resolve(parsed);
  }
  loading ??= loadFresh().finally(() => {
    loading = null;
  });
  return loading;
}

// --- Querying ------------------------------------------------------------------
// The matching rules are v2ray's: a domain entry covers itself and every
// subdomain, a full entry covers only itself, a keyword is a substring, and a
// regexp is tested as written. Everything compares case-insensitively.

function matchesDomain(entry: GeoEntry, domain: string): boolean {
  const value = entry.value.toLowerCase();
  switch (entry.type) {
    case 'full':
      return domain === value;
    case 'domain':
      return domain === value || domain.endsWith(`.${value}`);
    case 'keyword':
      return domain.includes(value);
    case 'regexp':
      try {
        return new RegExp(entry.value, 'i').test(domain);
      } catch {
        return false;
      }
  }
}

export async function queryGeodataCdn(query: GeodataQuery): Promise<GeodataQueryResponse> {
  const categories = await loadGeodata();
  // No default cap: the data is local, and the results view pages long lists
  // instead of truncating them. An explicit limit still applies.
  const limit = query.limit ?? Number.POSITIVE_INFINITY;
  if (query.action === 'show') {
    const code = (query.code ?? '').toLowerCase();
    const category = categories.find(item => item.code === code);
    if (!category) throw new LocalError('dns.geodataUnknownCategory', query.code ?? '');
    const all = query.attr ? category.entries.filter(entry => entry.attrs.includes(query.attr!.toLowerCase())) : category.entries;
    const total = all.length;
    return {action: 'show', code, total, truncated: total > limit, entries: all.slice(0, limit)};
  }
  const domain = (query.value ?? '').trim().toLowerCase();
  const matches: (GeodataQueryEntry & {code: string})[] = [];
  let total = 0;
  for (const category of categories) {
    for (const entry of category.entries) {
      if (!matchesDomain(entry, domain)) continue;
      total += 1;
      if (matches.length < limit) matches.push({type: entry.type, value: entry.value, attrs: entry.attrs, code: category.code});
    }
  }
  return {action: 'find', value: query.value, total, truncated: total > matches.length, matches};
}
