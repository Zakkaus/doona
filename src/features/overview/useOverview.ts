import {useMemo, useState} from 'react';
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useRuntimeSettings, useVersion} from '../../store';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName} from '../../ui/ui';
import {useLanding} from '../../ui/landing';
import {overviewExport, overviewView} from './view';
import {useLifecycle} from '../shared/useLifecycle';
import {offered} from '../../api/capabilities';
import {backendLimits} from '../shared/limits';

// Cards that `?card=` scrolls to, by their heading ids.
export const cardHeadings = {status: 'overview-status', limits: 'overview-limits', datapath: 'overview-datapath'};

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
  const settings = useRuntimeSettings(offered(resources, 'runtime_settings', {whileLoading: false}));
  const lifecycle = useLifecycle(runtime.data, capabilities.data, runtime.refetch);
  const [asking, setAsking] = useState<'reload' | 'suspend' | null>(null);
  const data = useMemo(
    () => ({capabilities: capabilities.data, runtime: runtime.data, version: version.data, memory: memory.data, datapath: datapath.data}),
    [capabilities.data, runtime.data, version.data, memory.data, datapath.data]
  );
  const limits = useMemo(
    () => (capabilities.data ? backendLimits(capabilities.data, version.data, t, lang, settings.data?.recording) : []),
    [capabilities.data, version.data, t, lang, settings.data?.recording]
  );
  const view = useMemo(
    () =>
      overviewView(
        {...data, limits},
        {capabilities: capabilities.loading, runtime: runtime.loading, version: version.loading, memory: memory.loading, datapath: datapath.loading},
        locale,
        t,
        lang
      ),
    [data, limits, capabilities.loading, runtime.loading, version.loading, memory.loading, datapath.loading, locale, t, lang]
  );
  // The cards, and the status row once the runtime is read, appear when their data arrives, so the landing waits for
  // them and follows a block that replaces its placeholder.
  const card = new URLSearchParams(query).get('card');
  const headingId = card ? (cardHeadings as Record<string, string | undefined>)[card] : undefined;
  useLanding(headingId, () => {
    const heading = headingId ? document.getElementById(headingId) : null;
    const target = heading?.closest('section') ?? heading;
    return target && {target};
  });
  return {
    ...view,
    errors: {capabilities: capabilities.error, runtime: runtime.error, version: version.error, memory: memory.error, datapath: datapath.error},
    retry: {
      capabilities: capabilities.refetch,
      runtime: runtime.refetch,
      version: version.refetch,
      memory: memory.refetch,
      datapath: datapath.refetch
    },
    // Reload and suspend ask first; resume runs immediately.
    actions: lifecycle.actions.map(action =>
      action.id === 'reload' || action.id === 'suspend' ? {...action, onAction: () => setAsking(action.id as 'reload' | 'suspend')} : action
    ),
    confirmReload: {
      isOpen: asking === 'reload',
      isPending: lifecycle.busy === 'reload',
      onCancel: () => setAsking(null),
      onConfirm: () => {
        setAsking(null);
        lifecycle.run('reload');
      }
    },
    confirmSuspend: {
      isOpen: asking === 'suspend',
      isDisabled: !!lifecycle.busy,
      onCancel: () => setAsking(null),
      onConfirm: () => {
        setAsking(null);
        lifecycle.run('suspend');
      }
    },
    export: () => downloadFile(exportName('doona-state', 'json'), overviewExport(data, new Date().toISOString()), 'application/json')
  };
}
