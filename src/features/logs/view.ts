import {logLevelLabels} from '../../api/selectors';
import type {LogLevel, LogRecord} from '../../api/model';
import {localTime} from '../../i18n/format';
import type {Translator as LabelFn} from '../../i18n';

const severity: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
const tones = {trace: 'muted', debug: 'neutral', info: 'info', warn: 'warn', error: 'err'} as const;
type LogRow = {
  id: string;
  timestamp: string;
  iso: string;
  levelText: string;
  tone: (typeof tones)[LogLevel];
  target: string;
  message: string;
  // Marks the records the stream lost between the rows around it.
  gap: boolean;
};
// A record never changes once appended, so its row is computed once per locale and reused across publications.
const rows = new WeakMap<LogRecord, {locale: string; row: LogRow}>();
function logRow(record: LogRecord & {id: string}, locale: string, t: LabelFn): LogRow {
  const hit = rows.get(record);
  if (hit && hit.locale === locale) return hit.row;
  const row: LogRow = {
    id: record.id,
    timestamp: localTime(record.ts, locale),
    iso: record.ts,
    levelText: t(logLevelLabels[record.level]),
    tone: tones[record.level],
    target: record.target,
    gap: false,
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
  failed = false,
  gaps: ReadonlySet<LogRecord> = new Set(),
  // The runtime log.level: the engine emits nothing below it, whatever the stream asks for.
  recorded?: LogLevel
) {
  const below = (level: LogLevel) => !!recorded && severity.indexOf(level) < severity.indexOf(recorded);
  return {
    rows: records.flatMap(record => {
      const row = logRow(record, locale, t);
      if (!gaps.has(record)) return [row];
      return [{...row, id: `gap ${record.id}`, timestamp: '', iso: '', levelText: '', target: '', gap: true, message: t('log.gap')}, row];
    }),
    levels: levels.map(id => ({id, label: below(id) ? t('log.levelNotRecorded', {level: t(logLevelLabels[id])}) : t(logLevelLabels[id])})),
    recordedText: recorded ? t('log.recorded', {level: t(logLevelLabels[recorded])}) : null,
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

// Oldest first. The gap marker the list shows gets its own line after the last record before the loss.
export function logsExport(records: LogRecord[], gaps: ReadonlySet<LogRecord>, t: LabelFn) {
  return (
    [...records]
      .reverse()
      .flatMap(r => {
        const line = `${r.ts} ${r.level.toUpperCase().padEnd(5)} ${r.target} ${r.message}${r.fields ? ' ' + JSON.stringify(r.fields) : ''}`;
        return gaps.has(r) ? [line, t('log.gap')] : [line];
      })
      .join('\n') + '\n'
  );
}
