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
  expect(JSON.parse(view.rows[0].tooltip!)).toEqual(records[0].fields);
  expect(view.rows[0].tone).toBe('err');
  expect(view.rows[1].tooltip).toBeUndefined();
  expect(logsExport(records).split('\n')[0]).toContain('started');
  expect(logsExport(records)).toContain(JSON.stringify(records[0].fields));
  expect(view.levels.map(level => level.id)).toEqual(['error']);
  expect(view.status.tone).toBe('warn');
});

it('resolves selected log levels against advertised choices', () => {
  expect(logLevel('info', ['warn', 'error'])).toBe('warn');
  expect(logLevel('error', ['warn', 'error'])).toBe('error');
  expect(logLevel('debug', ['warn', 'info'])).toBe('info');
  expect(logLevel('info', [])).toBeUndefined();
});
