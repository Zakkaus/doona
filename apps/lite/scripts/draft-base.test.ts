import {expect, it} from 'vitest';
import {capabilities} from '../../../mock/fixtures/capabilities';
import {createMockApi} from '../src/demo/createMockApi';
import {applyContent, readMain} from '../src/api';
import {sectionText, validateContent, writeSection} from '../src/config';
import {draftBase} from '../src/state';

it.each([
  ['dns', (text: string) => text.replace('tls://1.1.1.1:853', 'tls://1.0.0.1:853')],
  ['routing', (text: string) => text.replace('{', '{\n  domain(example.org) -> direct')]
] as const)('keeps the %s draft on the source of its first edit across a re-read', async (section, change) => {
  const api = await createMockApi({isolated: true});
  const connection = {api, capabilities, address: 'test'};
  const first = await readMain(api);
  const pinned = draftBase(undefined, first, true)!;
  const local = change(sectionText(first.content, section));
  expect(local).not.toBe(sectionText(first.content, section));
  const external = first.content.replace('udp://223.5.5.5:53', 'udp://9.9.9.9:53');
  expect(external).not.toBe(first.content);
  await api.pollOperation(await api.replaceConfigSource(first.id, external, `"${first.content_sha256}"`));
  // The invalidation re-read lands while the draft is open.
  const base = draftBase(pinned, await readMain(api), true)!;
  expect(base.content_sha256).toBe(first.content_sha256);
  const content = writeSection(base.content, section, local);
  // Export serialises the same base, so it cannot carry the other client's change as if it were the draft's.
  expect(content).not.toContain('udp://9.9.9.9:53');
  await expect(validateContent(connection, base, content)).rejects.toMatchObject({key: 'conflict'});
  await expect(applyContent(connection, base, content)).rejects.toMatchObject({key: 'conflict'});
  expect((await readMain(api)).content).toBe(external);
});
