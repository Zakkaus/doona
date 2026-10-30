import type {Capabilities, GeoData} from '../../api/model';
import type {Lang, Translator} from '../../i18n';
import {toast, toastFailure} from '../../ui/ui';
import {scanConfig} from '../../dae/text';
import {docsHref} from './docs';
import type {LimitLink} from './limitHint';

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

// Update stages a retry does not get past: the file is too large or invalid, or it could not be put in place.
const lastingStages = new Set(['asset_too_large', 'asset_validation_failed', 'geodata_update_failed', 'replacement_failed', 'directory_sync_failed']);
export const lastingGeodataFailure = (stage: unknown) => lastingStages.has(stage as string);

// The docs a failed geodata request leads to: the requirements of `action` when the backend refused it or lacks it, and
// for an update that failed at a lasting stage, what to check at each stage. The requirements links read as the
// overview's for the same features, without loading its tables on the pages that repair geodata.
export function geodataDocs(error: unknown, action: 'geodata' | 'geodata_settings', t: Translator, lang: Lang): LimitLink | null {
  const {code, details} = (error ?? {}) as {code?: unknown; details?: {stage?: unknown} | null};
  if (code === 'permission_denied' || code === 'capability_not_supported') {
    const update = action === 'geodata';
    const feature = t(update ? 'settings.geodata' : 'ov.lim.geodataSettings');
    return {href: docsHref(lang, update ? 'req-geodata-update' : 'req-geodata-settings'), text: t('ov.lim.docsFor', {feature}), external: true};
  }
  if (action === 'geodata' && (lastingGeodataFailure(code) || lastingGeodataFailure(details?.stage)))
    return {href: docsHref(lang, 'geodata-update'), text: t('ov.lim.docsGeodataUpdate'), external: true};
  return null;
}
// A docs link as a toast's action, opening the docs in a new tab.
export const docsAction = (link: LimitLink | null) =>
  link ? {label: link.text, onAction: () => void window.open(link.href, '_blank', 'noopener')} : undefined;

// A geodata update with its outcome as a toast, the same from the Settings card and from a configuration refused for a
// missing file. Resolves true once the new files are in; false when it failed or another update was already running.
export const announceGeodataUpdate = (update: Promise<unknown>, t: Translator, lang: Lang) =>
  update.then(
    result => {
      if (result) toast('positive', t('settings.geodataUpdated'));
      return !!result;
    },
    (error: unknown) => {
      toastFailure(error, t, t('settings.geodataFailed'), docsAction(geodataDocs(error, 'geodata', t, lang)));
      return false;
    }
  );
