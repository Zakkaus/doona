import {mockBackend as backend} from './fixtures';
import {writeGroupEntry} from '../src/dae/groups';

export async function mockBackend(page: Parameters<typeof backend>[0]) {
  const mock = await backend(page);
  const main = (await mock.api.config()).sources.find(source => source.kind === 'main')!;
  const resilient = writeGroupEntry(main.content!, 'resilient', {filters: ['name(hk-01, sg-01, us-01)'], policy: 'min_avg10'});
  const content = writeGroupEntry(resilient, 'proxy', {
    filters: ['name(hk-01, hk-02, jp-01)', 'group(resilient)'],
    policy: 'fixed(0)',
    default: 'hk-01',
    final: null
  });
  await mock.api.pollOperation(await mock.api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`));
  return mock;
}
