import {expect, loadCatalogues, mockBackend, moreAction, test} from './fixtures';
import {translate, type Lang, type Translator} from '../src/i18n';

const labels = {
  en: {everyNode: 'Includes every node', groups: 'Groups', count: '125 nodes, 7 groups'},
  'zh-TW': {everyNode: '包含所有節點', groups: '子群組', count: '125 個節點，7 個群組'},
  'zh-CN': {everyNode: '包含所有节点', groups: '子组', count: '125 个节点，7 个组'}
};

test.beforeAll(loadCatalogues);

for (const lang of Object.keys(labels) as Array<keyof typeof labels>) {
  test.describe(lang, () => {
    test.use({storage: {'doona-lang': lang}});
    test('describes template membership on cards and in the editor while preserving filter syntax', async ({page}) => {
      await mockBackend(page);
      const t: Translator = (key, params) => translate(lang as Lang, key, params);
      const words = labels[lang];
      await page.goto('/#/policies?tab=arrange');
      const card = (name: string) => page.locator('.rp-drop').filter({has: page.getByRole('heading', {name, exact: true})});
      await expect(card('auto')).toContainText(words.everyNode);
      await expect(card('auto').getByRole('button', {name: /^(Remove|移除)/})).toHaveCount(0);
      await expect(card('proxy')).toContainText(words.count);
      await expect(card('proxy').locator('.rp-tags-title')).toHaveText(words.groups);
      await expect(card('proxy').locator('.rp-tag')).toHaveText(['auto', 'hk', 'jp', 'us', 'tw', 'sg', 'kr']);
      await expect(card('proxy').locator('.rp-tags button')).toHaveCount(0);
      for (const name of ['proxy', 'auto']) {
        await expect(card(name)).toContainText(words.everyNode);
        await expect(card(name)).not.toContainText('!name(');
        await expect(card(name)).not.toContainText('group(');
        await expect(card(name)).not.toContainText(t('arrange.ruleSelects', {names: 'hk-01'}));
        await expect(card(name)).toContainText(t('arrange.filterNote'));
        await expect(card(name).getByRole('link', {name: t('arrange.editSource')})).toHaveAttribute('href', '#/config?tab=source');
      }
      await expect(card('gaming').locator('.rp-tag-label')).toHaveText(['jp-01', 'hk-02']);
      await expect(card('hk')).toContainText('name(regex:');
      for (const name of ['auto', 'proxy']) {
        await page.goto(`/#/policies?group=${name}`);
        await moreAction(page.getByRole('region', {name, exact: true}), t('policy.edit'), t('ui.moreActions'));
        const dialog = page.getByRole('dialog', {name: t('policy.editTitle', {name})});
        await expect(dialog).toContainText(words.everyNode);
        const filter = dialog.getByRole('textbox', {name: name === 'proxy' ? t('policy.filterN', {n: 2}) : t('ui.filter')});
        await expect(filter).toHaveValue("!name('direct', 'block')");
        if (name === 'proxy') {
          await expect(dialog.locator('.rp-tags-title')).toHaveText(words.groups);
          await expect(dialog.locator('.rp-tag')).toHaveText(['auto', 'hk', 'jp', 'us', 'tw', 'sg', 'kr']);
          await expect(dialog.getByRole('textbox', {name: t('policy.filterN', {n: 1})})).toHaveValue("group('auto', 'hk', 'jp', 'us', 'tw', 'sg', 'kr')");
        }
        await dialog.getByRole('button', {name: t('ui.cancel'), exact: true}).click();
      }
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
