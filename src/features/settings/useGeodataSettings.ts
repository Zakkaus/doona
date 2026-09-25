import {useState} from 'react';
import {useCapabilities, useGeodata, useRuntimeSettings} from '../../store';
import {LOCALE, formatList, formatNumber, useLang, useT} from '../../i18n';
import {formatBytes} from '../../i18n/format';
import {toast} from '../../ui/ui';
import {errorText} from '../../api/error';
import {useDraftGuard} from '../../shell/draft';
import {geodataIntervalRange, geodataPresets} from '../../dae/geodata';
import {
  customFields,
  draftInvalid,
  draftUrls,
  geodataConfigurable,
  geodataDraft,
  geodataKinds,
  geodataPatch,
  geodataSourceLabels,
  geodataStatus,
  intervalInvalid,
  matchPreset,
  missingCategories,
  presetLabels,
  sourceName,
  urlProblem,
  type GeodataChoice,
  type GeodataDraft
} from './geodata';
import {geodataRows} from './view';

export function useGeodataSettings() {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const caps = useCapabilities();
  const available = geodataConfigurable(caps.data?.resources);
  const settings = useRuntimeSettings(available);
  const geodata = useGeodata(available);
  const baseline = settings.data?.geodata;
  const stamp = baseline ? JSON.stringify(baseline) : '';
  const [draft, setDraft] = useState<{at: string; value: GeodataDraft} | null>(null);
  const edits = draft?.value ?? (baseline ? geodataDraft(baseline) : null);
  const patch = baseline && edits ? geodataPatch(baseline, edits) : null;
  const dirty = !!draft && !!baseline && JSON.stringify(draft.value) !== JSON.stringify(geodataDraft(baseline));
  const guard = useDraftGuard(dirty, () => setDraft(null));
  const edit = (next: Partial<GeodataDraft>) => {
    if (edits && !settings.busy) setDraft({at: draft?.at ?? stamp, value: {...edits, ...next}});
  };
  const urls = edits ? draftUrls(edits) : {geosite: [], geoip: []};
  const preset = matchPreset(urls);
  const missing = missingCategories(preset, geodata.data?.required_codes);
  const stored = baseline ? {geosite: baseline.geosite.urls, geoip: baseline.geoip.urls} : null;
  const apply = () => {
    if (!patch || settings.busy) return;
    const submitted = draft;
    void settings.save({geodata: patch}).then(
      result => {
        if (result === undefined) return;
        setDraft(current => (current === submitted ? null : current));
        // The next check moves with the schedule, and GET /geodata is not polled.
        geodata.refetch();
        toast('positive', t(patch.geosite ? 'settings.geodataSaved' : 'settings.geodataAutoSaved'));
      },
      (error: unknown) => toast('negative', t('settings.geodataSaveFailed', {error: errorText(error, t)}))
    );
  };
  return {
    available,
    loading: settings.loading && !baseline,
    error: settings.error,
    retry: settings.refetch,
    hasBaseline: !!edits,
    busy: settings.busy,
    source: baseline ? t(geodataSourceLabels[baseline.source]) : null,
    sourceTone: baseline?.source === 'db' ? ('info' as const) : ('neutral' as const),
    seededFromConfig: baseline?.source === 'config',
    current: stored ? sourceName(stored, t) : '—',
    choice: edits?.choice ?? 'custom',
    choices: [...geodataPresets.map(item => ({id: item.id, label: t(presetLabels[item.id])})), {id: 'custom', label: t('settings.geodataCustom')}],
    setChoice: (value: string) => {
      if (!edits) return;
      const choice = value as GeodataChoice;
      // Custom starts from the URLs chosen so far, so a mirror can be swapped without typing the rest.
      edit(choice === 'custom' ? {choice, custom: draftUrls(edits)} : {choice});
    },
    presetSize: preset
      ? t('settings.geodataPresetSize', {geosite: formatBytes(preset.sizes.geosite, locale), geoip: formatBytes(preset.sizes.geoip, locale)})
      : null,
    custom:
      edits?.choice === 'custom'
        ? geodataKinds.map(kind => ({
            kind,
            fields: customFields(edits.custom[kind]).map((value, index, list) => {
              const problem = urlProblem(value, list);
              return {
                id: `${kind}-${index}`,
                label: t('settings.geodataUrlLabel', {kind, n: formatNumber(index + 1, locale)}),
                value,
                error: problem ? t(problem) : undefined,
                change: (next: string) => {
                  const values = [...list];
                  values[index] = next;
                  // Blank fields past the last URL are dropped, so the list keeps a single empty slot.
                  while (values.length && !values[values.length - 1].trim()) values.pop();
                  edit({custom: {...edits.custom, [kind]: values}});
                }
              };
            }),
            empty: !edits.custom[kind].some(url => url.trim())
          }))
        : [],
    missing: missing
      ? {
          title: t('settings.geodataMissingTitle', {name: preset ? t(presetLabels[preset.id]) : ''}),
          lines: geodataKinds.flatMap(kind => (missing[kind] ? [t('settings.geodataMissingKind', {kind, codes: formatList(lang, missing[kind])})] : []))
        }
      : null,
    enabled: edits?.enabled ?? false,
    setEnabled: (enabled: boolean) => edit({enabled}),
    interval: {
      value: edits?.interval ?? '',
      invalid: edits ? intervalInvalid(edits.interval) : false,
      description: t('settings.range', {min: formatNumber(geodataIntervalRange.min, locale), max: formatNumber(geodataIntervalRange.max, locale)}),
      change: (value: string) => edit({interval: value.trim()})
    },
    conflict: dirty && draft.at !== stamp ? t('settings.geodataDraftConflict') : null,
    dirty,
    blocked: !patch || (!!edits && draftInvalid(edits)),
    apply,
    discard: () => {
      guard.clear();
      setDraft(null);
    },
    status: geodataStatus(geodata.data, baseline?.auto_update.enabled ?? false, locale, t),
    statusError: geodata.error,
    retryStatus: geodata.refetch,
    rows: geodataRows(geodata.data?.assets ?? [], locale),
    rowsLoading: geodata.loading && !geodata.data,
    canUpdate: !!caps.data?.resources.geodata.can_update,
    updating: geodata.busy,
    updateBlocked: geodata.busy || !geodata.data,
    update: () =>
      void geodata.update().then(
        result => {
          if (result) toast('positive', t('settings.geodataUpdated'));
        },
        error => toast('negative', t('settings.geodataFailed', {error: errorText(error, t)}))
      )
  };
}
