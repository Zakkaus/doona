import {useCallback, useMemo, useState} from 'react';
import {LOG_FEED_LIMIT, useCapabilities, useLogFeed, useRuntimeSettings, useVersion} from '../../store';
import type {LogLevel} from '../../api/model';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, useDebounced} from '../../ui/ui';
import {logEmpty, logLevel, logStatus, logsExport, logView} from './view';
import type {PageProps} from '../../shell/routes';

// One array while no levels are advertised, so the heatmap's memo holds between renders.
const noLevels: LogLevel[] = [];

export function useLogs({go}: Pick<PageProps, 'go'>) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const version = useVersion();
  const [requestedLevel, setRequestedLevel] = useState<LogLevel>('info');
  const setLevel = useCallback((value: string) => setRequestedLevel(value as LogLevel), []);
  const [target, setTarget] = useState('');
  const [paused, setPaused] = useState(false);
  const targetFilter = useDebounced(target.trim());
  const resource = capabilities.data?.resources.logs;
  const level = logLevel(requestedLevel, resource?.levels);
  const feed = useLogFeed({level, target: targetFilter, paused});
  const settings = useRuntimeSettings(capabilities.data?.resources.runtime_settings.available ?? false).data;
  const recorded = settings?.log.level;
  const view = useMemo(
    () => logView(feed.records, resource?.levels ?? [], version.data?.engine.name, locale, t, feed.gaps, recorded),
    [feed.records, feed.gaps, resource, version.data, locale, t, recorded]
  );
  return {
    ...view,
    empty: logEmpty(settings?.recording?.logs, !!targetFilter, t),
    status: logStatus(feed.connected, !!feed.error, paused, feed.pending, LOG_FEED_LIMIT, locale, t),
    // The records the list shows, and the levels the backend offers, for the activity heatmap.
    records: feed.records,
    offered: resource?.levels ?? noLevels,
    level: level ?? '',
    setLevel,
    target,
    setTarget,
    paused,
    setPaused,
    error: capabilities.error ?? feed.error,
    loading: !capabilities.error && !feed.error && !feed.connected && !feed.records.length,
    clear: feed.clear,
    // The level and recording the list is limited by are set in Settings.
    openRecording: capabilities.data?.resources.runtime_settings.available ? () => go('settings', 'card=runtime') : null,
    // A failed capabilities read is what blocks the page; otherwise the stream itself is reopened.
    retry: capabilities.error ? capabilities.refetch : feed.retry,
    export: () => downloadFile(exportName(view.exportBase, 'txt'), logsExport(feed.records, feed.gaps, t), 'text/plain;charset=utf-8')
  };
}
