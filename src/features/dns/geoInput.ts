import type {Key} from '../../i18n';
import {ipLiteral} from '../../api/selectors';

export type GeoQuery = {action: 'show'; code: string} | {action: 'find'; value: string};
export type GeoInput = {ok: true; query: GeoQuery} | {ok: false; error: Key};

// The smart input behind the DNS page's geosite query type: `geosite:<code>`
// lists one category, anything else is a domain reverse-lookup. The query is
// answered from the browser-side dat, so geoip prefixes and bare IP literals
// are refused up front instead of downloading.
export function geoInput(raw: string): GeoInput {
  const input = raw.trim();
  if (!input) return {ok: false, error: 'dns.geodataEmpty'};
  const prefixed = input.match(/^([a-zA-Z][a-zA-Z0-9_-]*):([\s\S]*)$/);
  if (prefixed) {
    const name = prefixed[1].toLowerCase();
    if (name === 'geosite') {
      const code = prefixed[2].trim();
      return code ? {ok: true, query: {action: 'show', code}} : {ok: false, error: 'dns.geodataEmpty'};
    }
    return {ok: false, error: name === 'geoip' ? 'dns.geodataGeoipUnsupported' : 'dns.geodataBadPrefix'};
  }
  // A bare IP literal is a geoip question, which the backend never answers; a
  // leftover colon is not a domain either.
  if (ipLiteral(input) || input.includes(':')) return {ok: false, error: ipLiteral(input) ? 'dns.geodataGeoipUnsupported' : 'dns.geodataBadPrefix'};
  if (/\s/.test(input)) return {ok: false, error: 'dns.geodataBadPrefix'};
  return {ok: true, query: {action: 'find', value: input.toLowerCase().replace(/\.$/, '')}};
}
