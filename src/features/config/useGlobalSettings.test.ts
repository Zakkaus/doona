import {beforeEach, expect, it, vi} from 'vitest';
import {capabilities, version} from '../../api/mock/fixtures';
import {createMockApi} from '../../api/mock';
import {ApiError} from '../../api/error';
import type {ConfigDiagnostic, ConfigSource, EffectiveConfig} from '../../api/model';
import {hookHarness} from '../../store/testHelpers';
import {useGlobalSettings} from './useGlobalSettings';

vi.mock('react', async original => ({...(await original<typeof import('react')>()), ...hookHarness.hooks}));
vi.mock('../../store', () => ({
  useCapabilities: () => ({data: caps}),
  useConfig: () => config,
  useVersion: () => ({data: version}),
  useConfigEditor: () => editor
}));
vi.mock('../../store/config', () => ({useCompleteness: () => () => complete}));
vi.mock('../../shell/draft', () => ({useDraftGuard: () => ({clear: vi.fn(), revision: 0})}));
vi.mock('../../ui/ui', () => ({toast: vi.fn()}));
vi.mock('../../i18n', async original => {
  const actual = await original<typeof import('../../i18n')>();
  return {
    ...actual,
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});

let caps: typeof capabilities;
let config: {data: EffectiveConfig | undefined; error: unknown; refetch: () => void};
let complete: boolean | undefined;
const editor = {busy: null as string | null, error: null as unknown, cancel: vi.fn(), validate: vi.fn(), apply: vi.fn()};
const read = (query = '') => hookHarness.render(() => useGlobalSettings({query, go: vi.fn()}));
const field = (key: string, query = '') => read(query).fields.find(field => field.key === key)!;
beforeEach(async () => {
  hookHarness.reset();
  caps = structuredClone(capabilities);
  config = {data: await createMockApi().config(), error: null, refetch: vi.fn()};
  complete = true;
  editor.busy = null;
  editor.error = null;
  editor.validate.mockReset().mockResolvedValue({valid: true, diagnostics: []});
  editor.apply.mockReset().mockResolvedValue({result: {}});
});

it('writes an unrelated setting while preserving an accepted legacy quoted list', async () => {
  const source = config.data!.sources[0];
  source.content = "global {\n    udp_check_dns: 'dns.google.com:53,8.8.8.8,2001:4860:4860::8888'\n}\nrouting { fallback: direct }\n";
  field('mptcp').change('true');
  const m = read();
  expect(m.blocked).toBe(false);
  await m.save();
  expect(editor.apply).toHaveBeenCalledWith(source, source.content.replace('\n}', '\n\n    mptcp: true\n}'));
});

it.each(['unavailable', 'loading', 'error', 'disabled', 'read-only', 'redacted', 'pending', 'credentials'])('blocks global writes when %s', async state => {
  if (state === 'unavailable') caps.resources.config.available = false;
  if (state === 'loading') config.data = undefined;
  if (state === 'error') config.error = new ApiError(503, 'temporarily_unavailable', 'Config unavailable');
  if (state === 'disabled') caps.resources.config.writable = false;
  if (state === 'read-only') config.data!.sources[0].writable = false;
  if (state === 'redacted') complete = false;
  if (state === 'pending') complete = undefined;
  if (state === 'credentials') config.data!.sources[0].content += '\nexperimental { native_api { token: secret } }';
  field('mptcp').change('true');
  const m = read();
  expect(m.available).toBe(state !== 'unavailable');
  expect(m.writable).toBe(false);
  expect(m.blocked).toBe(true);
  if (state === 'loading') expect(m.source).toBeUndefined();
  if (state === 'error') expect(m.error).toBe(config.error);
  await m.save();
  expect(editor.apply).not.toHaveBeenCalled();
});

it.each([
  ['tproxy_port', 'Transparent proxy port', 'Range: 0–65535', null],
  ['max_concurrent_dials', 'Concurrent dial limit', undefined, null],
  ['preconnect_node_count', 'Preconnected nodes', 'A number, or auto', null],
  ['check_tolerance', 'Switch tolerance', 'Units: ms, s', null],
  ['lan_interface', 'LAN interfaces', 'Separate with commas', null],
  ['mptcp', 'Multipath TCP', undefined, ['', 'true', 'false']],
  ['dial_mode', 'Dial mode', undefined, ['', 'ip', 'domain', 'domain+', 'domain++', 'legacy']]
])('labels %s and offers its hint and choices', (key, label, hint, items) => {
  config.data!.sources[0].content = 'global { dial_mode: legacy }';
  const shown = field(key);
  expect(shown).toMatchObject({label, hint});
  expect(shown.items?.map(item => item.id) ?? null).toEqual(items);
});

it('groups the fields under headings in form order', () => {
  expect(read().groups.map(group => [group.title, group.fields.length])).toEqual([
    ['Interfaces and ports', 9],
    ['Logging', 2],
    ['Node checks', 5],
    ['Dialing and TLS', 12],
    ['Bandwidth and preconnection', 4],
    ['Data storage', 2]
  ]);
});

it('keeps stored hex ports visible and requires a valid edited value', () => {
  config.data!.sources[0].content = 'global { tproxy_port: 0x10 }';
  expect(field('tproxy_port')).toMatchObject({value: '0x10', invalid: true});
  field('tproxy_port').change('65536');
  expect(read().blocked).toBe(true);
  field('tproxy_port').change('16');
  expect(field('tproxy_port')).toMatchObject({value: '16', invalid: false});
  expect(read().blocked).toBe(false);
  field('tproxy_port').change('0x10');
  expect(read().dirty).toBe(false);
});

it.each(['digest', 'source', 'section'])('blocks a draft after its %s changes', async change => {
  const source = config.data!.sources[0];
  source.content += '\nglobal { log_level: warn }';
  field('mptcp').change('true');
  let query = '';
  if (change === 'digest') config.data!.sources[0] = {...source, content_sha256: 'changed'};
  if (change === 'source') {
    const include = config.data!.sources[1];
    include.content = 'global { log_level: info }';
    query = `source=${include.id}`;
  }
  if (change === 'section') query = `source=${source.id}&section=1`;
  const m = read(query);
  expect(m.conflict).toBe(true);
  expect(m.blocked).toBe(true);
  await m.save();
  expect(editor.apply).not.toHaveBeenCalled();
});

it.each(['validation', 'apply', '422', 'restart'])('explains %s refusals and counts only errors', async mode => {
  const diagnostic: ConfigDiagnostic = {
    level: 'error',
    source_id: 'src-main',
    line: null,
    column: null,
    span: null,
    code: mode === 'restart' ? 'restart-required' : 'invalid',
    message: 'Change refused'
  };
  const diagnostics = [diagnostic, {...diagnostic, level: 'warning' as const}, {...diagnostic, level: 'info' as const}];
  if (mode === 'validation') editor.validate.mockResolvedValue({valid: false, diagnostics});
  if (mode === 'apply') editor.apply.mockResolvedValue({diagnostics});
  if (mode === '422' || mode === 'restart') {
    editor.apply.mockImplementation(async () => {
      editor.error = new ApiError(422, 'unsupported_value', 'Configuration validation failed', null, {diagnostics});
      return undefined;
    });
  }
  field('tproxy_port').change('23456');
  await read().save();
  expect(read().failure).toContain(mode === 'restart' ? '1 setting takes effect only after a restart; nothing written' : 'Validation found 1 error');
  expect(read().dirty).toBe(true);
  if (mode === 'validation') expect(editor.apply).not.toHaveBeenCalled();
  if (mode === '422' || mode === 'restart') expect(read().error).toBeNull();
});

it.each(['include', 'absent'])('writes the %s section without changing other text', async mode => {
  const source: ConfigSource = config.data!.sources[mode === 'include' ? 1 : 0];
  source.content = mode === 'include' ? '# keep\nglobal {\n  log_level: info # note\n}\n' : '# keep\nrouting { fallback: direct }\n';
  const query = `source=${source.id}`;
  field(mode === 'include' ? 'log_level' : 'mptcp', query).change(mode === 'include' ? 'debug' : 'true');
  await read(query).save();
  const content = mode === 'include' ? source.content.replace('info', 'debug') : source.content + 'global {\n  mptcp: true\n}\n';
  expect(editor.apply).toHaveBeenCalledWith(source, content);
  expect(editor.validate.mock.calls[0][0].sources.find((item: {id: string}) => item.id === source.id).content).toBe(content);
  expect(read(query).dirty).toBe(false);
});
