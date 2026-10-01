import {expect, loadCatalogues, mockBackend, moreAction, test} from './fixtures';
import {translate, type Lang, type Translator} from '../src/i18n';
import {readGroupEntries} from '../src/dae/groups';

test.beforeAll(loadCatalogues);

for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
  test.describe(lang, () => {
    test.use({storage: {'doona-lang': lang}});
    test('describes template membership and edits all nodes without rewriting untouched filters', async ({page}) => {
      const {api} = await mockBackend(page);
      const t: Translator = (key, params) => translate(lang as Lang, key, params);
      await page.goto('/#/policies?group=proxy');
      const card = (name: string) => page.getByRole('region', {name, exact: true});
      for (const name of ['proxy', 'auto']) {
        await expect(card(name)).toContainText(t('group.everyNode'));
        await expect(card(name)).not.toContainText('!name(');
        await expect(card(name)).not.toContainText('group(');
      }
      const nested = card('proxy').getByRole('group', {name: t('policy.includes'), exact: true});
      await expect(nested.locator('.rp-tag')).toHaveText(['auto', 'hk', 'jp', 'us', 'tw', 'sg', 'kr']);
      await expect(nested.getByRole('button')).toHaveCount(0);
      await card('gaming').getByRole('button', {name: 'gaming', exact: true}).click();
      await expect(card('gaming').locator('.rp-tag-label')).toHaveText(['jp-01', 'hk-02']);
      for (const name of ['auto', 'proxy']) {
        const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
        await card(name)
          .getByRole('button', {name: t('policy.edit'), exact: true})
          .click();
        const dialog = page.getByRole('dialog', {name: t('policy.editTitle', {name})});
        await expect(dialog.getByRole('switch', {name: t('group.allNodes'), exact: true})).toBeChecked();
        await expect(dialog).not.toContainText('!name(');
        await dialog.getByRole('button', {name: t('policy.save'), exact: true}).click();
        await expect(dialog).toHaveCount(0);
        expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
      }
      await card('proxy')
        .getByRole('button', {name: t('policy.edit'), exact: true})
        .click();
      const dialog = page.getByRole('dialog', {name: t('policy.editTitle', {name: 'proxy'})});
      const all = dialog.getByRole('switch', {name: t('group.allNodes'), exact: true});
      await dialog.getByText(t('group.allNodes'), {exact: true}).click();
      await expect(all).not.toBeChecked();
      await dialog.getByRole('button', {name: t('policy.save'), exact: true}).click();
      await expect(dialog).toHaveCount(0);
      const saved = (await api.config()).sources.find(source => source.kind === 'main')!.content;
      expect(readGroupEntries(saved).find(group => group.name === 'proxy')!.filters).toEqual(["group('auto', 'hk', 'jp', 'us', 'tw', 'sg', 'kr')"]);
      await card('proxy')
        .getByRole('button', {name: t('policy.edit'), exact: true})
        .click();
      await all.focus();
      await page.keyboard.press('Space');
      await dialog.getByRole('button', {name: t('policy.save'), exact: true}).click();
      await expect(dialog).toHaveCount(0);
      expect(
        readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(group => group.name === 'proxy')!.filters
      ).toContain('!name(direct, block)');
    });
  });
}

test('a read-only dialog describes template filters and shows unknown filters as written', async ({page}) => {
  const {capabilities} = await mockBackend(page);
  capabilities.resources.config.writable = false;
  await page.goto('/#/policies?group=proxy');
  await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), 'View configuration');
  const dialog = page.getByRole('dialog', {name: 'proxy configuration'});
  await expect(dialog).toContainText('Includes every node');
  await expect(dialog).not.toContainText('!name(');
  await expect(dialog).not.toContainText('group(');
  await expect(dialog.locator('.rp-tag')).toHaveText(['auto', 'hk', 'jp', 'us', 'tw', 'sg', 'kr']);
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  await page.goto('/#/policies?group=hk');
  await moreAction(page.getByRole('region', {name: 'hk', exact: true}), 'View configuration');
  await expect(page.getByRole('dialog', {name: 'hk configuration'})).toContainText('name(regex:');
});
