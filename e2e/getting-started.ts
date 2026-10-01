import type {Page} from '@playwright/test';
import {mockBackend} from './fixtures';
import {templates} from '../src/dae/templates';

export async function freshBackend(page: Page) {
  const backend = await mockBackend(page);
  backend.handlers['POST nodes'] = request => backend.api.createNode(request.postDataJSON());
  const sources = (await backend.api.config()).sources;
  const main = sources.find(source => source.kind === 'main')!;
  const content = [
    'global { log_level: info }',
    'subscription {\n}',
    'node {\n}',
    "group { proxy { filter: !name('direct', 'block') policy: min_moving_avg } }",
    'routing {',
    ...templates.global.rules,
    'fallback: direct',
    '}'
  ].join('\n');
  const accepted = await backend.api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  await backend.api.pollOperation(accepted);
  for (const include of sources.filter(source => source.kind === 'include'))
    await backend.api.pollOperation(await backend.api.replaceConfigSource(include.id, '', `"${include.content_sha256}"`));
  return backend;
}
