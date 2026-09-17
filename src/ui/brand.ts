import {useSyncExternalStore} from 'react';
import catalogue from './brands.json';

// One catalogue entry: an icon under public/brands/<id>.png and the rule terms, hostnames, addresses and group
// policies it stands for. The data lives in brands.json (checked by tools/icons/check.mjs); this module only
// indexes it and answers lookups.
export type Brand = {
  id: string;
  label: string;
  source: string;
  geosite?: string[];
  domain?: string[];
  keyword?: string[];
  address?: string[];
  policy?: string[];
  expression?: string[];
};
const brands = catalogue as Brand[];
type Field = 'geosite' | 'domain' | 'keyword' | 'address' | 'policy' | 'expression';
function index(field: Field): Map<string, Brand> {
  const map = new Map<string, Brand>();
  for (const brand of brands) for (const value of brand[field] ?? []) map.set(value, brand);
  return map;
}
const by = {
  geosite: index('geosite'),
  domain: index('domain'),
  keyword: index('keyword'),
  address: index('address'),
  policy: index('policy'),
  expression: index('expression')
};

// The icons ship with doona; the setting chooses between them, none, or a self-hosted prefix that serves
// <prefix><id>.png. "off" is stored as the word so the default does not come back on reload.
export const builtinPack = 'builtin';
const key = 'doona-icon-pack';
const listeners = new Set<() => void>();
function read(): string {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return builtinPack;
    if (value === 'off') return '';
    return /^https?:\/\//.test(value) ? value : builtinPack;
  } catch {
    return builtinPack;
  }
}
export function setIconPack(value: string) {
  try {
    localStorage.setItem(key, value || 'off');
  } catch {
    // Storage may be unavailable; the choice then lasts for the session only.
  }
  for (const listener of listeners) listener();
}
export function useIconPack(): string {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => builtinPack
  );
}
export function iconUrl(pack: string, brand: Brand): string {
  const base = pack === builtinPack ? import.meta.env.BASE_URL + 'brands/' : pack.endsWith('/') ? pack : pack + '/';
  return base + brand.id + '.png';
}

// A socket address in any of the list formats: host, host:port, [v6]:port.
function hostOf(text: string): string {
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(text);
  if (bracket) return bracket[1].toLowerCase();
  const parts = text.split(':');
  return (parts.length === 2 ? parts[0] : text).toLowerCase();
}
// Longest claimed suffix on label boundaries: "www.reddit.com" hits "reddit.com".
function forDomain(host: string): Brand | null {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const hit = by.domain.get(labels.slice(i).join('.'));
    if (hit) return hit;
  }
  return null;
}
// A keyword rule names a substring; take the catalogue keyword, else the brand whose domain label it is.
function forKeyword(term: string): Brand | null {
  const direct = by.keyword.get(term);
  if (direct) return direct;
  for (const [domain, brand] of by.domain) if (domain.split('.')[0] === term) return brand;
  return null;
}
const first = <T>(items: T[], pick: (item: T) => Brand | null | undefined) => items.map(pick).find(Boolean) ?? null;

// The brand a rule expression, hostname or address stands for; null when the catalogue has nothing for it.
export function brandFor(text: string | null | undefined): Brand | null {
  if (!text) return null;
  const rule = /^domain\((geosite|suffix|full|keyword|regex):\s*([^)]*)\)/.exec(text);
  if (rule) {
    const terms = rule[2].split(',').map(term => term.trim().toLowerCase());
    if (rule[1] === 'geosite') return first(terms, term => by.geosite.get(term));
    if (rule[1] === 'keyword') return first(terms, forKeyword);
    if (rule[1] === 'regex') return null;
    return first(terms, forDomain);
  }
  const geoip = /^dip\(geoip:\s*([^)]+)\)/.exec(text);
  if (geoip) return by.geosite.get(geoip[1].trim().toLowerCase()) ?? null;
  // Rule forms without a match term, such as the "fallback: <outbound>" catch-all.
  const bare = /^([a-z_]+):\s/.exec(text);
  if (bare) return by.expression.get(bare[1]) ?? null;
  const host = hostOf(text.trim());
  const address = by.address.get(host);
  if (address) return address;
  if (/^[a-z0-9.-]+$/i.test(host) && /[a-z]/i.test(host) && host.includes('.')) return forDomain(host);
  return null;
}
// The generic icon for a policy group, by how it picks members (selector, urltest, fallback, …).
export function brandForPolicy(kind: string | null | undefined): Brand | null {
  return (kind && by.policy.get(kind.toLowerCase())) || null;
}
