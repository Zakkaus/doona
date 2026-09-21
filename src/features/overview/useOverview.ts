import {useMemo} from 'react';
import {useCapabilities, useDatapath, useRuntime, useRuntimeMemory, useRuntimeOperations, useVersion} from '../../api/store';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, errorText, exportName, toast} from '../../ui/ui';
import {lifecycleActions, operationLabels, overviewExport, overviewView} from './view';

export function useOverview() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(!!resources?.runtime.available);
  const datapath = useDatapath(!!resources?.datapath.available);
  const memory = useRuntimeMemory(!!resources?.runtime_memory.available);
  const version = useVersion();
  const operations = useRuntimeOperations(runtime.data, capabilities.data, runtime.refetch);
  const run = async (kind: keyof typeof operationLabels) => {
    try {
      const result = await operations.run(kind);
      if (result) toast('positive', t('ov.operationResult', {action: t(operationLabels[kind]), status: t('ov.succeeded'), id: result.operation_id}));
    } catch (error) {
      toast('negative', t('ov.operationError', {error: errorText(error)}));
    }
  };
  const data = useMemo(
    () => ({capabilities: capabilities.data, runtime: runtime.data, version: version.data, memory: memory.data, datapath: datapath.data}),
    [capabilities.data, runtime.data, version.data, memory.data, datapath.data]
  );
  const view = useMemo(
    () =>
      overviewView(
        data,
        {capabilities: capabilities.loading, runtime: runtime.loading, version: version.loading, memory: memory.loading, datapath: datapath.loading},
        locale,
        t
      ),
    [data, capabilities.loading, runtime.loading, version.loading, memory.loading, datapath.loading, locale, t]
  );
  return {
    ...view,
    errors: {capabilities: capabilities.error, runtime: runtime.error, version: version.error, memory: memory.error, datapath: datapath.error},
    retry: runtime.refetch,
    actions: lifecycleActions(operations.canRun, operations.busy, kind => void run(kind), t),
    export: () => downloadFile(exportName('doona-state', 'json'), overviewExport(data, new Date().toISOString()), 'application/json')
  };
}
