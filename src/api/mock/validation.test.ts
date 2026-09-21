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
