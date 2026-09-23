import {logLevelLabels} from '../../api/selectors';
import type {LogLevel, LogRecord} from '../../api/model';
import {localTime} from '../../i18n/format';
import type {Translator as LabelFn} from '../../i18n';

const tones = {trace: 'muted', debug: 'neutral', info: 'info', warn: 'warn', error: 'err'} as const;
type LogRow = {id: string; timestamp: string; levelText: string; tone: (typeof tones)[LogLevel]; target: string; message: string};
// A record never changes once appended, so its row is computed once per locale and reused across publications.
const rows = new WeakMap<LogRecord, {locale: string; row: LogRow}>();
function logRow(record: LogRecord & {id: string}, locale: string, t: LabelFn): LogRow {
  const hit = rows.get(record);
  if (hit && hit.locale === locale) return hit.row;
  const row: LogRow = {
    id: record.id,
    timestamp: localTime(record.ts, locale),
    levelText: t(logLevelLabels[record.level]),
    tone: tones[record.level],
    target: record.target,
    message:
      record.message +
      (record.fields
        ? ' ' +
          Object.entries(record.fields)
            .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
            .join(' ')
        : '')
  };
  rows.set(record, {locale, row});
  return row;
}
export function logView(
  records: Array<LogRecord & {id: string}>,
  levels: LogLevel[],
  connected: boolean,
  engine: string | undefined,
  locale: string,
  t: LabelFn,
  failed = false
) {
  return {
    rows: records.map(record => logRow(record, locale, t)),
    levels: levels.map(id => ({id, label: t(logLevelLabels[id])})),
    // A failed stream is not retried until asked, so it is not "connecting".
    status: failed
      ? {tone: 'err' as const, text: t('log.disconnected')}
      : {tone: connected ? ('ok' as const) : ('warn' as const), text: t(connected ? 'log.connected' : 'log.reconnecting')},
    exportBase: `${engine || 'engine'}-log`
  };
}

export function logLevel(level: LogLevel, levels: LogLevel[] = []): LogLevel | undefined {
  return levels.includes(level) ? level : levels.includes('info') ? 'info' : levels[0];
}

export function logsExport(records: LogRecord[]) {
  return (
    [...records]
      .reverse()
      .map(r => `${r.ts} ${r.level.toUpperCase().padEnd(5)} ${r.target} ${r.message}${r.fields ? ' ' + JSON.stringify(r.fields) : ''}`)
      .join('\n') + '\n'
  );
}
