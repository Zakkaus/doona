import {useMemo, useState} from 'react';
import {useCapabilities, useLogFeed, useVersion} from '../../store';
import type {LogLevel} from '../../api/model';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, useDebounced} from '../../ui/ui';
import {logLevel, logsExport, logView} from './view';

export function useLogs() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const version = useVersion();
  const [requestedLevel, setLevel] = useState<LogLevel>('info');
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
    level: level ?? '',
    setLevel: (value: string) => setLevel(value as LogLevel),
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
