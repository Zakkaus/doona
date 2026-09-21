import {expect, it} from 'vitest';
import {configNotes} from '../../api/mock/fixtures';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {sourceView, diagnosticRows, wizardInitial, wizardRows} from './view';
const t: Translator = (key, params) => translate('en', key, params);
it('keeps hidden source paths out of source labels and exposes content availability', async () => {
  const configSources = (await createMockApi().config()).sources;
  const source = {...configSources[0], id: 'abcdef012345', path: '<redacted>', content: undefined, writable: false};
  const row = sourceView(source, 'en-US', t);
  expect(row.label).not.toContain('<redacted>');
  expect(row.hasContent).toBe(false);
  expect(row.tone).toBe('muted');
  expect(sourceView(configSources[0], 'en-US', t).label).toBe(configSources[0].path);
});
it('projects source locations without inventing a line for source-wide diagnostics', async () => {
  const configSources = (await createMockApi().config()).sources;
  const rows = diagnosticRows([configNotes[0], {...configNotes[0], source_id: 'missing', line: null}], configSources, 'en-US', t);
  expect(rows[0].where).toBe('config.dae:5');
  expect(rows[0].tone).toBe('warn');
  expect(rows[1].where).toBe('missing');
  expect(rows[1].inline).toBe(configNotes[0].message);
});
it('initializes empty setup and preserves opaque subscription lines while hiding blank lines', () => {
  const empty = wizardInitial('');
  expect(empty.rules).not.toBe('keep');
  expect(empty.subscriptions).toEqual([{name: 'sub', url: ''}]);
  const state = wizardInitial("subscription {\n  a: 'https://example.org/sub'\n}\n");
  expect(state.rules).toBe('keep');
  state.subscriptions = [
    {name: '', url: '', raw: '  '},
    {name: '', url: '', raw: 'file: /etc/nodes'},
    {name: 'bad', url: 'ftp://example.org'}
  ];
  const view = wizardRows(state, undefined, t);
  expect(view.rows.map(row => row.index)).toEqual([1, 2]);
  expect(view.rows[0].raw).toBe('file: /etc/nodes');
  expect(view.rows[1].error).toBe(t('config.wizardSubscriptionHelp'));
  expect(view.groupUsedText).toContain('proxy');
});
