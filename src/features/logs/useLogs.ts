import {useMemo, useState} from 'react';
import {useCapabilities, useLogFeed, useVersion} from '../../api/store';
import type {LogLevel} from '../../api/model';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, useDebounced} from '../../ui/ui';
import {logView} from './view';

export function useLogs() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const capabilities = useCapabilities();
  const version = useVersion();
  const [level, setLevel] = useState<LogLevel>('info');
  const [target, setTarget] = useState('');
  const [paused, setPaused] = useState(false);
  const targetFilter = useDebounced(target.trim(), 300);
  const feed = useLogFeed({level, target: targetFilter, paused});
  const resource = capabilities.data?.resources.logs;
  const view = useMemo(
    () => logView(feed.records, resource?.levels ?? ['trace', 'debug', 'info', 'warn', 'error'], feed.connected, version.data?.engine.name, locale, t),
    [feed.records, feed.connected, resource, version.data, locale, t]
  );
  return {
    ...view,
    level,
    setLevel: (value: string) => setLevel(value as LogLevel),
    target,
    setTarget,
    paused,
    setPaused,
    unavailable: resource?.available === false,
    error: capabilities.error ?? feed.error,
    loading: !capabilities.error && !feed.error && !feed.connected && !feed.records.length,
    clear: feed.clear,
    export: () => downloadFile(exportName(view.exportBase, 'txt'), view.exportContent, 'text/plain;charset=utf-8')
  };
}
