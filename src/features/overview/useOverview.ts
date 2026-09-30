import {useEffect, useMemo, useState} from 'react';
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useVersion} from '../../store';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName} from '../../ui/ui';
import {usePalette} from '../../ui/charts';
import {overviewExport, overviewView} from './view';
import {useLifecycle} from '../shared/useLifecycle';
import {offered} from '../../api/capabilities';
import {backendLimits} from '../shared/limits';

// Cards that `?card=` scrolls to, by their heading ids.
export const cardHeadings = {limits: 'overview-limits', datapath: 'overview-datapath'};

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
  const [asking, setAsking] = useState(false);
  const data = useMemo(
    () => ({capabilities: capabilities.data, runtime: runtime.data, version: version.data, memory: memory.data, datapath: datapath.data}),
    [capabilities.data, runtime.data, version.data, memory.data, datapath.data]
  );
  const limits = useMemo(() => (capabilities.data ? backendLimits(capabilities.data, version.data, t, lang) : []), [capabilities.data, version.data, t, lang]);
  // The cards appear once their data arrives, so the scroll waits for them.
  const hasLimits = limits.length > 0;
  const hasDatapath = !!datapath.data;
  useEffect(() => {
    const card = new URLSearchParams(query).get('card');
    if ((card === 'limits' && hasLimits) || (card === 'datapath' && hasDatapath)) document.getElementById(cardHeadings[card])?.scrollIntoView({block: 'start'});
  }, [query, hasLimits, hasDatapath]);
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
    // Reload asks first, as the top bar's does; suspend and resume run at once.
    actions: lifecycle.actions.map(action => (action.id === 'reload' ? {...action, onAction: () => setAsking(true)} : action)),
    confirmReload: {
      isOpen: asking,
      isPending: lifecycle.busy === 'reload',
      onCancel: () => setAsking(false),
      onConfirm: () => {
        setAsking(false);
        lifecycle.run('reload');
      }
    },
    export: () => downloadFile(exportName('doona-state', 'json'), overviewExport(data, new Date().toISOString()), 'application/json')
  };
}
