import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {logLevel, logStatus, logsExport, logView} from './view';
const t: Translator = (key, params) => translate('en', key, params);

it('keeps structured fields readable in rows and lossless in chronological exports', () => {
  const records = [
    {
      id: 'new',
      ts: '2026-01-01T00:00:02Z',
      level: 'error' as const,
      target: 'dns',
      message: 'failed',
      fields: {host: 'a.test', attempts: 2, nested: {ok: false}}
    },
    {id: 'old', ts: '2026-01-01T00:00:01Z', level: 'info' as const, target: 'dns', message: 'started', fields: null}
  ];
  const view = logView(records, ['error'], undefined, 'en-US', t);
  expect(view.rows[0].message).toBe('failed host=a.test attempts=2 nested={"ok":false}');
  expect(view.rows[0].tone).toBe('err');
  expect(logsExport(records, new Set(), t).split('\n')[0]).toContain('started');
  expect(logsExport(records, new Set(), t)).toContain(JSON.stringify(records[0].fields));
  expect(view.levels.map(level => level.id)).toEqual(['error']);
});

it('states a paused stream and caps the held count at what resuming can show', () => {
  expect(logStatus(false, false, false, 0, 1000, 'en-US', t).tone).toBe('warn');
  expect(logStatus(true, false, false, 0, 1000, 'en-US', t)).toEqual({tone: 'ok', text: 'Streaming'});
  expect(logStatus(true, false, true, 1, 1000, 'en-US', t)).toEqual({tone: 'neutral', text: 'Paused: 1 new record'});
  expect(logStatus(true, false, true, 1000, 1000, 'en-US', t).text).toBe('Paused: 1,000 new records');
  expect(logStatus(true, false, true, 1001, 1000, 'en-US', t).text).toBe('Paused: 1,000+ new records');
  // A reconnect keeps the paused count; only a failed stream outranks the pause.
  expect(logStatus(false, false, true, 3, 1000, 'en-US', t).text).toBe('Paused: 3 new records');
  expect(logStatus(true, true, true, 3, 1000, 'en-US', t)).toEqual({tone: 'err', text: t('log.disconnected')});
});

it('resolves selected log levels against advertised choices', () => {
  expect(logLevel('info', ['warn', 'error'])).toBe('warn');
  expect(logLevel('error', ['warn', 'error'])).toBe('error');
  expect(logLevel('debug', ['warn', 'info'])).toBe('info');
  expect(logLevel('info', [])).toBeUndefined();
});

it('marks where the stream lost records between older and newer rows', () => {
  const record = (id: string) => ({id, ts: '2026-01-01T00:00:00Z', level: 'info' as const, target: 'dns', message: id, fields: null});
  const records = [record('new'), record('old')];
  const view = logView(records, ['info'], undefined, 'en-US', t, new Set([records[1]]));
  expect(view.rows.map(row => [row.message, row.gap])).toEqual([
    ['new', false],
    [t('log.gap'), true],
    ['old', false]
  ]);
  expect(new Set(view.rows.map(row => row.id)).size).toBe(3);
  // The export keeps the marker, oldest first.
  expect(logsExport(records, new Set([records[1]]), t).split('\n')).toEqual([expect.stringMatching(/ old$/), t('log.gap'), expect.stringMatching(/ new$/), '']);
});

it('marks the levels the engine does not record and states the level it records', () => {
  const view = logView([], ['trace', 'debug', 'info', 'warn', 'error'], undefined, 'en-US', t, new Set(), 'info');
  expect(view.levels.map(level => level.label)).toEqual([
    t('log.levelNotRecorded', {level: t('log.level.trace')}),
    t('log.levelNotRecorded', {level: t('log.level.debug')}),
    t('log.level.info'),
    t('log.level.warn'),
    t('log.level.error')
  ]);
  expect(view.recordedText).toBe(t('log.recorded', {level: t('log.level.info')}));
  const unknown = logView([], ['debug', 'info'], undefined, 'en-US', t);
  expect(unknown.levels.map(level => level.label)).toEqual([t('log.level.debug'), t('log.level.info')]);
  expect(unknown.recordedText).toBeNull();
});

it('shows a log level from a newer backend as sent', () => {
  const level = 'fatal' as 'error';
  const record = {id: 'r', ts: '2026-01-01T00:00:00Z', level, target: 'dns', message: 'm', fields: null};
  const view = logView([record], [level, 'error'], undefined, 'en-US', t, new Set(), level);
  expect(view.rows[0].levelText).toBe('fatal');
  expect(view.levels[0].label).toBe('fatal');
  expect(view.recordedText).toBe(t('log.recorded', {level: 'fatal'}));
});
