import {expect, it} from 'vitest';
import {createMockApi} from '../mock';
import {configValidationRequest} from './config';

it('validates an include with its main source and rejects incomplete accepted text', async () => {
  const api = createMockApi();
  const sources = (await api.config()).sources;
  const include = sources.find(source => source.kind === 'include')!;
  const content = 'domain(example.org) -> proxy';
  expect((await api.validateConfig({sources: [{id: include.id, content}], mode: 'full'})).valid).toBe(false);
  const candidate = await configValidationRequest([...sources].reverse(), include.id, content);
  expect(candidate.sources[0].id).toBe(sources.find(source => source.kind === 'main')!.id);
  expect((await api.validateConfig(candidate)).valid).toBe(true);
  await expect(
    configValidationRequest(
      sources.map(source => (source.kind === 'main' ? {...source, content: 'redacted'} : source)),
      include.id,
      content
    )
  ).rejects.toMatchObject({key: 'config.incomplete'});
});
