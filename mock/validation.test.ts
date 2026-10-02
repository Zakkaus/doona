import {describe, expect, it} from 'vitest';
import {createMockApi} from './index';
import {validationSources} from '../src/dae/sources';
import {diagnose, validate} from './config';

it.each([
  ['unknown_section', 'mystery {}\n', {name: 'mystery'}],
  ['section_not_closed', 'global {\n', {name: 'global'}],
  ['brace_without_section', '}\n', undefined],
  ['not_a_setting', 'global {\n  unknown\n}\n', undefined],
  ['unknown_key', 'global {\n  mystery: true\n}\n', {name: 'mystery'}],
  ['not_a_rule', 'routing {\n  unknown\n}\n', undefined],
  ['unknown_outbound', 'routing {\n  fallback: missing\n}\n', {name: 'missing'}],
  ['bare_condition', 'routing {\n  bare -> direct\n}\n', undefined]
] as const)('emits %s with structured parameters and an English message', (code, content, params) => {
  expect(diagnose('main', content, new Set(), 'full')).toContainEqual(
    expect.objectContaining({code, message: expect.stringMatching(/./), ...(params ? {params} : {})})
  );
});

it('keeps an unresolved include path as a diagnostic parameter', () => {
  const result = validate({sources: [{id: 'main', content: 'include { missing.dae }'}], mode: 'full'}, 'generation');
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({code: 'include_not_found', message: 'Include "missing.dae" cannot be resolved', params: {path: 'missing.dae'}})
  );
});

it('validates an include only together with its main source', async () => {
  const api = createMockApi();
  const sources = (await api.config()).sources;
  const include = sources.find(source => source.kind === 'include')!;
  const content = 'domain(example.org) -> proxy';
  expect((await api.validateConfig({sources: [{id: include.id, content}], mode: 'full'})).valid).toBe(false);
  const candidate = validationSources([...sources].reverse(), {id: include.id, content})!;
  expect(candidate[0].id).toBe(sources.find(source => source.kind === 'main')!.id);
  expect((await api.validateConfig({sources: candidate, mode: 'full'})).valid).toBe(true);
});

it('resolves native top-level includes in full mode and diagnoses missing dependencies', async () => {
  const api = createMockApi();
  const sources = [
    {id: 'main', path: '/etc/honk/main.dae', content: 'include { parts/groups.dae }\nrouting { fallback: included }'},
    {id: 'groups', path: '/etc/honk/parts/groups.dae', content: 'group { included { policy: fixed(0) } }'}
  ];
  expect((await api.validateConfig({sources, mode: 'full'})).valid).toBe(true);
  const missing = [{...sources[0], content: 'include { missing.dae }\nrouting { fallback: direct }'}];
  expect((await api.validateConfig({sources: missing, mode: 'syntax'})).valid).toBe(true);
  expect((await api.validateConfig({sources: missing, mode: 'full'})).diagnostics).toContainEqual(
    expect.objectContaining({source_id: 'main', code: 'include_not_found', level: 'error'})
  );
});

it('accepts removed probe allowlists with one warning per key and ignores their values', () => {
  const text = `experimental { native_api {
    probe_allowed_cidrs: invalid
    probe_allowed_ports: '0'
    probe_allowed_ports: invalid
  } }`;
  const diagnostics = diagnose('main', text, new Set(), 'full');
  expect(diagnostics).toHaveLength(2);
  expect(diagnostics.every(item => item.level === 'warning' && item.code === 'legacy-config-warning')).toBe(true);
  expect(diagnostics.map(item => item.line)).toEqual([2, 3]);
});

const restartDiagnostic = expect.objectContaining({code: 'restart-required', level: 'error', message: 'Changing global.data_dir requires restarting honk'});
const dataDirBlocks = {
  line: 'global {\n  data_dir: /srv/honk\n}\n',
  oneLine: 'global { data_dir: /srv/honk }\n',
  quoted: 'global {\n  data_dir: "/srv/honk"\n}\n'
};

describe('a changed data_dir is refused as restart-required, whatever the layout, source IDs or file', () => {
  const setup = async () => {
    const api = createMockApi();
    const sources = (await api.config()).sources;
    const main = sources.find(source => source.kind === 'main')!;
    return {api, sources, main, withMain: (extra: string) => ({id: main.id, content: `${main.content!}\n${extra}`})};
  };
  it.each(Object.entries(dataDirBlocks))('in validation and a replacement, %s form', async (_, block) => {
    const {api, sources, main, withMain} = await setup();
    const edited = validationSources(sources, withMain(block))!;
    expect((await api.validateConfig({sources: edited, mode: 'full'})).diagnostics).toContainEqual(restartDiagnostic);
    const refused = await api.replaceConfigSource(main.id, withMain(block).content, main.content_sha256).catch(error => error);
    expect(refused).toMatchObject({status: 422, details: {diagnostics: [restartDiagnostic]}});
  });
  it('in validation that names the sources by IDs of its own', async () => {
    const {api, sources, withMain} = await setup();
    const renamed = validationSources(sources, withMain(dataDirBlocks.oneLine))!.map((source, index) => ({...source, id: `request-${index}`}));
    expect((await api.validateConfig({sources: renamed, mode: 'full'})).diagnostics).toContainEqual(restartDiagnostic);
  });
  it('in a new include, which then is not created', async () => {
    const {api} = await setup();
    const refused = await api.createConfigSource('config.d/contract.dae', dataDirBlocks.oneLine).catch(error => error);
    expect(refused).toMatchObject({status: 422, details: {diagnostics: [restartDiagnostic]}});
    expect((await api.config()).sources.some(source => source.path.endsWith('config.d/contract.dae'))).toBe(false);
  });
  it.each(['', '# data_dir: /srv/honk', '  # global { data_dir: /srv/honk }'])('but not for %j', async text => {
    const {api, sources, withMain} = await setup();
    expect((await api.validateConfig({sources: validationSources(sources, withMain(text))!, mode: 'full'})).valid).toBe(true);
  });
});

describe('the other global restart-only settings are refused as restart-required, in the order honk lists them', () => {
  const global = (...lines: string[]) => `global {\n${lines.map(line => `  ${line}\n`).join('')}}\n`;
  const base = global('log_level: info', 'tproxy_port: 12345', 'lan_interface: br-lan', 'tls_implementation: tls', 'dial_mode: ip');
  const restarts = (content: string, from = base) =>
    validate({sources: [{id: 'main', content}], mode: 'full'}, 'generation', {active: [{id: 'main', content: from}]})
      .diagnostics.filter(item => item.code === 'restart-required')
      .map(item => item.message);
  const change = (key: string, value: string) => base.replace(new RegExp(`${key}:.*`), `${key}: ${value}`);
  it.each([
    ['log_level', 'debug'],
    ['tproxy_port', '12346'],
    ['lan_interface', 'br0'],
    ['tls_implementation', 'utls']
  ])('for %s', (key, value) => {
    expect(restarts(change(key, value))).toEqual([`Changing global.${key} requires restarting honk`]);
  });
  it.each([
    ['utls to UTLS', global('tls_implementation: utls'), global('tls_implementation: UTLS')],
    ['a reloadable setting', base, change('dial_mode', 'domain')]
  ])('but not for %s', (_, from, next) => {
    expect(restarts(next, from)).toEqual([]);
  });
  it('for two settings changed in one write', () => {
    expect(restarts(change('log_level', 'debug').replace('tproxy_port: 12345', 'tproxy_port: 1'))).toEqual([
      'Changing global.tproxy_port requires restarting honk',
      'Changing global.log_level requires restarting honk'
    ]);
  });
});
