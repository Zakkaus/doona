import type {Capabilities, GeoData} from '../../api/model';
import type {Translator} from '../../i18n';
import {toast, toastFailure} from '../../ui/ui';
import {scanConfig} from '../../dae/text';

export type GeoKind = 'geosite' | 'geoip';

// The geodata kinds a configuration text uses: a function argument that starts with geosite: or geoip:, as in
// `domain(geosite:cn)`, never words inside quotes or comments.
export function geodataKinds(text: string): GeoKind[] {
  const {tokens} = scanConfig(text);
  const word = (i: number) => (tokens[i] ? text.slice(tokens[i].from, tokens[i].to) : '');
  const used = new Set(
    tokens.flatMap((token, i) => (token.kind === 'text' && token.parens > 0 && word(i + 1) === ':' && ['(', ','].includes(word(i - 1)) ? [word(i)] : []))
  );
  return (['geosite', 'geoip'] as const).filter(kind => used.has(kind));
}

// For a write refused for a missing offline file, given the geodata kinds it needs (null while unknown): the geodata
// files to name, and whether a geodata update repairs it. honk updates only the files it has loaded and lists only
// those, so a kind it has not loaded is missing and no update installs it. A loaded file reported empty is missing
// too. With the needs unknown, only an empty loaded file is named and no update is offered.
export function geodataNeed(needed: GeoKind[] | null, geodata: Capabilities['resources']['geodata'] | undefined, read: GeoData | undefined) {
  const loaded = geodata?.available ? (geodata.assets ?? []) : null;
  const empty = (kind: string) => read?.assets.some(asset => asset.kind === kind && asset.size_bytes === '0') ?? false;
  const missing = needed && loaded ? needed.filter(kind => !loaded.includes(kind) || empty(kind)) : (loaded ?? []).filter(empty);
  const repair = !!geodata?.can_update && !!needed?.length && !!loaded && needed.every(kind => loaded.includes(kind));
  return {missing: missing.map(kind => `${kind}.dat`), repair};
}

// A geodata update with its outcome as a toast, the same from the Settings card and from a configuration refused for a
// missing file. Resolves true once the new files are in; false when it failed or another update was already running.
export const announceGeodataUpdate = (update: Promise<unknown>, t: Translator) =>
  update.then(
    result => {
      if (result) toast('positive', t('settings.geodataUpdated'));
      return !!result;
    },
    (error: unknown) => {
      toastFailure(error, t, t('settings.geodataFailed'));
      return false;
    }
  );
