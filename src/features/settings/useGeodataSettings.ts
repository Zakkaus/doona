import {useRef, useState} from 'react';
import type {GeoDataSettingsPatch} from '../../api/model';
import {useCapabilities, useGeodata, useGroups, useRuntimeSettings} from '../../store';
import {useNow} from '../../ui/clock';
import {LOCALE, formatList, formatNumber, useLang, useT} from '../../i18n';
import {toast} from '../../ui/ui';
import {errorText} from '../../api/error';
import {geodataPresets, type GeodataPreset, type GeodataPresetId} from '../../dae/geodata';
import {geodataConfigurable} from './nav';
import {
  assetDetails,
  cleanUrls,
  customFields,
  customInvalid,
  geodataKinds,
  hostOf,
  intervalChoices,
  lackingCodes,
  matchPreset,
  presetLabels,
  presetNote,
  statusLine,
  urlProblem,
  type GeodataUrls
} from './geodata';

type Patch = Exclude<GeoDataSettingsPatch, null>;
type Route = 'routing' | 'direct' | 'group';

// Every control saves as it changes. Where the backend updates on request, a source change then downloads at once, so
// the files follow what is shown.
export function useGeodataSettings() {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const now = useNow();
  const caps = useCapabilities();
  const available = geodataConfigurable(caps.data?.resources);
  const settings = useRuntimeSettings(available);
  const geodata = useGeodata(available);
  const groups = useGroups(available);
  const stored = settings.data?.geodata;
  // The patch being saved shows in the controls until the settings come back, and is dropped on failure.
  const [pending, setPending] = useState<Patch | null>(null);
  const [custom, setCustom] = useState<GeodataUrls | null>(null);
  const [routeChoice, setRouteChoice] = useState<Route | null>(null);
  // A preset lacking categories the rules use, waiting for confirmation; the shown source stays as it was.
  const [lacking, setLacking] = useState<{preset: GeodataPreset; codes: string} | null>(null);
  const busy = settings.busy || geodata.busy;
  const canUpdate = !!caps.data?.resources.geodata.can_update;

  const update = () =>
    geodata.update().then(
      result => {
        if (result) toast('positive', t('settings.geodataUpdated'));
      },
      (error: unknown) => toast('negative', t('settings.geodataFailed', {error: errorText(error, t)}))
    );
  // Resolves true once stored; a URL change then starts the update and leaves its outcome to the status row.
  // One save at a time: a second press while one is in flight, or while an update runs, does nothing.
  const inflight = useRef(false);
  const save = (patch: Patch) => {
    if (inflight.current || busy) return Promise.resolve(false);
    inflight.current = true;
    setPending(patch);
    return settings.save({geodata: patch}).then(
      result => {
        inflight.current = false;
        setPending(null);
        if (result === undefined) return false;
        geodata.refetch();
        if (patch.geosite && canUpdate) void update();
        else toast('positive', t(patch.geosite ? 'settings.geodataSaved' : patch.download ? 'settings.geodataRouteSaved' : 'settings.geodataAutoSaved'));
        return true;
      },
      (error: unknown) => {
        inflight.current = false;
        setPending(null);
        toast('negative', t('settings.geodataSaveFailed', {error: errorText(error, t)}));
        return false;
      }
    );
  };

  const urls: GeodataUrls | null =
    pending?.geosite && pending.geoip
      ? {geosite: pending.geosite.urls, geoip: pending.geoip.urls}
      : stored
        ? {geosite: stored.geosite.urls, geoip: stored.geoip.urls}
        : null;
  const preset = urls ? matchPreset(urls) : null;
  const auto = {...stored?.auto_update, ...pending?.auto_update};
  const download = stored?.download && (pending?.download ?? stored.download);
  // Downloads follow the routing rules unless a route is stored.
  const route = routeChoice ?? download?.route ?? 'routing';
  const note = (id: GeodataPresetId) =>
    presetNote(
      geodataPresets.find(item => item.id === id)!,
      geodata.data?.required_codes,
      locale,
      t
    );
  const savePreset = (chosen: GeodataPreset) => void save({geosite: {urls: [...chosen.urls.geosite]}, geoip: {urls: [...chosen.urls.geoip]}});
  const saveLabel = t(canUpdate ? 'settings.geodataSaveUpdate' : 'settings.geodataSaveSources');
  const status = statusLine(geodata.data, geodata.busy || (canUpdate && !!pending?.geosite), now, locale, t);

  return {
    available,
    loading: settings.loading && !stored,
    error: settings.error,
    retry: settings.refetch,
    ready: !!stored,
    busy,
    seededFromConfig: stored?.source === 'config',
    note: t(canUpdate ? 'settings.geodataSourcesNote' : 'settings.geodataSourcesNoteStored'),
    source: {
      value: urls ? (preset?.id ?? 'custom') : '',
      items: [
        ...geodataPresets.map(item => ({id: item.id, label: t(presetLabels[item.id]), desc: note(item.id).text})),
        {id: 'custom', label: t('settings.geodataCustom')}
      ],
      note: preset ? note(preset.id) : null,
      // Custom opens the URL dialog from the current lists; nothing is stored until it is saved.
      change: (id: string) => {
        if (id === 'custom') setCustom(urls ? {geosite: [...urls.geosite], geoip: [...urls.geoip]} : null);
        else if (id !== preset?.id) {
          const chosen = geodataPresets.find(item => item.id === id)!;
          const codes = lackingCodes(chosen, geodata.data?.required_codes, t);
          if (codes) setLacking({preset: chosen, codes});
          else savePreset(chosen);
        }
      }
    },
    lacking: lacking && {
      title: t('settings.geodataLackingTitle', {preset: t(presetLabels[lacking.preset.id])}),
      text: t('settings.geodataLackingHelp', {preset: t(presetLabels[lacking.preset.id]), codes: lacking.codes}),
      confirm: saveLabel,
      cancel: () => setLacking(null),
      save: () => {
        setLacking(null);
        savePreset(lacking.preset);
      }
    },
    customHosts: urls && !preset ? formatList(lang, [...new Set([...urls.geosite, ...urls.geoip].map(hostOf))]) : null,
    editCustom: () => urls && setCustom({geosite: [...urls.geosite], geoip: [...urls.geoip]}),
    dialog: custom
      ? {
          lists: geodataKinds.map(kind => ({
            kind,
            fields: customFields(custom[kind]).map((value, index, list) => {
              const problem = urlProblem(value, list);
              // The order is the fallback order, so a stored URL can trade places with its neighbour.
              const swap = (to: number) =>
                to >= 0 && to < custom[kind].length && index < custom[kind].length
                  ? () => {
                      if (settings.busy) return;
                      const values = [...custom[kind]];
                      [values[index], values[to]] = [values[to], values[index]];
                      setCustom({...custom, [kind]: values});
                    }
                  : undefined;
              const label = t('settings.geodataUrlLabel', {kind, n: formatNumber(index + 1, locale)});
              return {
                up: swap(index - 1),
                down: swap(index + 1),
                upLabel: t('settings.geodataMoveUp', {url: label}),
                downLabel: t('settings.geodataMoveDown', {url: label}),
                id: `${kind}-${index}`,
                label,
                value,
                error: problem ? t(problem) : undefined,
                change: (next: string) => {
                  // The save in flight holds the URLs as they were and closes the dialog, which would drop this edit.
                  if (settings.busy) return;
                  const values = [...list];
                  values[index] = next;
                  // Blank fields past the last URL are dropped, so the list keeps a single empty slot.
                  while (values.length && !values[values.length - 1].trim()) values.pop();
                  setCustom({...custom, [kind]: values});
                }
              };
            }),
            empty: !custom[kind].some(url => url.trim())
          })),
          blocked: customInvalid(custom),
          confirm: saveLabel,
          pending: settings.busy,
          cancel: () => setCustom(null),
          save: () => {
            const lists = cleanUrls(custom);
            void save({geosite: {urls: lists.geosite}, geoip: {urls: lists.geoip}}).then(saved => saved && setCustom(null));
          }
        }
      : null,
    // A backend that predates the download route reports none and refuses a patch that sets one.
    route: download && {
      value: route,
      items: (['routing', 'direct', 'group'] as const).map(id => ({
        id,
        label: t(id === 'routing' ? 'settings.geodataRouteRouting' : id === 'direct' ? 'settings.geodataRouteDirect' : 'settings.geodataRouteGroup')
      })),
      // A group route needs its group, so choosing it only reveals the group select.
      change: (id: string) => {
        if (id === 'group') return setRouteChoice('group');
        setRouteChoice(null);
        if (id !== download?.route) void save({download: {route: id as Route}});
      },
      group: route === 'group' ? (download?.route === 'group' ? (download.group_id ?? '') : '') : null,
      groups: (groups.data ?? []).map(group => ({id: group.id, label: group.name})),
      pickGroup: (id: string) => {
        if (id === (download?.route === 'group' ? download.group_id : null)) return;
        void save({download: {route: 'group', group_id: id}}).then(saved => saved && setRouteChoice(null));
      }
    },
    auto: {
      enabled: !!auto.enabled,
      toggle: (enabled: boolean) => void save({auto_update: {enabled}}),
      interval: String(auto.interval_hours ?? ''),
      intervals: auto.interval_hours ? intervalChoices(auto.interval_hours, locale) : [],
      pick: (hours: string) => {
        if (Number(hours) !== stored?.auto_update.interval_hours) void save({auto_update: {interval_hours: Number(hours)}});
      }
    },
    status: {...status, details: assetDetails(geodata.data, groups.data, locale, t)},
    statusError: geodata.error,
    retryStatus: geodata.refetch,
    canUpdate,
    updating: geodata.busy,
    updateBlocked: busy || !geodata.data,
    update: () => void update()
  };
}
