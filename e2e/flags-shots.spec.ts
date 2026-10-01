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
