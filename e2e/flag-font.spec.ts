import {test, expect, mockBackend, query} from './fixtures';

for (const lang of ['zh-TW', 'zh-CN']) {
  test(`Noto slices are self-hosted and retain the ${lang} font stack`, async ({page}) => {
    await mockBackend(page);
    await page.addInitScript(lang => localStorage.setItem('doona-lang', lang), lang);
    const fonts = new Set<string>();
    page.on('request', request => {
      if (request.resourceType() === 'font') fonts.add(request.url());
    });
    await page.goto('/#/settings');
    await expect(page.locator('#settings-backend')).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const family = lang === 'zh-TW' ? '"Noto Sans TC"' : '"Noto Sans SC", "Noto Sans TC"';
    const stacks = await page.locator('body, h1, h2, h3').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontFamily));
    expect(stacks.every(stack => stack === `"Twemoji Country Flags", ${family}, system-ui, sans-serif`)).toBe(true);
    const faces = await page.evaluate(() =>
      [...document.fonts]
        .filter(face => face.family.includes('Noto Sans'))
        .map(face => ({weight: face.weight, display: face.display, range: face.unicodeRange}))
    );
    expect(faces.length).toBeGreaterThan(1);
    expect(faces.every(face => face.weight === '100 900' && face.display === 'optional' && face.range !== 'U+0-10FFFF')).toBe(true);
    const slices = [...fonts].filter(url => new URL(url).pathname.includes('/fonts/'));
    expect(slices.length).toBeGreaterThan(0);
    expect(slices.length).toBeLessThan(faces.length);
    for (const url of slices) {
      expect(new URL(url).origin).toBe(new URL(page.url()).origin);
      expect(new URL(url).pathname).toMatch(/\/fonts\/noto-sans-(tc|sc)-.+\.woff2$/);
    }
    const worker = await (await page.request.get('/sw.js')).text();
    expect(worker).not.toMatch(/fonts\/noto-sans-/);
  });
}

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
