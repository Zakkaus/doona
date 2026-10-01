import {beforeEach, expect, it, vi} from 'vitest';
import {capabilities, version} from '../../api/mock/fixtures';
import {createMockApi} from '../../api/mock';
import type {EffectiveConfig, ConfigValidationResult} from '../../api/model';
import {hookHarness} from '../../store/testHelpers';
import {useLinked} from '../../ui/hooks';
import {useConfigPage, useSourceCard, type ConfigEditor, type SourceCardProps} from './useConfigPage';

vi.mock('react', async original => ({...(await original<typeof import('react')>()), ...hookHarness.hooks}));
vi.mock('../../store', () => ({
  useCapabilities: () => ({data: capabilities}),
  useConfig: () => ({data: config, refetch: vi.fn()}),
  useConfigEditor: () => editor,
  useVersion: () => ({data: version}),
  useRules: () => ({}),
  useDnsRules: () => ({}),
  useGroups: () => ({})
}));
vi.mock('../../store/config', () => ({useCompleteness: () => () => complete}));
vi.mock('../../shell/draft', () => ({useDraftGuard: () => ({clear: vi.fn(), revision: 0})}));
vi.mock('./useBackgroundValidation', () => ({useBackgroundValidation: vi.fn()}));
vi.mock('../../ui/ui', () => ({toast: vi.fn(), toastFailure: vi.fn(), useLinked, isMac: false}));
vi.mock('../../i18n', async original => {
  const actual = await original<typeof import('../../i18n')>();
  return {
    ...actual,
    useLang: () => 'en',
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});

let config: EffectiveConfig;
let validation: ConfigValidationResult;
let complete: boolean | undefined;
let props: SourceCardProps;
const editor: ConfigEditor = {busy: null, error: null, errorSource: null, diagnostics: null, cancel: vi.fn(), validate: vi.fn(), apply: vi.fn()};
const read = () => hookHarness.render(() => useSourceCard(props));
beforeEach(async () => {
  hookHarness.reset();
  const api = createMockApi();
  config = await api.config();
  validation = await api.validateConfig({sources: [{id: config.sources[0].id, content: config.sources[0].content}], mode: 'full'});
  complete = true;
  Object.assign(editor, {busy: null, error: null, errorSource: null, diagnostics: null});
  vi.mocked(editor.validate)
    .mockReset()
    .mockResolvedValue({...validation, valid: true, diagnostics: []});
  vi.mocked(editor.apply).mockReset().mockResolvedValue({});
  props = {
    source: config.sources[0],
    sources: config.sources,
    open: vi.fn(),
    diagnostics: config.diagnostics,
    canValidate: true,
    canWrite: true,
    readOnly: null,
    isComplete: () => complete,
    editor,
    focusLine: null,
    generation: config.generation_id,
    focusDiagnostics: false,
    diagnosticsChoice: null,
    chooseDiagnostics: vi.fn(),
    reportErrors: vi.fn()
  };
});

it.each(['writable', 'read-only', 'pending', 'redacted', 'busy', 'conflict'])('guards source application when %s', async state => {
  if (state === 'read-only') props.canWrite = false;
  if (state === 'pending') complete = undefined;
  if (state === 'redacted') complete = false;
  read().change(props.source.content + '\n# draft');
  if (state === 'busy') editor.busy = 'validate';
  if (state === 'conflict') props.source = {...props.source, content_sha256: 'changed'};
  const m = read();
  expect(m.writable).toBe(!['read-only', 'pending', 'redacted'].includes(state));
  expect(m.saveButton.disabled).toBe(state !== 'writable');
  await m.save();
  expect(editor.apply).toHaveBeenCalledTimes(state === 'writable' ? 1 : 0);
  if (state === 'read-only') {
    await m.validate();
    expect(editor.validate).toHaveBeenCalledOnce();
  }
});

it('keeps cross-source rejection rows without marking or jumping the edited file', async () => {
  const other = {...config.diagnostics[0], level: 'error' as const, source_id: config.sources[1].id, line: 2};
  editor.errorSource = props.source.id;
  editor.diagnostics = [other];
  expect(read().diagnostics.rows[0]).toMatchObject({sourceId: other.source_id, where: 'rules.dae:2'});
  expect(read().marks).toEqual([]);
  vi.mocked(editor.validate).mockResolvedValue({...validation, valid: false, diagnostics: [other]});
  await read().validate();
  expect(read().focus).toBeNull();
});

it('retains accepted diagnostics and a legacy focus request before redacted text is checked', () => {
  config.sources[0].content = '<redacted>';
  complete = undefined;
  const page = hookHarness.render(() => useConfigPage({query: 'tab=validate&source=src-main&line=5', go: vi.fn()}));
  expect(page.tab).toBe('source');
  expect(page.sourceProps).toMatchObject({focusDiagnostics: true, focusLine: 5, diagnostics: config.diagnostics});
  hookHarness.reset();
  props = page.sourceProps!;
  expect(read().checkedDraft).toBe(false);
  expect(read().diagnostics.rows).toHaveLength(config.diagnostics.length);
});

it('restores accepted provenance after cancel and after a generation change', async () => {
  const draftError = {...config.diagnostics[0], level: 'error' as const};
  read().change(props.source.content + '\n# draft');
  expect(read().diagnostics.rows).toEqual([]);
  vi.mocked(editor.validate).mockResolvedValue({...validation, valid: false, diagnostics: [draftError]});
  await read().validate();
  expect(read().checkedDraft).toBe(true);
  read().cancel();
  expect(read().dirty).toBe(false);
  expect(read().checkedDraft).toBe(false);
  expect(read().diagnostics.rows).toHaveLength(config.diagnostics.length);
  await read().validate();
  props.generation = 'next';
  read();
  expect(read().checkedDraft).toBe(false);
});

it.each([true, false])('validates and saves a raw edit of a form-owned value (accepted: %s)', async accepted => {
  const text = props.source.content.replace('tproxy_port: 12345', 'tproxy_port: 23456');
  const rejection = {...config.diagnostics[0], level: 'error' as const, source_id: props.source.id};
  if (!accepted) {
    vi.mocked(editor.validate).mockResolvedValue({...validation, valid: false, diagnostics: [rejection]});
    vi.mocked(editor.apply).mockResolvedValue({diagnostics: [rejection]});
  }
  read().change(text);
  expect(read().links.some(link => link.label === 'tproxy_port')).toBe(true);
  expect(read().text).toBe(text);
  expect(read().checkedDraft).toBe(false);
  expect(await read().validate()).toBe(accepted);
  expect(editor.validate).toHaveBeenCalledWith({
    sources: expect.arrayContaining([expect.objectContaining({id: props.source.id, content: text})]),
    mode: 'full'
  });
  expect(read().checkedDraft).toBe(true);
  await read().save();
  expect(editor.apply).toHaveBeenCalledWith(props.source, text);
  expect(read().dirty).toBe(!accepted);
  expect(read().checkedDraft).toBe(!accepted);
});

it('summarises the shown diagnostics, opens on errors and jumps within the source', async () => {
  expect(read().diagnostics).toMatchObject({errors: 0, quiet: 'No diagnostics', open: false});
  read().change(props.source.content + '\n# draft');
  expect(read().diagnostics.quiet).toBe('Current draft has not been validated.');
  const error = {level: 'error' as const, source_id: props.source.id, line: 3, column: 1, span: null, code: 'invalid', message: 'Bad'};
  const other = {...error, source_id: config.sources[1].id, line: 2};
  vi.mocked(editor.validate).mockResolvedValue({...validation, valid: false, diagnostics: [error, other, {...error, level: 'warning', line: 4}]});
  await read().validate();
  const d = read().diagnostics;
  expect(d).toMatchObject({errors: 2, warnings: 1, open: true, scope: 'Current draft diagnostics'});
  d.setOpen(false);
  expect(props.chooseDiagnostics).toHaveBeenCalledWith({open: false, errorKeys: expect.any(Array)});
  props.diagnosticsChoice = vi.mocked(props.chooseDiagnostics).mock.calls[0][0];
  expect(read().diagnostics.open).toBe(false);
  const before = read().focusKey;
  read().diagnostics.go(read().diagnostics.rows.find(row => row.action === 'jump')!);
  expect(read()).toMatchObject({focus: 3});
  expect(read().focusKey).not.toBe(before);
  read().diagnostics.go(read().diagnostics.rows.find(row => row.action === 'open')!);
  expect(props.open).toHaveBeenCalledWith(other.source_id, 2);
});

it('counts the accepted errors on the source tab', () => {
  config.diagnostics = [{level: 'error', source_id: 'src-main', line: 1, column: 1, span: null, code: 'invalid', message: 'Bad'}];
  const page = hookHarness.render(() => useConfigPage({query: 'tab=modules', go: vi.fn()}));
  expect(page.tabs.find(item => item.id === 'source')?.label).toBe('Config files (1)');
});
