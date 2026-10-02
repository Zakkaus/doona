import type {Key} from '../../i18n';

// dae's domain rule kinds, which the cache's pattern deletion reads the same way.
export type MatchKind = 'full' | 'suffix' | 'keyword' | 'regex';
export const matchKinds: Array<{id: MatchKind; label: Key}> = [
  {id: 'full', label: 'rule.kind.domain'},
  {id: 'suffix', label: 'rule.kind.domainSuffix'},
  {id: 'keyword', label: 'rule.kind.domainKeyword'},
  {id: 'regex', label: 'dns.matchRegex'}
];
// How many matched entries the delete confirmation lists; the rest is a count.
export const matchListMax = 100;
// Names compare without case and without the root dot the cache lists them with.
const bare = (name: string) => name.trim().toLowerCase().replace(/\.$/, '');
// A leading `*.` is the suffix shorthand, whichever kind was picked.
export function dnsPattern(kind: MatchKind, text: string): {kind: MatchKind; text: string} {
  return text.startsWith('*.') ? {kind: 'suffix', text: text.slice(2)} : {kind, text};
}
// JavaScript regular expression syntax, ignoring case, matched against the name without its trailing dot. The one place
// a regex is compiled, so a translator from another syntax can replace it here.
export function compileDomainRegex(text: string): RegExp | null {
  try {
    return new RegExp(text, 'iu');
  } catch {
    return null;
  }
}
// What decides whether a cached name matches. A field that is empty matches every name, which only a record type
// narrows. null when the pattern is not usable: a regex that does not compile, or a full name or suffix that is only
// dots, which would otherwise match everything.
export function dnsMatcher(kind: MatchKind, text: string): ((domain: string) => boolean) | null {
  if (!text.trim()) return () => true;
  if (kind === 'regex') {
    const regex = compileDomainRegex(text);
    return regex && (domain => regex.test(bare(domain)));
  }
  if (kind === 'keyword') {
    const keyword = text.trim().toLowerCase();
    return domain => bare(domain).includes(keyword);
  }
  const name = bare(text);
  // A leading dot leaves the name itself out: `.example.com` is its subdomains only.
  const subdomains = kind === 'suffix' && name.startsWith('.');
  const pattern = subdomains ? name.slice(1) : name;
  if (!pattern) return null;
  if (kind === 'full') return domain => bare(domain) === pattern;
  return domain => {
    const entry = bare(domain);
    return entry.endsWith('.' + pattern) || (!subdomains && entry === pattern);
  };
}
