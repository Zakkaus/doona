import {useCallback, useMemo, useState} from 'react';
import {useCapabilities, useLogFeed, useVersion} from '../../store';
import type {LogLevel} from '../../api/model';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, useDebounced} from '../../ui/ui';
import {logLevel, logsExport, logView} from './view';

// One array while no levels are advertised, so the heatmap's memo holds between renders.
const noLevels: LogLevel[] = [];

export function useLogs() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const version = useVersion();
  const [requestedLevel, setRequestedLevel] = useState<LogLevel>('info');
  const setLevel = useCallback((value: string) => setRequestedLevel(value as LogLevel), []);
  const [target, setTarget] = useState('');
  const [paused, setPaused] = useState(false);
  const targetFilter = useDebounced(target.trim(), 300);
  const resource = capabilities.data?.resources.logs;
  const level = logLevel(requestedLevel, resource?.levels);
  const feed = useLogFeed({level, target: targetFilter, paused});
  const view = useMemo(
    () => logView(feed.records, resource?.levels ?? [], feed.connected, version.data?.engine.name, locale, t, !!feed.error),
    [feed.records, feed.connected, feed.error, resource, version.data, locale, t]
  );
  return {
    ...view,
    // The records the list shows, and the levels the backend offers, for the activity heatmap.
    records: feed.records,
    offered: resource?.levels ?? noLevels,
    level: level ?? '',
    setLevel,
    target,
    setTarget,
    paused,
    setPaused,
    unavailable: resource?.available === false,
    error: capabilities.error ?? feed.error,
    loading: !capabilities.error && !feed.error && !feed.connected && !feed.records.length,
    clear: feed.clear,
    // A failed capabilities read is what blocks the page; otherwise the stream itself is reopened.
    retry: capabilities.error ? capabilities.refetch : feed.retry,
    export: () => downloadFile(exportName(view.exportBase, 'txt'), logsExport(feed.records), 'text/plain;charset=utf-8')
  };
}
