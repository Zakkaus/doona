import {useEffect, useMemo} from 'react';
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useVersion} from '../../store';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName} from '../../ui/ui';
import {usePalette} from '../../ui/charts';
import {overviewExport, overviewView} from './view';
import {useLifecycle} from '../shared/useLifecycle';
import {offered} from '../../api/capabilities';
import {backendLimits} from '../shared/limits';

// The heading of the card that lists the features that are off; `?card=limits` scrolls to it.
export const limitsHeadingId = 'overview-limits';

export function useOverview(query = '') {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(offered(resources, 'runtime', {whileLoading: false}));
  const datapath = useDatapath(offered(resources, 'datapath', {whileLoading: false}));
  const memory = useRuntimeMemory(offered(resources, 'runtime_memory', {whileLoading: false}));
  const version = useVersion();
  const lifecycle = useLifecycle(runtime.data, capabilities.data, runtime.refetch);
  const data = useMemo(
    () => ({capabilities: capabilities.data, runtime: runtime.data, version: version.data, memory: memory.data, datapath: datapath.data}),
    [capabilities.data, runtime.data, version.data, memory.data, datapath.data]
  );
  const limits = useMemo(() => (capabilities.data ? backendLimits(capabilities.data, version.data, t, lang) : []), [capabilities.data, version.data, t, lang]);
  const hasLimits = limits.length > 0;
  useEffect(() => {
    if (hasLimits && new URLSearchParams(query).get('card') === 'limits') document.getElementById(limitsHeadingId)?.scrollIntoView({block: 'start'});
  }, [query, hasLimits]);
  const view = useMemo(
    () =>
      overviewView(
        {...data, limits},
        {capabilities: capabilities.loading, runtime: runtime.loading, version: version.loading, memory: memory.loading, datapath: datapath.loading},
        locale,
        t
      ),
    [data, limits, capabilities.loading, runtime.loading, version.loading, memory.loading, datapath.loading, locale, t]
  );
  const palette = usePalette();
  const tones = {err: palette.love, warn: palette.gold, ok: palette.cat[0]};
  const memoryView = {...view.memory, bar: view.memory.bar ? {...view.memory.bar, color: tones[view.memory.bar.tone]} : null};
  return {
    ...view,
    memory: memoryView,
    errors: {capabilities: capabilities.error, runtime: runtime.error, version: version.error, memory: memory.error, datapath: datapath.error},
    retry: {
      capabilities: capabilities.refetch,
      runtime: runtime.refetch,
      version: version.refetch,
      memory: memory.refetch,
      datapath: datapath.refetch
    },
    actions: lifecycle.actions,
    export: () => downloadFile(exportName('doona-state', 'json'), overviewExport(data, new Date().toISOString()), 'application/json')
  };
}
