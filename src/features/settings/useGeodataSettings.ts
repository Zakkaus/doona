import {useRef, useState} from 'react';
import type {GeoDataSettingsPatch} from '../../api/model';
import {useCapabilities, useGeodata, useGroups, useRuntimeSettings, useVersion} from '../../store';
import {offered} from '../../api/capabilities';
import {useNow} from '../../ui/clock';
import {LOCALE, formatList, formatNumber, useLang, useT} from '../../i18n';
import {toast, toastErrorDetail} from '../../ui/ui';
import {announceGeodataUpdate} from '../shared/geodataUpdate';
import {geodataPresets, type GeodataPreset, type GeodataPresetId} from '../../dae/geodata';
import {geodataConfigurable} from './nav';
import {geodataFromConfig, geodataRows, geodataUpdateReason} from './view';
import {
  assetDetails,
  checkTimes,
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

type Route = 'routing' | 'direct' | 'group';

// Every control saves as it changes. Where the backend updates on request, a source change then downloads at once, so
// the files follow what is shown.
export function useGeodataSettings() {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const now = useNow();
  const caps = useCapabilities();
  const version = useVersion();
  const available = !!caps.data?.resources.geodata.available;
  const configurable = geodataConfigurable(caps.data?.resources);
  const settings = useRuntimeSettings(configurable);
  const geodata = useGeodata(available);
  const groupsOffered = offered(caps.data?.resources, 'groups', {whileLoading: false});
  const groups = useGroups(configurable && groupsOffered);
  const stored = settings.data?.geodata;
  // The patch being saved shows in the controls until the settings come back, and is dropped on failure.
  const [pending, setPending] = useState<GeoDataSettingsPatch>(null);
  const [custom, setCustom] = useState<GeodataUrls | null>(null);
  const [routeChoice, setRouteChoice] = useState<Route | null>(null);
  // A preset lacking categories the rules use, waiting for confirmation; the shown source stays as it was.
  // Removing every override waits for confirmation, since it also drops the values the configuration file named.
  const [resetting, setResetting] = useState(false);
  const [lacking, setLacking] = useState<{preset: GeodataPreset; codes: string} | null>(null);
  const busy = settings.busy || geodata.busy;
  const canUpdate = !!caps.data?.resources.geodata.can_update;
  // How the backend verifies downloads, when file values replace the ones set here, and the patch bounds.
  const geodataCaps = caps.data?.resources.geodata;
  const checksum = geodataCaps?.checksum ?? null;
  const lifecycle = geodataCaps?.lifecycle;

  const update = () => announceGeodataUpdate(geodata.update(), t);
  // Resolves true once stored; a URL change then starts the update and leaves its outcome to the status row.
  // One save at a time: a second press while one is in flight, or while an update runs, does nothing.
  const inflight = useRef(false);
  // A null patch removes every override.
  const save = (patch: GeoDataSettingsPatch) => {
    if (inflight.current || busy) return Promise.resolve(false);
    inflight.current = true;
    setPending(patch);
    return settings.save({geodata: patch}).then(
      result => {
        inflight.current = false;
        setPending(null);
        if (result === undefined) return false;
        geodata.refetch();
        if (patch?.geosite && canUpdate) void update();
        else
          toast(
            'positive',
            t(
              !patch
                ? 'settings.geodataResetDone'
                : patch.geosite
                  ? 'settings.geodataSaved'
                  : patch.download
                    ? 'settings.geodataRouteSaved'
                    : patch.verify_checksum !== undefined
                      ? 'settings.geodataVerifyChecksumSaved'
                      : 'settings.geodataAutoSaved'
            )
          );
        return true;
      },
      (error: unknown) => {
        inflight.current = false;
        setPending(null);
        toast('negative', t('settings.geodataSaveFailed'), toastErrorDetail(error, t));
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
  const verify = stored?.verify_checksum === undefined ? undefined : (pending?.verify_checksum ?? stored.verify_checksum);
  const note = (id: GeodataPresetId) =>
    presetNote(
      geodataPresets.find(item => item.id === id)!,
      geodata.data?.required_codes,
      locale,
      t
    );
  const savePreset = (chosen: GeodataPreset) => void save({geosite: {urls: [...chosen.urls.geosite]}, geoip: {urls: [...chosen.urls.geoip]}});
  const saveLabel = t(canUpdate ? 'settings.geodataSaveUpdate' : 'settings.geodataSaveSources');
  const status = statusLine(geodata.data, geodata.busy || (canUpdate && !!pending?.geosite), now, locale, t, verify === true, checksum);

  // From the capabilities, so the source settings' Skeleton draws the same help line before they arrive.
  const checksumHelp = t(
    checksum === 'sha256sum'
      ? 'settings.geodataVerifyChecksumHelp'
      : checksum === 'pinned'
        ? 'settings.geodataVerifyChecksumPinnedHelp'
        : 'settings.geodataVerifyChecksumNoneHelp'
  );

  return {
    available,
    checksumHelp,
    loading: configurable && settings.loading && !stored,
    error: configurable ? settings.error : null,
    retry: settings.refetch,
    ready: configurable && !!stored,
    geodataLoading: geodata.loading && !geodata.data,
    fromConfig: geodataFromConfig(caps.data, version.data, t, lang),
    rows: geodataRows(geodata.data?.assets ?? [], locale),
    busy,
    // URLs the configuration file names return with its values; overrides that do not persist end at a restart.
    lifecycleNote:
      stored?.source === 'config'
        ? t(lifecycle?.file_values === 'activation' ? 'settings.geodataConfigSeededActivation' : 'settings.geodataConfigSeeded')
        : lifecycle?.overrides_persist === false
          ? t('settings.geodataOverridesUntilRestart')
          : null,
    note: configurable ? t(canUpdate ? 'settings.geodataSourcesNote' : 'settings.geodataSourcesNoteStored') : null,
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
    reset: {
      ask: () => setResetting(true),
      dialog: resetting && {
        title: t('settings.geodataResetTitle'),
        help: t('settings.geodataResetHelp'),
        confirm: t('settings.geodataReset'),
        cancel: () => setResetting(false),
        save: () => {
          setResetting(false);
          setRouteChoice(null);
          void save(null);
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
            fields: customFields(custom[kind], geodataCaps?.max_urls ?? 0).map((value, index, list) => {
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
      // Without the groups resource there is no group to pick; a stored group route still shows as it is.
      items: (['routing', 'direct', 'group'] as const)
        .filter(id => id !== 'group' || groupsOffered || route === 'group')
        .map(id => ({
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
      groupsError: groups.error,
      retryGroups: groups.refetch,
      pickGroup: (id: string) => {
        if (id === (download?.route === 'group' ? download.group_id : null)) return;
        void save({download: {route: 'group', group_id: id}}).then(saved => saved && setRouteChoice(null));
      }
    },
    // A backend that predates the setting reports none and always verifies.
    checksum: verify !== undefined && {
      enabled: verify,
      help: checksumHelp,
      toggle: (enabled: boolean) => void save({verify_checksum: enabled})
    },
    auto: {
      enabled: !!auto.enabled,
      toggle: (enabled: boolean) => void save({auto_update: {enabled}}),
      interval: String(auto.interval_hours ?? ''),
      intervals: auto.interval_hours ? intervalChoices(auto.interval_hours, geodataCaps?.interval_hours, locale) : [],
      pick: (hours: string) => {
        if (Number(hours) !== stored?.auto_update.interval_hours) void save({auto_update: {interval_hours: Number(hours)}});
      }
    },
    status: {...status, details: [...checkTimes(geodata.data, now, locale, t), ...assetDetails(geodata.data, groups.data, locale, t)]},
    statusError: geodata.error,
    retryStatus: geodata.refetch,
    canUpdate,
    updating: geodata.busy,
    updateBlocked: busy || !geodata.data,
    updateReason: geodataUpdateReason({busy, loaded: !!geodata.data, failed: !!geodata.error}, t),
    update: () => void update()
  };
}
