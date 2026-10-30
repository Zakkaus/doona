const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const shots = process.env.LITE_SHOTS_DIR;
if (shots) fs.mkdirSync(shots, {recursive: true});

async function toastHit(page) {
  const toast = page.locator('.astryx-toast');
  await expect(toast).toBeVisible();
  await toast.evaluate(async element => {
    await Promise.all(element.parentElement.parentElement.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => {})));
  });
  await expect
    .poll(() =>
      toast.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })
    )
    .toBe(true);
  return toast.boundingBox();
}
async function demo(browser, width, theme) {
  const page = await browser.newPage({viewport: {width, height: 844}, locale: 'zh-CN', hasTouch: width === 390, isMobile: width === 390});
  await page.addInitScript(theme => {
    localStorage.setItem('doona-lite.locale', 'zh-CN');
    localStorage.setItem('doona-lite.theme', theme);
  }, theme);
  await page.goto(base);
  await waitForDemo(page);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark']) {
      const page = await demo(browser, 390, theme);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const row = page.locator('[data-group-row="auto"] button');
      const sheet = page.locator('dialog[open]');
      await row.click();
      await sheet.locator('[data-member-row]').nth(1).click();
      const inside = await toastHit(page);
      if (shots) await page.screenshot({path: path.join(shots, `390-sheet-toast-${theme}.png`)});
      const close = page.locator('[data-sheet-close] button');
      expect(
        await close.evaluate(button => {
          const box = button.getBoundingClientRect();
          return (
            box.width === 32 &&
            box.height === 32 &&
            [1, 16, 31].every(x => [1, 16, 31].every(y => button.contains(document.elementFromPoint(box.x + x, box.y + y))))
          );
        })
      ).toBe(true);
      await close.click();
      await expect(sheet).toHaveCount(0);
      await expect(row).toBeFocused();
      const outside = await toastHit(page);
      for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(inside[key] - outside[key])).toBeLessThan(1);
      // An existing toast must also stay above a newly opened sheet.
      await row.click();
      await toastHit(page);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(row).toBeFocused();
      await row.click();
      await sheet.evaluate(async element => {
        await Promise.all(element.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => {})));
      });
      const grabber = page.locator('.astryx-bottom-sheet > [aria-hidden="true"]').first();
      const box = await grabber.boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
      for (const distance of [20, 80, 160, 260, 380]) {
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y + distance}]});
      }
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await expect(sheet).toHaveCount(0);
      await expect(row).toBeFocused();
      expect(errors).toEqual([]);
      console.log(`PASS 390 ${theme}: toast hit/position, full close hit area, normal click, focus return, Escape, touch grabber dismissal`);
      await page.close();
    }
    for (const [width, theme] of [
      [390, 'light'],
      [390, 'dark'],
      [1440, 'light'],
      [1440, 'dark']
    ]) {
      const page = await demo(browser, width, theme);
      if (width === 390) await page.getByRole('button', {name: '打开导航', exact: true}).click();
      const settings = page.getByRole('button', {name: '设置', exact: true});
      await settings.click();
      const dialog = page.locator('dialog[open]');
      if (width === 390) {
        const tabs = dialog.getByRole('tablist', {name: '设置分类'});
        const general = tabs.getByRole('tab', {name: '常规', exact: true});
        const network = tabs.getByRole('tab', {name: '网络', exact: true});
        const about = tabs.getByRole('tab', {name: '关于', exact: true});
        await expect(general).toHaveAttribute('aria-selected', 'true');
        await general.focus();
        await page.keyboard.press('End');
        await expect(about).toBeFocused();
        await expect(about).toBeInViewport({ratio: 1});
        await page.keyboard.press('Enter');
        await expect(dialog.getByRole('tabpanel', {name: '关于'})).toBeVisible();
        await page.keyboard.press('Home');
        await expect(general).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(network).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(network).toHaveAttribute('aria-selected', 'true');
        await expect(dialog.getByRole('tabpanel', {name: '网络'})).toBeVisible();
      } else await dialog.getByRole('button', {name: '网络', exact: true}).click();
      await dialog.getByRole('textbox', {name: '并发拨号上限', exact: true}).fill('8');
      await dialog.getByRole('button', {name: '查看并应用', exact: true}).click();
      if (width === 390) {
        for (const tab of await dialog.getByRole('tab').all()) await expect(tab).toBeDisabled();
        await dialog.getByRole('button', {name: '取消', exact: true}).click();
        await expect(dialog.getByRole('tab', {name: '网络', exact: true})).toBeEnabled();
        await expect(dialog.getByRole('textbox', {name: '并发拨号上限', exact: true})).toHaveValue('8');
        await dialog.getByRole('button', {name: '查看并应用', exact: true}).click();
      }
      await dialog.getByRole('button', {name: '应用', exact: true}).click();
      const inside = await toastHit(page);
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      const outside = await toastHit(page);
      for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(inside[key] - outside[key])).toBeLessThan(1);
      expect(outside.x + outside.width).toBe(width - 16);
      if (width === 390) await page.getByRole('button', {name: '打开导航', exact: true}).click();
      await settings.click();
      await toastHit(page);
      await page.locator('.astryx-toast button').click();
      await expect(page.locator('.astryx-toast')).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      console.log(`PASS ${width} ${theme}: settings navigation, review gating, toast hit-tests/position and Escape`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
