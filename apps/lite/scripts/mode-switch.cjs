const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const records = [];
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function geometry(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-page-frame]:not([hidden])');
    const visible = selector => [...document.querySelectorAll(selector)].find(e => e.checkVisibility());
    const toolbar = visible('[data-page-header] .astryx-segmented-control');
    const heading = visible('[data-editor-content] h2');
    const box = e => {
      const {x, y, width, height} = e.getBoundingClientRect();
      return {x, y, width, height};
    };
    if (!frame || !heading || !toolbar) throw new Error('Missing page heading or toolbar');
    return {
      header: box(visible('[data-page-header]')),
      heading: box(heading),
      headingBlock: box(heading.parentElement),
      toolbar: box(toolbar),
      ...Object.fromEntries([...toolbar.querySelectorAll('button,[role="radio"]')].map(button => [button.textContent.trim(), box(button)]))
    };
  });
}
function equalBoxes(before, after) {
  expect(Object.keys(after)).toEqual(Object.keys(before));
  for (const name of Object.keys(before))
    for (const axis of ['x', 'y', 'width', 'height']) expect(Math.abs(after[name][axis] - before[name][axis]), `${name}.${axis}`).toBeLessThanOrEqual(1);
}
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({viewport: {width, height: 900}, locale: 'zh-CN', reducedMotion: 'reduce'});
      page.setDefaultTimeout(15000);
      await page.addInitScript(() => {
        localStorage.setItem('doona-lite.locale', 'zh-CN');
        localStorage.setItem('doona-lite.theme', 'light');
        window.modeShifts = [];
        window.modeShiftObserver = new PerformanceObserver(list =>
          window.modeShifts.push(...list.getEntries().map(e => ({value: e.value, hadRecentInput: e.hadRecentInput})))
        );
        window.modeShiftObserver.observe({type: 'layout-shift', buffered: true});
      });
      await page.goto(base);
      await waitForDemo(page);
      for (const route of ['routing', 'dns']) {
        await page.evaluate(route => (location.hash = route), route);
        await page
          .locator(`${route === 'routing' ? '[data-rule-index]' : '[data-upstream]'}:visible`)
          .first()
          .waitFor();
        await settle(page);
        const toolbar = page.locator('[data-page-header]:visible .astryx-segmented-control').first();
        const visual = await geometry(page);
        const screenshot = async mode => {
          if (width === 1440 && process.env.LITE_MODE_SHOTS) {
            fs.mkdirSync(process.env.LITE_MODE_SHOTS, {recursive: true});
            await page.screenshot({path: path.join(process.env.LITE_MODE_SHOTS, `${route}-${mode}.png`)});
          }
        };
        await screenshot('visual');
        await page.evaluate(() => {
          window.modeShiftObserver.takeRecords();
          window.modeShifts = [];
        });
        await toolbar.getByRole('radio', {name: '文本', exact: true}).click();
        await page.locator('[data-code-editor]:visible .cm-content').waitFor();
        await settle(page);
        await page.waitForTimeout(600);
        const text = await geometry(page);
        const shifts = await page.evaluate(() => {
          window.modeShifts.push(...window.modeShiftObserver.takeRecords().map(e => ({value: e.value, hadRecentInput: e.hadRecentInput})));
          return window.modeShifts;
        });
        const cls = shifts.filter(e => !e.hadRecentInput).reduce((sum, e) => sum + e.value, 0);
        records.push({width, route, visual, text, cls, shifts});
        equalBoxes(visual, text);
        expect(cls, `${route} ${width} toggle CLS`).toBe(0);
        await expect(page.locator('h2:visible')).toHaveText(route === 'routing' ? ['模式', '路由规则'] : ['DNS 配置']);
        if (route === 'routing') await expect(toolbar.getByRole('textbox')).toHaveCount(0);
        if (route === 'dns' && width === 1440) {
          const lines = await page
            .locator('h2:visible')
            .first()
            .evaluate(heading => {
              const help = heading.nextElementSibling;
              const range = document.createRange();
              range.selectNodeContents(help);
              return new Set([...range.getClientRects()].filter(r => r.width).map(r => Math.round(r.y))).size;
            });
          expect(lines).toBe(1);
        }
        await screenshot('text');
        await toolbar.getByRole('radio', {name: '可视化', exact: true}).click();
        await page
          .locator(`${route === 'routing' ? '[data-rule-index]' : '[data-upstream]'}:visible`)
          .first()
          .waitFor();
        await settle(page);
        equalBoxes(visual, await geometry(page));
        await toolbar.getByRole('radio', {name: '文本', exact: true}).click();
        await page.locator('[data-code-editor]:visible .cm-content').waitFor();
        if (route === 'routing') {
          // Text mode edits the rules directly, so the visual-only actions are hidden.
          await expect(page.getByRole('button', {name: '用模板重建规则', exact: true})).not.toBeVisible();
          await expect(page.locator('[data-page-header]:visible').getByRole('button', {name: '添加规则', exact: true})).not.toBeVisible();
          await page.locator('[data-mode="direct"]').click();
          await expect(page.locator('[data-code-editor]:visible .cm-content')).toBeVisible();
          await page.locator('[data-mode="rule"]').click();
          await expect(page.locator('[data-draft-bar]')).not.toBeVisible();
        } else {
          const add = '添加 DNS 服务器';
          await page.locator('[data-page-header]:visible').getByRole('button', {name: add, exact: true}).click();
          await expect(page.getByRole('dialog', {name: add, exact: true})).toBeVisible();
          await expect(page.locator('[data-code-editor]:visible')).toHaveCount(0);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog', {name: add, exact: true})).not.toBeVisible();
        }
        console.log(`PASS ${route} ${width}: stable header, heading, toolbar buttons; CLS 0; text-mode actions`);
      }
      await page.close();
    }
  } finally {
    if (process.env.LITE_MODE_OUTPUT) fs.writeFileSync(process.env.LITE_MODE_OUTPUT, JSON.stringify(records, null, 2));
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
