import {expect, expectApart, loadCatalogues, mockBackend, moreAction, test} from './fixtures';
import {translate, type Lang, type Translator} from '../src/i18n';
import {readGroupEntries} from '../src/dae/groups';

test.beforeAll(loadCatalogues);

for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
  test.describe(lang, () => {
    test.use({storage: {'doona-lang': lang}});
    test('describes template membership and edits all nodes without rewriting untouched filters', async ({page}) => {
      // The dialog starts 12dvh down, which leaves a stack of two toasts room above it only on a window this tall.
      await page.setViewportSize({width: 1440, height: 920});
      await page.clock.install();
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
      // A card opens its details as it nears the viewport, so its placeholder button is gone by the time a reader could
      // click it. Scroll to it as a reader would: the wheel ends the landing's follow of the linked card first.
      await page.mouse.wheel(0, 1);
      await card('gaming').scrollIntoViewIfNeeded();
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
      const saveToast = page.locator('.rp-toast.positive:not(.background)');
      await expect(saveToast).toBeVisible();
      // Time stops here, so the confirmation cannot time out before the editor reopens beneath it.
      await page.clock.pauseAt(Date.now() + 1000);
      await card('proxy')
        .getByRole('button', {name: t('policy.edit'), exact: true})
        .click();
      // The save's confirmation stays, now above the editor instead of over its footer; Apply is clicked at once.
      await expect(saveToast).toBeVisible();
      await expectApart(saveToast, page.locator('.rp-modal'));
      await all.focus();
      await page.keyboard.press('Space');
      await dialog.getByRole('button', {name: t('policy.save'), exact: true}).click({timeout: 2000});
      await page.clock.resume();
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
