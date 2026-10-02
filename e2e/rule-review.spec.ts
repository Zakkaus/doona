import {translate, type Translator} from '../src/i18n';
import {expect, loadCatalogues, mockBackend, test} from './fixtures';

test.beforeAll(loadCatalogues);

async function unsupportedRule(page: import('@playwright/test').Page) {
  const {api} = await mockBackend(page);
  const source = (await api.config()).sources.find(source => source.id === 'src-rules')!;
  await api.pollOperation(
    await api.replaceConfigSource(source.id, source.content + 'mac(aa:bb:cc:dd:ee:ff) && ipversion(4) -> direct\n', `"${source.content_sha256}"`)
  );
}

const lists = [
  {name: 'routing', route: '/#/rules?tab=list&view=advanced', scope: 'Routing rules', role: 'tabpanel', line: 149},
  {name: 'DNS request', route: '/#/rules?tab=dns', scope: 'Request rules', role: 'region', line: 29},
  {name: 'DNS response', route: '/#/rules?tab=dns', scope: 'Response rules', role: 'region', line: 36}
] as const;

for (const lang of ['en', 'zh-TW', 'zh-CN'] as const) {
  const t: Translator = key => translate(lang, key);

  test(`Expression editing describes the expression instead of condition rows in ${lang}`, async ({page}) => {
    await unsupportedRule(page);
    await page.addInitScript(value => localStorage.setItem('doona-lang', value), lang);
    await page.goto('/#/rules?tab=list&view=advanced');
    await page
      .locator('[role=row][data-key]')
      .filter({hasText: 'mac(aa:bb:cc:dd:ee:ff)'})
      .getByRole('button', {name: t('rule.edit'), exact: true})
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox', {name: t('rule.expression'), exact: true})).toBeVisible();
    await expect(dialog.getByText(t('rule.editExpressionHelp'), {exact: true})).toBeVisible();
    await expect(dialog.getByText(t('rule.editHelp'), {exact: true})).toHaveCount(0);
  });

  test(`routing and DNS add help follows the condition mode in ${lang}`, async ({page}) => {
    await page.addInitScript(value => localStorage.setItem('doona-lang', value), lang);
    for (const [route, count] of [
      ['/#/rules?tab=list&view=advanced', 1],
      ['/#/rules?tab=dns', 2]
    ] as const) {
      await page.goto(route);
      const add = page.getByRole('button', {name: t('rule.add'), exact: true});
      await expect(add).toHaveCount(count);
      for (const button of await add.all()) {
        await button.click();
        const dialog = page.getByRole('dialog');
        const visualHelp = t(count === 1 ? 'rule.addHelp' : 'rule.dns.addHelp');
        await expect(dialog.getByText(visualHelp, {exact: true})).toBeVisible();
        await dialog.getByRole('radio', {name: t('rule.expression'), exact: true}).click();
        await expect(dialog.getByText(t('rule.addExpressionHelp'), {exact: true})).toBeVisible();
        await expect(dialog.getByText(visualHelp, {exact: true})).toHaveCount(0);
        await expect(dialog.locator('.rp-dialog-section')).toHaveCount(0);
        await dialog.getByRole('radio', {name: t('rule.pick'), exact: true}).click();
        await expect(dialog.getByText(visualHelp, {exact: true})).toBeVisible();
        await expect(dialog.getByText(t('rule.addExpressionHelp'), {exact: true})).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      }
    }
  });
}

for (const list of lists) {
  for (const access of ['backend', 'source']) {
    test(`${list.name} retains the source jump when the ${access} is read-only`, async ({page}) => {
      const {api, capabilities, handlers, requests} = await mockBackend(page);
      if (access === 'backend') capabilities.resources.config.writable = false;
      else {
        const config = await api.config();
        config.sources.find(source => source.id === 'src-main')!.writable = false;
        handlers['GET config'] = async () => config;
      }
      await page.goto(list.route);
      const row = page.getByRole(list.role, {name: list.scope, exact: true}).locator('[role=row][data-key]').first();
      const edit = row.getByRole('button', {name: 'Edit rule', exact: true});
      if (access === 'backend') await expect(edit).toHaveCount(0);
      else await expect(edit).toBeDisabled();
      await row.getByRole('button', {name: 'Open config file', exact: true}).click();
      await expect(page).toHaveURL(new RegExp(`#/config\\?tab=source&source=src-main&line=${list.line}$`));
      expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
    });
  }

  for (const width of [1440, 390]) {
    test(`${list.name} keeps source, edit and remove in fixed slots at ${width}px`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      await page.goto(list.route);
      const rows = page.getByRole(list.role, {name: list.scope, exact: true}).locator('[role=row][data-key]');
      await expect(rows.first()).toBeVisible();
      await rows.first().getByRole('button').last().scrollIntoViewIfNeeded();
      for (const row of await rows.all()) {
        const cell = row.getByRole('gridcell').last();
        const origin = await cell.evaluate(element => element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft));
        for (const [slot, name] of ['Open config file', 'Edit rule', 'Remove rule'].entries()) {
          const button = cell.getByRole('button', {name, exact: true});
          if (!(await button.count())) continue;
          const box = await button.boundingBox();
          expect(box!.width).toBe(box!.height);
          expect(box!.x - origin).toBeCloseTo(slot * (box!.width + 6), 0);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    test(`${list.name} separates AND sections with the kit form gap at ${width}px`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      await page.goto(list.route);
      await page.getByRole(list.role, {name: list.scope, exact: true}).getByRole('button', {name: 'Add rule', exact: true}).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', {name: 'Add AND condition', exact: true}).click();
      const sections = dialog.locator('.rp-dialog-section');
      await expect(sections).toHaveCount(2);
      const first = await sections.nth(0).boundingBox();
      const second = await sections.nth(1).boundingBox();
      expect(second!.y - first!.y - first!.height).toBe(24);
      await expect(sections.first()).toHaveCSS('gap', '8px');
    });
  }
}

for (const width of [1440, 390]) {
  test(`routing actions retain square kit buttons at ${width}px`, async ({page}) => {
    await unsupportedRule(page);
    await page.setViewportSize({width, height: 900});
    await page.goto('/#/rules?tab=list&view=advanced');
    const rows = page.getByRole('tabpanel', {name: 'Routing rules'}).locator('[role=row][data-key]');
    const buttons = rows.filter({hasText: 'mac(aa:bb:cc:dd:ee:ff)'}).getByRole('button');
    await expect(buttons).toHaveCount(3);
    const reference = await rows.first().getByRole('button', {name: 'Edit rule', exact: true}).boundingBox();
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBe(reference!.height);
      expect(box!.height).toBe(reference!.height);
    }
  });
}

for (const [lang, edit, help] of [
  ['en', 'Edit rule', 'Change the fallback target, then validate, save and reload.'],
  ['zh-TW', '編輯規則', '修改 fallback 目標；驗證通過後儲存並重新載入。'],
  ['zh-CN', '编辑规则', '修改 fallback 目标；验证通过后保存并重新加载。']
]) {
  test(`fallback help describes only the target in ${lang}`, async ({page}) => {
    await page.addInitScript(value => localStorage.setItem('doona-lang', value), lang);
    for (const route of ['/#/rules?tab=list&view=advanced', '/#/rules?tab=dns']) {
      await page.goto(route);
      const fallbacks = page.locator('[role=row][data-key]').filter({hasText: 'fallback:'});
      await expect(fallbacks).toHaveCount(route.includes('tab=dns') ? 2 : 1);
      for (const row of await fallbacks.all()) {
        await row.getByRole('button', {name: edit, exact: true}).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText(help, {exact: true})).toBeVisible();
        await expect(dialog.locator('.rp-dialog-section')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      }
    }
  });
}
