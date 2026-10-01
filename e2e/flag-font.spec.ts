import {test, expect, mockBackend, query} from './fixtures';

test('Chromium renders regional indicators with the self-hosted colour flag font', async ({page, context}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET nodes'] = async request => {
    const list = await api.nodes(query(request));
    return {...list, nodes: list.nodes.map(node => (node.id === 'jp-01' ? {...node, name: '🇯🇵 Japan'} : node))};
  };
  await page.goto('/#/nodes?tab=list&provider=inline&q=Japan');
  const name = page.locator('.rp-table').last().locator('.rp-truncate', {hasText: '🇯🇵 Japan'}).first();
  await expect(name).toBeVisible();
  await page.evaluate(() => document.fonts.load('14px "Twemoji Country Flags"', '🇯🇵'));
  expect(await page.evaluate(() => document.fonts.check('14px "Twemoji Country Flags"', '🇯🇵'))).toBe(true);
  expect(await name.evaluate(node => getComputedStyle(node).fontFamily)).toMatch(/^"Twemoji Country Flags",/);
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const {root} = await cdp.send('DOM.getDocument');
  const {nodeIds} = await cdp.send('DOM.querySelectorAll', {nodeId: root.nodeId, selector: '.rp-table .rp-truncate'});
  let found = false;
  for (const nodeId of nodeIds) {
    const {outerHTML} = await cdp.send('DOM.getOuterHTML', {nodeId});
    if (!outerHTML.includes('🇯🇵 Japan')) continue;
    const {fonts} = await cdp.send('CSS.getPlatformFontsForNode', {nodeId});
    found = fonts.some(font => ['Twemoji Mozilla', 'Twemoji Country Flags'].includes(font.familyName) && font.isCustomFont && font.glyphCount > 0);
  }
  expect(found).toBe(true);
  // The build's worker precaches the asset, including for a first flagged name encountered offline.
  const worker = await (await page.request.get('/sw.js')).text();
  expect(worker).toMatch(/assets\/TwemojiCountryFlags-[^']+\.woff2/);
  await page.goto('/#/config?tab=source');
  await expect(page.locator('.cm-content[contenteditable=true]')).toBeVisible();
  expect(await page.locator('.cm-content').evaluate(node => getComputedStyle(node).fontFamily)).toMatch(/^"Twemoji Country Flags",/);
});
