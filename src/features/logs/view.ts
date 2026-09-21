import type {LogLevel, LogRecord} from '../../api/model';
import {localTime} from '../../api/selectors';
import type {Translator as LabelFn} from '../../i18n';
import type {Key} from '../../i18n/messages';

const tones = {trace: 'muted', debug: 'neutral', info: 'info', warn: 'warn', error: 'err'} as const;
const labels: Record<LogLevel, Key> = {
  trace: 'log.level.trace',
  debug: 'log.level.debug',
  info: 'log.level.info',
  warn: 'log.level.warn',
  error: 'log.level.error'
};
export function logView(
  records: Array<LogRecord & {id: string}>,
  levels: LogLevel[],
  connected: boolean,
  engine: string | undefined,
  locale: string,
  t: LabelFn
) {
  return {
    rows: records.map(record => ({
      id: record.id,
      timestamp: localTime(record.ts, locale),
      levelText: t(labels[record.level]),
      tone: tones[record.level],
      target: record.target,
      tooltip: record.fields ? JSON.stringify(record.fields) : undefined,
      message:
        record.message +
        (record.fields
          ? ' ' +
            Object.entries(record.fields)
              .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
              .join(' ')
          : '')
    })),
    levels: levels.map(id => ({id, label: t(labels[id])})),
    status: {tone: connected ? ('ok' as const) : ('warn' as const), text: t(connected ? 'log.connected' : 'log.reconnecting')},
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
