import {ApiError} from '../src/api/error';
import {expect, mockBackend, test} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});

test('DNS Statistics opens the visual upstream editor, which renames references without changing other text', async ({page}) => {
  const {api} = await mockBackend(page);
  const before = (await api.config()).sources.find(source => source.id === 'src-main')!.content!;
  await page.goto('/#/dns');
  await page.getByRole('link', {name: 'Open DNS configuration', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=dns&section=upstreams$/);
  const upstreams = page.getByRole('region', {name: 'DNS upstreams', exact: true});
  await upstreams.getByRole('row').filter({hasText: 'alidns'}).getByRole('button', {name: 'Edit', exact: true}).click();
  const edit = page.getByRole('dialog', {name: 'Edit DNS upstream'});
  await edit.getByRole('textbox', {name: 'Name', exact: true}).fill('localdns');
  await edit.getByRole('textbox', {name: 'Address', exact: true}).fill('udp://1.1.1.1:53');
  await edit.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(edit).toHaveCount(0);
  const after = (await api.config()).sources.find(source => source.id === 'src-main')!.content!;
  expect(after).toBe(
    before
      .replace('alidns:', 'localdns:')
      .replace('udp://223.5.5.5:53', 'udp://1.1.1.1:53')
      .replaceAll('-> alidns', '-> localdns')
      .replaceAll('upstream(alidns)', 'upstream(localdns)')
  );
  await upstreams.getByRole('button', {name: 'Add DNS upstream'}).click();
  const add = page.getByRole('dialog', {name: 'Add DNS upstream'});
  await add.getByRole('textbox', {name: 'Name', exact: true}).fill('backupdns');
  await add.getByRole('textbox', {name: 'Address', exact: true}).fill('https://dns.google/dns-query');
  await add.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(add).toHaveCount(0);
  await expect(upstreams.getByRole('row').filter({hasText: 'backupdns'})).toBeVisible();
});

test('DNS upstream renaming updates included references before removing the old name', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page);
  const included = (await api.config()).sources.find(source => source.id === 'src-rules')!;
  await api.pollOperation(
    await api.replaceConfigSource(
      included.id,
      included.content + '\ndns {\n routing {\n response {\n upstream(alidns) -> alidns\n }\n }\n}\n',
      `"${included.content_sha256}"`
    )
  );
  const stages: string[] = [];
  handlers['PUT config/sources/src-main'] = async request => {
    stages.push(request.postDataJSON().content);
    return api.replaceConfigSource('src-main', request.postDataJSON().content, request.headers()['if-match']);
  };
  await page.goto('/#/rules?tab=dns&section=upstreams');
  await page
    .getByRole('region', {name: 'DNS upstreams', exact: true})
    .getByRole('row')
    .filter({hasText: 'alidns'})
    .getByRole('button', {name: 'Edit', exact: true})
    .click();
  const edit = page.getByRole('dialog', {name: 'Edit DNS upstream'});
  await edit.getByRole('textbox', {name: 'Name', exact: true}).fill('localdns');
  await edit.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(edit).toHaveCount(0);
  expect(stages).toHaveLength(2);
  expect(stages[0]).toContain('alidns:');
  expect(stages[0]).toContain('localdns:');
  expect(stages[1]).not.toContain('alidns');
  expect((await api.config()).sources.find(source => source.id === 'src-rules')!.content).toContain('upstream(localdns) -> localdns');
  expect(requests.filter(request => request.method() === 'PUT').map(request => new URL(request.url()).pathname.split('/').pop())).toEqual([
    'src-main',
    'src-rules',
    'src-main'
  ]);
});

test('DNS upstream edits refuse a stale source without overwriting it', async ({page}) => {
  const {api, requests} = await mockBackend(page);
  await page.goto('/#/rules?tab=dns');
  await page
    .getByRole('region', {name: 'DNS upstreams', exact: true})
    .getByRole('row')
    .filter({hasText: 'alidns'})
    .getByRole('button', {name: 'Edit', exact: true})
    .click();
  const edit = page.getByRole('dialog', {name: 'Edit DNS upstream'});
  await edit.getByRole('textbox', {name: 'Address', exact: true}).fill('udp://1.1.1.1:53');
  const source = (await api.config()).sources.find(source => source.id === 'src-main')!;
  await api.pollOperation(await api.replaceConfigSource(source.id, '# concurrent edit\n' + source.content, `"${source.content_sha256}"`));
  await edit.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(edit).toContainText('out of sync');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
  expect((await api.config()).sources.find(source => source.id === 'src-main')!.content).toBe('# concurrent edit\n' + source.content);
});

for (const readonly of [true, false])
  test(`cross-file DNS rename ${readonly ? 'refuses read-only references' : 'retries safely after a partial write'}`, async ({page}) => {
    const {api, handlers, requests} = await mockBackend(page);
    const included = (await api.config()).sources.find(source => source.id === 'src-rules')!;
    await api.pollOperation(
      await api.replaceConfigSource(
        included.id,
        included.content + '\ndns {\n routing {\n response {\n upstream(alidns) -> alidns\n }\n }\n}\n',
        `"${included.content_sha256}"`
      )
    );
    handlers['GET config'] = async () => {
      const config = await api.config();
      return {...config, sources: config.sources.map(source => (readonly && source.id === 'src-rules' ? {...source, writable: false} : source))};
    };
    let refused = false;
    handlers['PUT config/sources/src-rules'] = request => {
      if (!refused) {
        refused = true;
        throw new ApiError(412, 'precondition_failed', 'Changed');
      }
      return api.replaceConfigSource('src-rules', request.postDataJSON().content, request.headers()['if-match']);
    };
    await page.goto('/#/rules?tab=dns');
    await page
      .getByRole('region', {name: 'DNS upstreams', exact: true})
      .getByRole('row')
      .filter({hasText: 'alidns'})
      .getByRole('button', {name: 'Edit', exact: true})
      .click();
    const edit = page.getByRole('dialog', {name: 'Edit DNS upstream'});
    await edit.getByRole('textbox', {name: 'Name', exact: true}).fill('localdns');
    const save = edit.getByRole('button', {name: 'Save', exact: true});
    if (readonly) {
      await expect(save).toBeDisabled();
      await expect(edit).toContainText('read-only');
      expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
    } else {
      await save.click();
      await expect(edit.getByRole('textbox', {name: 'Name', exact: true})).toBeDisabled();
      await expect(save).toBeEnabled();
      let main = (await api.config()).sources.find(source => source.id === 'src-main')!.content;
      expect(main).toContain('alidns:');
      expect(main).toContain('localdns:');
      await save.click();
      await expect(edit).toHaveCount(0);
      main = (await api.config()).sources.find(source => source.id === 'src-main')!.content;
      expect(main).not.toContain('alidns');
      expect((await api.config()).sources.find(source => source.id === 'src-rules')!.content).toContain('upstream(localdns) -> localdns');
    }
  });
