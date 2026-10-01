import {test, expect, moreAction} from './fixtures';
import {mockBackend} from './flag-fixtures';

const env = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env ?? {};
const shot = env.DOONA_FLAGS_SHOTS;
const directory = env.DOONA_FLAGS_SHOTS_DIR;
for (const [variant, lang, scheme, width] of [
  ['desktop-en-light', 'en', 'light', 1440],
  ['desktop-en-dark', 'en', 'dark', 1440],
  ['phone-zh-CN-light', 'zh-CN', 'light', 390]
] as const)
  for (const enabled of [false, true])
    test(`flag screenshots ${variant} ${enabled ? 'on' : 'off'}`, async ({page}) => {
      test.skip(!shot || !directory, 'Opt-in screenshot matrix: set DOONA_FLAGS_SHOTS and DOONA_FLAGS_SHOTS_DIR');
      await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
      await page.addInitScript(
        ({lang, scheme, enabled}) => {
          localStorage.setItem('doona-lang', lang);
          localStorage.setItem('doona-scheme', scheme);
          localStorage.setItem('doona-country-flags', enabled ? 'on' : 'off');
        },
        {lang, scheme, enabled}
      );
      const {api, handlers} = await mockBackend(page);
      const names = new Map([
        ['hk-01', '🇭🇰 Hong Kong 01'],
        ['hk-02', 'Hong Kong 02'],
        ['sg-01', 'Singapore 01'],
        ['us-01', '🇺🇸 US 01'],
        ['jp-01', '日本 JP 01'],
        ['mo-01', 'Macau 01']
      ]);
      handlers['GET nodes'] = async () => {
        const list = await api.nodes({limit: 1000});
        return {
          ...list,
          next_cursor: null,
          nodes: [...list.nodes, {...list.nodes[0], id: 'mo-01', name: 'Macau 01', provider_id: 'inline', group_ids: ['proxy']}]
            .filter(node => names.has(node.id))
            .map(node => ({...node, name: names.get(node.id)!}))
        };
      };
      handlers['GET groups/proxy'] = async () => {
        const list = await api.group('proxy');
        return {...list, members: list.members.map(member => ({...member, name: names.get(member.id) ?? member.name}))};
      };
      await page.goto('/#/nodes?tab=list&provider=inline');
      await expect(page.locator('.rp-table').last()).toContainText('Hong Kong 02');
      if (width === 390) await page.locator('.rp-table').last().scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      const tableGap = enabled
        ? await page
            .locator('.rp-table .rp-node-flag')
            .first()
            .evaluate(node => getComputedStyle(node).marginInlineEnd)
        : null;
      await page.screenshot({path: `${directory}/nodes-${shot}-${variant}-${enabled ? 'on' : 'off'}.png`});
      await page.goto('/#/policies');
      const proxy = page.getByRole('region', {name: 'proxy', exact: true});
      await moreAction(proxy, lang === 'en' ? 'Edit group' : '编辑群组', lang === 'en' ? 'More actions' : '更多操作');
      await page.getByRole('button', {name: lang === 'en' ? /Final outbound$/ : /最终出站$/}).click();
      await page.getByRole('searchbox', {name: lang === 'en' ? 'Filter outbounds' : '筛选出站', exact: true}).fill('');
      await expect(page.getByRole('option', {name: /Hong Kong 02/})).toBeVisible();
      await expect(page.getByRole('option', {name: /Macau 01/})).toBeVisible();
      await page.getByRole('option', {name: /Macau 01/}).scrollIntoViewIfNeeded();
      if (enabled) {
        const tableFlag = page.getByRole('option', {name: /Macau 01/}).locator('.rp-node-flag');
        const gap = await tableFlag.evaluate(node => getComputedStyle(node).marginInlineEnd);
        expect(gap).toBe(tableGap);
        expect(gap).toBe('4px');
        const edge = await tableFlag.evaluate(node => getComputedStyle(node).filter);
        if (scheme === 'light') expect(edge).toContain('drop-shadow');
        else expect(edge).toBe('none');
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path: `${directory}/picker-${shot}-${variant}-${enabled ? 'on' : 'off'}.png`});
      await page.goto('/#/settings?card=appearance');
      const toggle = page.getByRole('switch', {name: lang === 'en' ? 'Show country flags' : '显示国旗', exact: true});
      await expect(toggle).toBeVisible();
      await toggle.scrollIntoViewIfNeeded();
      const alignment = await toggle.evaluate(node => {
        const row = node.closest('.rp-field')!;
        const next = row.nextElementSibling!;
        const track = row.querySelector('.track')!.getBoundingClientRect();
        const neighbour = next.querySelector('.track')!.getBoundingClientRect();
        return {
          trackLeft: track.left === neighbour.left,
          trackWidth: track.width === neighbour.width,
          trackHeight: track.height === neighbour.height,
          helpLeft: row.querySelector('.rp-label')!.getBoundingClientRect().left === next.querySelector('.rp-label')!.getBoundingClientRect().left
        };
      });
      expect(alignment).toEqual({trackLeft: true, trackWidth: true, trackHeight: true, helpLeft: true});
      await page.screenshot({path: `${directory}/settings-${shot}-${variant}-${enabled ? 'on' : 'off'}.png`});
    });

for (const [width, scheme] of [
  [1440, 'light'],
  [1440, 'dark'],
  [390, 'light'],
  [390, 'dark']
] as const)
  test(`owner flag review ${width} ${scheme}`, async ({page}) => {
    test.skip(!env.DOONA_FLAGS_REVIEW || !directory, 'Opt-in owner screenshot review');
    await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
    await page.addInitScript(
      ({scheme}) => {
        localStorage.setItem('doona-lang', 'zh-TW');
        localStorage.setItem('doona-scheme', scheme);
      },
      {scheme}
    );
    await mockBackend(page);
    await page.goto('/#/nodes?provider=inline');
    await expect(page.getByRole('rowheader', {name: 'hk-01', exact: true})).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.rp-table').last().scrollIntoViewIfNeeded();
    const prefix = env.DOONA_FLAGS_BASELINE ? 'main' : 'after';
    await page.screenshot({path: `${directory}/${prefix}-nodes-${width}-${scheme}.png`});
    console.log(
      JSON.stringify(
        await page
          .locator('.rp-table')
          .last()
          .evaluate(table => {
            const row = [...table.querySelectorAll('[role="row"]')].find(row => row.querySelector('[role="rowheader"]')?.textContent === 'hk-01')!;
            const buttons = [...row.querySelectorAll('button')].map(button => ({
              label: button.getAttribute('aria-label') ?? button.textContent,
              width: button.getBoundingClientRect().width,
              height: button.getBoundingClientRect().height,
              text: button.textContent
            }));
            return {viewport: innerWidth, tableWidth: table.clientWidth, tableScrollWidth: table.scrollWidth, buttons};
          })
      )
    );

    if (env.DOONA_FLAGS_BASELINE) return;
    await page.goto('/#/policies?tab=arrange');
    await expect(page.locator('.rp-drop').filter({has: page.getByRole('heading', {name: 'resilient', exact: true})})).toContainText('hk-01');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: `${directory}/after-group-${width}-${scheme}.png`, fullPage: true});
    await page.goto('/#/policies');
    await expect(page.getByRole('region', {name: 'proxy', exact: true})).toContainText('hk-01');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: `${directory}/after-policies-${width}-${scheme}.png`, fullPage: true});
    await page.goto('/#/nodes?provider=inline&q=hk-01');
    if (width === 1440 && scheme === 'light') {
      const row = page.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})});
      await row.click();
      const details = page.getByRole('region', {name: '節點詳細資料', exact: true});
      await details.scrollIntoViewIfNeeded();
      await page.screenshot({path: `${directory}/node-details.png`});
      await row.click();
    }
    await page.getByRole('button', {name: '節點操作', exact: true}).click();
    if (width === 390 && scheme === 'light') await page.screenshot({path: `${directory}/node-actions.png`});
    await page.getByRole('menuitem', {name: '更換國旗…', exact: true}).click();
    await page.getByRole('dialog').getByRole('button', {name: /國旗/}).click();
    await expect(page.getByRole('option', {name: '不顯示國旗', exact: true})).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: `${directory}/after-picker-${width}-${scheme}.png`});
  });

for (const [width, scheme] of [
  [1440, 'light'],
  [1440, 'dark'],
  [390, 'light'],
  [390, 'dark']
] as const)
  test(`closing flag review ${width} ${scheme}`, async ({page}) => {
    test.skip(!env.DOONA_FLAGS_REVIEW || !directory, 'Opt-in closing screenshot review');
    await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
    await page.addInitScript(scheme => {
      localStorage.setItem('doona-lang', 'zh-TW');
      localStorage.setItem('doona-scheme', scheme);
    }, scheme);
    const {api, handlers} = await mockBackend(page);
    handlers['GET nodes'] = async () => {
      const list = await api.nodes({limit: 1000});
      return {...list, nodes: list.nodes.map(node => (node.id === 'jp-01' ? {...node, name: '🇯🇵 jp-01'} : node))};
    };
    handlers['GET groups/proxy'] = async () => {
      const group = await api.group('proxy');
      return {...group, config: {...group.config, default_member_id: 'hk-01', final_outbound: 'hk-01'}};
    };
    const snap = async (name: string, target: typeof page | ReturnType<typeof page.locator>) => {
      if (name !== 'actions') {
        await page.mouse.move(width - 4, 80);
      }
      await page.evaluate(() => document.fonts.ready);
      await target.screenshot({path: `${directory}/closing-${name}-${width}-${scheme}.png`});
    };
    await page.goto('/#/nodes?provider=inline&q=hk-01');
    const row = page.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})});
    const actions = row.getByRole('button', {name: '節點操作', exact: true});
    await actions.scrollIntoViewIfNeeded();
    await row.focus();
    for (let i = 0; i < 12 && !(await actions.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('ArrowRight');
    await expect(actions).toBeFocused();
    await expect(page.getByRole('tooltip', {name: '節點操作', exact: true})).toBeVisible();
    await snap('actions', width === 390 ? page : row);
    await row.click();
    const details = page.getByRole('region', {name: '節點詳細資料', exact: true});
    await details.scrollIntoViewIfNeeded();
    await snap('details', details);
    await row.click();
    await row.getByRole('button', {name: '節點操作', exact: true}).click();
    await snap('menu', page.getByRole('menu'));
    await page.getByRole('menuitem', {name: '更換國旗…', exact: true}).click();
    await snap('help', page.getByRole('dialog', {name: '更換國旗…', exact: true}));
    await page.getByRole('dialog', {name: '更換國旗…', exact: true}).getByRole('button', {name: /國旗/}).click();
    await expect(page.getByRole('option', {name: '不顯示國旗', exact: true})).toBeVisible();
    await snap('picker', page.locator('.rp-search-popover'));
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', {name: '更換國旗…', exact: true}).getByText('關閉', {exact: true}).click();
    await page.goto('/#/nodes?provider=inline&q=jp-01');
    const embedded = page.getByRole('row').filter({has: page.getByRole('rowheader', {name: '🇯🇵 jp-01', exact: true})});
    await embedded.getByRole('button', {name: '節點操作', exact: true}).click();
    await page.getByRole('menuitem', {name: '更換國旗…', exact: true}).click();
    await expect(page.getByRole('dialog', {name: '更換國旗…', exact: true}).getByRole('button', {name: /國旗/})).toBeDisabled();
    await snap('embedded', page.getByRole('dialog', {name: '更換國旗…', exact: true}));
    await page.getByRole('dialog', {name: '更換國旗…', exact: true}).getByText('關閉', {exact: true}).click();
    await page.goto('/#/activity');
    await expect(page.locator('.rp-latency .rp-select')).toContainText('hk-01');
    await snap('activity', page.locator('.rp-latency'));
    await page.goto('/#/policies');
    await moreAction(page.getByRole('region', {name: 'proxy', exact: true}), '編輯群組', '更多操作');
    const policyDialog = page.getByRole('dialog', {name: '編輯群組 proxy', exact: true});
    await expect(policyDialog.locator('.rp-kv .rp-node-flag')).toHaveCount(2);
    await snap('outbound', policyDialog);
  });
