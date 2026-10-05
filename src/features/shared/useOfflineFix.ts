import type {ConfigDiagnostic} from '../../api/model';
import {useCapabilities, useGeodata} from '../../store';
import {formatList, useLang, useT} from '../../i18n';
import {docsHref} from './docs';
import {offlineDependencyCode} from './offlineDependency';
import {announceGeodataUpdate, geodataNeed, type GeoKind} from './geodataUpdate';

export type OfflineFix = {kind: 'download'; busy: boolean; run: () => Promise<boolean>} | {kind: 'docs'; href: string};

// For diagnostics that name a missing offline dependency, given the geodata kinds the write needs (null while
// unknown): the geodata files to name in their words, and the way out. A geodata update repairs a file honk has
// loaded; a file it never loaded has to be installed on the device, which the docs explain. A write needing no
// geodata lacks some other file, so there is no geodata action.
export function useOfflineFix(diagnostics: ConfigDiagnostic[] | null | undefined, needed: GeoKind[] | null) {
  const t = useT();
  const lang = useLang();
  const geodata = useCapabilities().data?.resources.geodata;
  const active = !!diagnostics?.some(item => offlineDependencyCode(item.code));
  const read = useGeodata(active && !!geodata?.available);
  if (!active) return {missingFiles: undefined, fix: null};
  const {missing, repair} = geodataNeed(needed, geodata, read.data);
  const fix: OfflineFix | null = repair
    ? {kind: 'download', busy: read.busy, run: () => announceGeodataUpdate(read.update(), t)}
    : needed?.length === 0
      ? null
      : {kind: 'docs', href: docsHref(lang, 'offline-dependency')};
  return {missingFiles: missing.length ? formatList(lang, missing) : undefined, fix};
}
