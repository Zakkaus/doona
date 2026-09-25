import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {logLevel, logsExport, logView} from './view';
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
  const view = logView(records, ['error'], false, undefined, 'en-US', t);
  expect(view.rows[0].message).toBe('failed host=a.test attempts=2 nested={"ok":false}');
  expect(view.rows[0].tone).toBe('err');
  expect(logsExport(records).split('\n')[0]).toContain('started');
  expect(logsExport(records)).toContain(JSON.stringify(records[0].fields));
  expect(view.levels.map(level => level.id)).toEqual(['error']);
  expect(view.status.tone).toBe('warn');
  expect(logView(records, ['error'], false, undefined, 'en-US', t, true).status).toEqual({tone: 'err', text: t('log.disconnected')});
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
  const view = logView(records, ['info'], true, undefined, 'en-US', t, false, new Set([records[1]]));
  expect(view.rows.map(row => [row.message, row.gap])).toEqual([
    ['new', false],
    [t('log.gap'), true],
    ['old', false]
  ]);
  expect(new Set(view.rows.map(row => row.id)).size).toBe(3);
});
