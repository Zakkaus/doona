import {expect, it} from 'vitest';
import {createMockApi} from './index';
import {validationSources} from '../../features/config/names';

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
