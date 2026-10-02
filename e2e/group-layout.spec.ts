import type {Locator} from '@playwright/test';
import {expect, mockBackend, test} from './fixtures';

async function alignedForm(dialog: Locator, editing = true) {
  const result = await dialog
    .locator('form > section')
    .first()
    .evaluate(section => {
      const x = section.getBoundingClientRect().left;
      const children = [...section.children].filter(element => element.getBoundingClientRect().height > 0);
      const controls = [...section.querySelectorAll('.rp-field-help, .rp-disclosure-trigger > svg')];
      return [...children, ...controls].map(element => ({
        kind: element.getAttribute('class') ?? element.tagName,
        offset: element.getBoundingClientRect().left - x
      }));
    });
  expect(result.length).toBeGreaterThan(6);
  for (const item of result) expect(Math.abs(item.offset), item.kind).toBeLessThanOrEqual(1);
  const help = dialog.locator('.rp-field-help');
  await expect(help.getByRole('status')).toBeVisible();
  if (!editing) return;
  await expect(help.getByRole('link')).toHaveClass(/rp-btn/);
  const row = await help.evaluate(element => {
    const [count, action] = [...element.children].map(child => child.getBoundingClientRect());
    return Math.abs(count.top + count.height / 2 - action.top - action.height / 2);
  });
  expect(row).toBeLessThanOrEqual(1);
}

for (const width of [1440, 390]) {
  for (const scheme of ['light', 'dark']) {
    test(`${width} ${scheme} group create and edit share the form inset and disclosure style`, async ({page}) => {
      await page.setViewportSize({width, height: 1000});
      await page.addInitScript(scheme => {
        localStorage.setItem('doona-lang', 'zh-TW');
        localStorage.setItem('doona-scheme', scheme);
      }, scheme);
      await mockBackend(page);
      await page.goto('/#/policies?group=proxy');
      const edit = page.getByRole('region', {name: 'proxy', exact: true}).getByRole('button', {name: '編輯群組', exact: true});
      const iconSize = await edit.evaluate(button => ({
        lineHeight: parseFloat(getComputedStyle(button).lineHeight),
        width: button.querySelector('svg')!.getBoundingClientRect().width,
        height: button.querySelector('svg')!.getBoundingClientRect().height
      }));
      expect(iconSize.width).toBe(iconSize.lineHeight);
      expect(iconSize.height).toBe(iconSize.lineHeight);
      await edit.click();
      let dialog = page.getByRole('dialog');
      await alignedForm(dialog);
      const disclosures = dialog.locator('form > section > .rp-disclosure');
      await expect(disclosures).toHaveCount(2);
      const paint = await disclosures.locator(':scope > h3 > button').evaluateAll(buttons =>
        buttons.map(button => {
          const style = getComputedStyle(button);
          return [style.backgroundColor, style.paddingInlineStart, style.height];
        })
      );
      expect(paint[0]).toEqual(paint[1]);
      await dialog.getByRole('button', {name: '取消', exact: true}).click();
      await page.getByRole('button', {name: '新增群組', exact: true}).click();
      dialog = page.getByRole('dialog');
      await alignedForm(dialog, false);
    });
  }

  test(`${width} detail tags wrap inside the scroll content edge`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    const {api, handlers} = await mockBackend(page);
    handlers['GET nodes'] = async () => {
      const list = await api.nodes({limit: 1000});
      return {
        ...list,
        nodes: list.nodes.map(node =>
          node.id === 'hk-01'
            ? {...node, group_ids: ['proxy', 'auto', 'gaming', ...Array.from({length: 24}, (_, i) => `group-${i}`), 'group-' + 'W'.repeat(80)]}
            : node
        )
      };
    };
    for (const route of ['nodes?provider=inline&q=hk-01', 'connections?id=1', 'flows?tab=records&id=flow-1']) {
      handlers['GET flows/flow-1'] = () => api.flow('flow-1');
      await page.goto('/#/' + route);
      if (route.startsWith('nodes')) await page.getByRole('rowheader', {name: 'hk-01', exact: true}).click();
      const panel = route.startsWith('nodes') ? page.locator('.rp-table-detail') : width === 390 ? page.getByRole('dialog') : page.locator('.rp-panel');
      await expect(panel.locator('.rp-tag').first()).toBeVisible();
      if (route.startsWith('nodes')) {
        const group = panel.getByRole('group', {name: 'Groups', exact: true});
        const wrapping = await group.evaluate(element => ({
          overflow: element.scrollWidth - element.clientWidth,
          rows: new Set([...element.children].map(tag => Math.round(tag.getBoundingClientRect().top))).size
        }));
        expect(wrapping.overflow).toBeLessThanOrEqual(1);
        expect(wrapping.rows).toBeGreaterThan(1);
      }
      const bounds = await panel.evaluate(panel => {
        const ancestors: Element[] = [];
        for (let element = panel.parentElement; element; element = element.parentElement) ancestors.push(element);
        const scroller =
          [panel, ...panel.querySelectorAll('*'), ...ancestors].find(element => /auto|scroll/.test(getComputedStyle(element).overflowY)) ??
          document.scrollingElement!;
        const box = scroller.getBoundingClientRect();
        const style = getComputedStyle(scroller);
        const left = box.left + scroller.clientLeft + parseFloat(style.paddingLeft);
        const right = box.left + scroller.clientLeft + scroller.clientWidth - parseFloat(style.paddingRight);
        return [...panel.querySelectorAll('.rp-tag')].map(tag => {
          const group = tag.closest('.rp-tags')?.getBoundingClientRect();
          return {
            left: tag.getBoundingClientRect().left - Math.max(left, group?.left ?? left),
            right: Math.min(right, group?.right ?? right) - tag.getBoundingClientRect().right
          };
        });
      });
      for (const box of bounds) {
        expect(box.left, route).toBeGreaterThanOrEqual(-1);
        expect(box.right, route).toBeGreaterThanOrEqual(-1);
      }
    }
  });
}

test('editor node options, selected tags and matching names retain flag overrides', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-flag-overrides', JSON.stringify({'node:hk-01': 'TW'})));
  await mockBackend(page);
  await page.goto('/#/policies?group=gaming');
  await page.getByRole('region', {name: 'gaming', exact: true}).getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: 'Nodes', exact: true}).click();
  const option = page.getByRole('option', {name: 'hk-01', exact: true});
  await expect(option.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
  await option.click();
  await page.keyboard.press('Escape');
  const selected = dialog.getByRole('group', {name: 'Includes', exact: true}).locator('.rp-tag').filter({hasText: 'hk-01'});
  await expect(selected.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
  await dialog.getByRole('button', {name: 'Matching nodes', exact: true}).click();
  const matching = dialog.getByRole('group', {name: 'Matching nodes', exact: true}).locator('.rp-tag').filter({hasText: 'hk-01'});
  await expect(matching.locator('.rp-node-flag')).toHaveAttribute('data-flag', '🇹🇼');
});
