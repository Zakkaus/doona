import type {Locator} from '@playwright/test';
import en from '../src/i18n/locales/en.json' with {type: 'json'};
import zh from '../src/i18n/locales/zh-CN.json' with {type: 'json'};
import tw from '../src/i18n/locales/zh-TW.json' with {type: 'json'};
import {expect, mockBackend, moreAction, scrollIntoList, test} from './fixtures';
import {readGroupEntries} from '../src/dae/groups';

async function expectFormGeometry(dialog: Locator) {
  const geometry = await dialog.evaluate(root => {
    const box = (element: Element) => {
      const {x, y, width, height} = element.getBoundingClientRect();
      return {x, y, right: x + width, bottom: y + height, width, height};
    };
    const section = root.querySelector('.rp-dialog-section')!;
    const blocks = Array.from(section.querySelectorAll(':scope > .rp-field, :scope > .group-dialog-filters, :scope > .rp-alert')).map(box);
    const fields = Array.from(section.querySelectorAll('.rp-field')).map(field => ({
      ...box(field),
      control: box(field.querySelector('.rp-input, .rp-selectbtn')!),
      remove: field.querySelector('.rp-toolbar button') ? box(field.querySelector('.rp-toolbar button')!) : null
    }));
    const filters = Array.from(section.querySelectorAll('.group-dialog-filter-list > .rp-field')).map(box);
    const foot = Array.from(root.querySelectorAll('.foot button')).map(box);
    const content = root.querySelector('.rp-dialog-body') ?? root;
    const help = root.querySelector('[slot="description"]');
    return {blocks, fields, filters, foot, help: help ? box(help) : null, dialog: box(root), inset: parseFloat(getComputedStyle(content).paddingInlineStart)};
  });
  const {blocks, fields, filters, foot} = geometry;
  expect(fields.length).toBeGreaterThan(1);
  for (const field of fields) {
    expect(field.x).toBeCloseTo(blocks[0].x, 1);
    expect(field.right).toBeCloseTo(blocks[0].right, 1);
    expect(field.control.x).toBeCloseTo(field.x, 1);
    if (field.remove) {
      expect(field.remove.right).toBeCloseTo(field.right, 1);
      expect(field.remove.y).toBeCloseTo(field.control.y, 1);
      expect(field.remove.height).toBeCloseTo(field.control.height, 1);
      expect(field.control.right).toBeLessThan(field.remove.x);
    } else expect(field.control.right).toBeCloseTo(field.right, 1);
  }
  for (let i = 1; i < blocks.length; i++) expect(blocks[i].y - blocks[i - 1].bottom).toBeCloseTo(8, 1);
  for (let i = 1; i < filters.length; i++) expect(filters[i].y - filters[i - 1].bottom).toBeCloseTo(8, 1);
  expect(foot).toHaveLength(2);
  expect(foot[0].height).toBeCloseTo(foot[1].height, 1);
  expect(blocks[0].x - geometry.dialog.x).toBeCloseTo(geometry.inset, 1);
  expect(geometry.dialog.right - blocks[0].right).toBeCloseTo(geometry.inset, 1);
  if (geometry.help) {
    expect(geometry.help.x).toBeCloseTo(blocks[0].x, 1);
    expect(geometry.help.right).toBeCloseTo(blocks[0].right, 1);
  }
}

test.use({storage: {'doona-lang': 'en'}});

test('Policies stages all new group fields and writes them on Apply', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/policies?tab=arrange');
  await page.getByRole('button', {name: 'New group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New group'});
  await expect(dialog).not.toHaveAttribute('aria-describedby');
  await expect(dialog.getByRole('group', {name: 'Filter', exact: true})).toHaveAccessibleDescription(en['arrange.newGroupNote']);
  const name = dialog.getByRole('textbox', {name: 'Group name'});
  await expect(name).toHaveAttribute('aria-required', 'true');
  await expect(dialog.locator('label').filter({hasText: 'Group name'})).toContainText('*');
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await name.fill('proxy');
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(name).toHaveAccessibleDescription(/already exists/);
  await name.fill('streaming');
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Filter'}).fill('name(hk-01)');
  await expect(dialog.getByRole('textbox', {name: 'Filter'})).toHaveAccessibleDescription(`${en['policy.filterHelp']} ${en['arrange.newGroupNote']}`);
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
  await expect(dialog.getByRole('textbox', {name: 'Filter'})).toHaveValue('name(hk-01)');
  await dialog.getByRole('button', {name: /Final outbound$/}).click();
  await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill('sg-01');
  const option = page.getByRole('option', {name: /^sg-01/});
  await scrollIntoList(option);
  await option.click();
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Validation found');
  await expect(dialog.getByRole('textbox', {name: 'Group name'})).toHaveValue('nodegroup');
  await expectFormGeometry(dialog);
  await expect(dialog.getByRole('button', {name: /Final outbound$/})).toContainText('sg-01');
  invalid = false;
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await api.group('nodegroup')).config.final_outbound).toBe('sg-01');
  expect((await api.group('nodegroup')).members.map(member => member.name)).toEqual(['hk-01']);
});

for (const entry of ['Nodes', 'Policies'])
  test(`${entry} creates a manual group with a default from the draft members`, async ({page}) => {
    const {api} = await mockBackend(page);
    await page.goto(entry === 'Nodes' ? '/#/nodes?provider=inline' : '/#/policies?tab=arrange');
    if (entry === 'Nodes') {
      await page.getByRole('button', {name: 'Add hk-01 to a group', exact: true}).click();
      await page.getByRole('menuitem', {name: 'New group…', exact: true}).click();
    } else await page.getByRole('button', {name: 'New group', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'New group'});
    await expect(dialog).toContainText(entry === 'Nodes' ? en['nodes.newGroupHelp'].replace('{name}', 'hk-01') : en['arrange.newGroupNote']);
    await dialog.getByRole('textbox', {name: 'Group name'}).fill('manualgroup');
    if (entry === 'Policies') await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
    const filter = dialog.getByRole('textbox', {name: 'Filter'});
    await filter.fill("name(keyword: 'hk')");
    await dialog.getByRole('button', {name: /Selection policy/}).click();
    await page.getByRole('option', {name: /^Manual/}).click();
    const picker = dialog.getByRole('button', {name: /Default member$/});
    await picker.click();
    await expect(page.getByRole('option', {name: /^hk-01/})).toBeVisible();
    await expect(page.getByRole('option', {name: /^sg-01/})).toHaveCount(0);
    await page.keyboard.press('Escape');
    await filter.fill('name(hk-02)');
    await picker.click();
    await expect(page.getByRole('option', {name: /^hk-01/})).toHaveCount(0);
    await page.getByRole('option', {name: /^hk-02/}).click();
    await dialog.getByRole('button', {name: 'Create', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    if (entry === 'Policies') {
      await page.getByRole('button', {name: 'Review and apply'}).click();
      const review = page.getByRole('dialog', {name: 'Review changes'});
      await expect(review).toContainText('default: hk-02');
      await review.getByRole('button', {name: 'Apply', exact: true}).click();
      await expect(review).toHaveCount(0);
    }
    await expect.poll(async () => (await api.group('manualgroup')).config.default_member_id).toBe('hk-02');
    expect((await api.group('manualgroup')).members.map(member => member.name)).toEqual(['hk-02']);
    const main = (await api.config()).sources.find(source => source.kind === 'main')!;
    expect(readGroupEntries(main.content).find(entry => entry.name === 'manualgroup')).toMatchObject({
      filters: ['name(hk-02)'],
      policy: 'select',
      default: 'hk-02'
    });
  });

for (const lang of ['en', 'zh-CN'])
  test.describe(`unquotable-${lang}`, () => {
    test.use({storage: {'doona-lang': lang}});
    test('Nodes explains an unquotable name without opening a group dialog', async ({page}) => {
      const {api, handlers, requests} = await mockBackend(page);
      const labels = lang === 'en' ? en : zh;
      handlers['GET nodes'] = async () => {
        const list = await api.nodes({limit: 1000});
        return {...list, nodes: list.nodes.map(node => (node.id === 'hk-01' ? {...node, name: "O'Hare"} : node))};
      };
      await page.goto('/#/nodes?provider=inline');
      await page.getByRole('button', {name: labels['nodes.joinGroup'].replace('{name}', "O'Hare"), exact: true}).click();
      await page.getByRole('menuitem', {name: labels['nodes.newGroup'], exact: true}).click();
      await expect(page.locator('.rp-toast.negative')).toContainText(labels['config.unquotable']);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
    });
  });

for (const viewport of [
  {width: 1440, height: 1000},
  {width: 390, height: 844}
])
  for (const lang of ['en', 'zh-CN'])
    test.describe(`${viewport.width}-${lang}`, () => {
      const scheme = lang === 'en' ? 'light' : 'dark';
      test.use({viewport, storage: {'doona-lang': lang, 'doona-scheme': scheme}});
      test('create and edit dialogs fit the viewport and return keyboard focus', async ({page}, info) => {
        await mockBackend(page);
        await page.goto('/#/policies?tab=arrange');
        const labels = lang === 'en' ? en : zh;
        const create = page.getByRole('button', {name: labels['arrange.newGroup'], exact: true});
        await create.click();
        const dialog = page.getByRole('dialog', {name: labels['arrange.newGroup'], exact: true});
        await dialog.focus();
        await page.keyboard.press('Tab');
        await expect(dialog.locator('.rp-dialog-body')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(dialog.getByRole('textbox')).toBeFocused();
        const final = dialog.getByRole('button', {name: new RegExp(`${labels['policy.cfg.finalOutbound']}$`)});
        await expect(final).toContainText(labels['ui.none']);
        await final.click();
        await page.getByRole('option', {name: labels['ui.none'], exact: true}).click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole('textbox').fill('streaming');
        await dialog.getByRole('button', {name: labels['policy.addFilter'], exact: true}).click();
        await dialog.getByRole('textbox').nth(1).fill('name(hk-01)');
        await expect(page.locator('html')).toHaveAttribute('data-scheme', scheme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.mouse.move(0, 0);
        await expectFormGeometry(dialog);
        await expect(dialog.getByRole('button', {name: labels['arrange.create'], exact: true})).toBeEnabled();
        await page.screenshot({path: info.outputPath('create-auto.png')});
        await dialog.getByRole('button', {name: labels['policy.addFilter'], exact: true}).click();
        await expect(dialog.getByRole('textbox', {name: labels['policy.filterN'].replace('{n}', '1'), exact: true})).toBeVisible();
        await expect(dialog.getByText(labels['policy.filterHelp'], {exact: false})).toHaveCount(1);
        await expectFormGeometry(dialog);
        await dialog.getByRole('button', {name: labels['policy.removeFilter'].replace('{n}', '2'), exact: true}).click();
        await expect(dialog.getByRole('textbox', {name: labels['ui.filter'], exact: true})).toBeVisible();
        const policy = dialog.getByRole('button', {name: new RegExp(labels['arrange.policy'])});
        await policy.click();
        await page.getByRole('option', {name: new RegExp(`^${labels['policy.kind.selector']}`)}).click();
        await expect(dialog.getByRole('button', {name: new RegExp(`${labels['policy.cfg.defaultMember']}$`)})).toBeVisible();
        await expect(page.locator('.rp-popover')).toHaveCount(0);
        await dialog.focus();
        await page.mouse.move(0, 0);
        await expectFormGeometry(dialog);
        await page.screenshot({path: info.outputPath('create-manual.png')});
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(create).toBeFocused();
        await page.goto('/#/policies');
        await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), labels['policy.edit'], labels['ui.moreActions']);
        const edit = page.getByRole('dialog', {name: labels['policy.editTitle'].replace('{name}', 'proxy'), exact: true});
        await expect(edit).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const heading = (await edit.getByRole('heading', {name: labels['policy.liveConfig']}).boundingBox())!;
        const help = (await edit.getByText(labels['policy.finalOutboundHelp'], {exact: true}).boundingBox())!;
        expect(heading.y - help.y - help.height).toBeGreaterThanOrEqual(16);
        await page.mouse.move(0, 0);
        await expectFormGeometry(edit);
        await page.screenshot({path: info.outputPath('edit.png')});
        await page.keyboard.press('Escape');
        await expect(edit).toHaveCount(0);
      });
    });

for (const lang of ['en', 'zh-CN', 'zh-TW'])
  for (const scheme of ['light', 'dark'])
    test.describe(`390-${lang}-${scheme}-scroll`, () => {
      test.use({viewport: {width: 390, height: 844}, storage: {'doona-lang': lang, 'doona-scheme': scheme}});
      test('five filters scroll between a fixed title and footer without clipping picker values', async ({page}, info) => {
        await mockBackend(page);
        const labels = lang === 'en' ? en : lang === 'zh-CN' ? zh : tw;
        await page.goto('/#/policies?tab=arrange');
        await page.getByRole('button', {name: labels['arrange.newGroup'], exact: true}).click();
        const dialog = page.getByRole('dialog', {name: labels['arrange.newGroup'], exact: true});
        await dialog.getByRole('textbox').fill('streaming');
        const policy = dialog.getByRole('button', {name: new RegExp(labels['arrange.policy'])});
        await policy.click();
        await page.getByRole('option', {name: new RegExp(`^${labels['policy.kind.selector']}`)}).click();
        for (let i = 0; i < 5; i++) {
          await dialog.getByRole('button', {name: labels['policy.addFilter'], exact: true}).click();
          await dialog
            .getByRole('textbox')
            .nth(i + 1)
            .fill(`name(keyword: 'region-${i}')`);
        }
        const body = dialog.locator('.rp-dialog-body');
        await expect(body).toHaveAttribute('data-overflow', 'true');
        await body.focus();
        await page.keyboard.press('Home');
        await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0);
        const title = dialog.getByRole('heading', {name: labels['arrange.newGroup'], exact: true});
        const footer = dialog.locator('.foot');
        const titleBox = (await title.boundingBox())!;
        const footerBox = (await footer.boundingBox())!;
        for (const end of ['top', 'bottom']) {
          if (end === 'bottom') {
            await page.keyboard.press('End');
            await expect.poll(() => body.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
            expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
          }
          await expect(title).toBeInViewport({ratio: 1});
          await expect(dialog.getByRole('button', {name: labels['ui.cancel'], exact: true})).toBeInViewport({ratio: 1});
          await expect(dialog.getByRole('button', {name: labels['arrange.create'], exact: true})).toBeInViewport({ratio: 1});
          expect(await title.boundingBox()).toEqual(titleBox);
          expect(await footer.boundingBox()).toEqual(footerBox);
          const pickers =
            end === 'top'
              ? [policy]
              : [
                  dialog.getByRole('button', {name: new RegExp(`${labels['policy.cfg.defaultMember']}$`)}),
                  dialog.getByRole('button', {name: new RegExp(`${labels['policy.cfg.finalOutbound']}$`)})
                ];
          const contentBox = (await body.boundingBox())!;
          for (const picker of pickers) {
            const box = (await picker.boundingBox())!;
            expect(box.y).toBeGreaterThanOrEqual(contentBox.y);
            expect(box.y + box.height).toBeLessThanOrEqual(contentBox.y + contentBox.height);
            expect(await picker.locator('.rp-truncate').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
          }
          expect(await body.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
          await page.mouse.move(0, 0);
          await page.screenshot({path: info.outputPath(`five-filters-${end}.png`)});
        }
      });
    });
