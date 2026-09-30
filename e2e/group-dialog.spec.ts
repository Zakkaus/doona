import en from '../src/i18n/locales/en.json' with {type: 'json'};
import zh from '../src/i18n/locales/zh-CN.json' with {type: 'json'};
import {expect, mockBackend, moreAction, scrollIntoList, test} from './fixtures';
import {readGroupEntries} from '../src/dae/groups';

test.use({storage: {'doona-lang': 'en'}});

test('Policies stages all new group fields and writes them on Apply', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies?tab=arrange');
  await page.getByRole('button', {name: 'New group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New group'});
  const name = dialog.getByRole('textbox', {name: 'Group name'});
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await name.fill('proxy');
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(name).toHaveAccessibleDescription(/already exists/);
  await name.fill('streaming');
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Filter 1'}).fill('name(hk-01)');
  await dialog.getByRole('button', {name: /Selection policy/}).click();
  await page.getByRole('option', {name: /^Score/}).click();
  await dialog.getByRole('button', {name: /Final outbound$/}).click();
  await page.getByRole('option', {name: 'direct', exact: true}).click();
  await expect(dialog.getByRole('button', {name: /Default member$/})).toHaveCount(0);
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.some(source => source.content.includes('streaming {'))).toBe(false);
  await page.getByRole('button', {name: 'Review and apply'}).click();
  const review = page.getByRole('dialog', {name: 'Review changes'});
  await expect(review).toContainText('filter: name(hk-01)');
  await expect(review).toContainText('policy: score');
  await expect(review).toContainText('final: direct');
  await review.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(review).toHaveCount(0);
  await expect.poll(async () => (await api.group('streaming')).config.final_outbound).toBe('direct');
  const source = (await api.config()).sources.find(source => source.kind === 'main')!;
  expect(readGroupEntries(source.content).find(entry => entry.name === 'streaming')).toMatchObject({
    filters: ['name(hk-01)'],
    policy: 'score',
    final: 'direct'
  });
  await page.locator('.rp-toast.positive').getByRole('button', {name: 'View group', exact: true}).click();
  await moreAction(page.getByRole('region', {name: 'streaming', exact: true}), 'Edit group');
  const edit = page.getByRole('dialog', {name: 'Edit group streaming'});
  await expect(edit.getByRole('textbox', {name: 'Group name'})).toHaveCount(0);
  await expect(edit.getByRole('button', {name: /Final outbound$/})).toContainText('direct');
  await edit.getByRole('button', {name: /Final outbound$/}).click();
  await page.getByRole('option', {name: 'block', exact: true}).click();
  await edit.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect.poll(async () => (await api.group('streaming')).config.final_outbound).toBe('block');
});

test('Nodes creates a filtered group with a final and keeps the draft after validation refuses it', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  let invalid = true;
  handlers['POST config/validate'] = async () => ({
    valid: !invalid,
    generation_id: '40',
    validated_at: new Date().toISOString(),
    diagnostics: invalid
      ? [{level: 'error', message: 'Group validation refused', source_id: 'src-main', line: 44, column: 3, span: null, code: 'group-invalid'}]
      : []
  });
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Add hk-01 to a group', exact: true}).click();
  await page.getByRole('menuitem', {name: 'New group…', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New group'});
  await dialog.getByRole('textbox', {name: 'Group name'}).fill('nodegroup');
  await expect(dialog.getByRole('textbox', {name: 'Filter 1'})).toHaveValue('name(hk-01)');
  await dialog.getByRole('button', {name: /Final outbound$/}).click();
  await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill('sg-01');
  const option = page.getByRole('option', {name: /^sg-01/});
  await scrollIntoList(option);
  await option.click();
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Validation found');
  await expect(dialog.getByRole('textbox', {name: 'Group name'})).toHaveValue('nodegroup');
  await expect(dialog.getByRole('button', {name: /Final outbound$/})).toContainText('sg-01');
  invalid = false;
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await api.group('nodegroup')).config.final_outbound).toBe('sg-01');
  expect((await api.group('nodegroup')).members.map(member => member.name)).toEqual(['hk-01']);
});

for (const viewport of [
  {width: 1440, height: 1000, lang: 'en'},
  {width: 390, height: 844, lang: 'zh-CN'}
])
  for (const scheme of ['light', 'dark'])
    test.describe(`${viewport.width}-${viewport.lang}-${scheme}`, () => {
      test.use({viewport, storage: {'doona-lang': viewport.lang, 'doona-scheme': scheme}});
      test('create and edit dialogs fit the viewport and return keyboard focus', async ({page}, info) => {
        await mockBackend(page);
        await page.goto('/#/policies?tab=arrange');
        const labels = viewport.lang === 'en' ? en : zh;
        const create = page.getByRole('button', {name: labels['arrange.newGroup'], exact: true});
        await create.click();
        const dialog = page.getByRole('dialog');
        await dialog.focus();
        await page.keyboard.press('Tab');
        await expect(dialog.getByRole('textbox')).toBeFocused();
        await dialog.getByRole('textbox').fill('streaming');
        await dialog.getByRole('button', {name: labels['policy.addFilter'], exact: true}).click();
        await dialog.getByRole('textbox').nth(1).fill('name(hk-01)');
        await expect(page.locator('html')).toHaveAttribute('data-scheme', scheme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({path: info.outputPath('create.png')});
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(create).toBeFocused();
        await page.goto('/#/policies');
        await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), labels['policy.edit'], labels['ui.moreActions']);
        const edit = page.getByRole('dialog', {name: labels['policy.editTitle'].replace('{name}', 'proxy'), exact: true});
        await expect(edit).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({path: info.outputPath('edit.png')});
        await page.keyboard.press('Escape');
        await expect(edit).toHaveCount(0);
      });
    });
