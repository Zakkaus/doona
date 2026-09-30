import {expect, mockBackend, test} from './fixtures';
import {sha256} from '../src/api/hash';

const reason = 'No loaded configuration file defines this group';
const label = 'Why proxy is locked';

test.beforeEach(async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET config'] = async () => {
    const config = await api.config();
    const digest = await sha256('');
    return {...config, sources: config.sources.map(source => ({...source, content: '', content_sha256: digest}))};
  };
  await page.goto('/#/policies');
  await expect(page.getByRole('button', {name: label})).toBeVisible();
});

for (const touch of [false, true]) {
  test.describe(touch ? 'phone touch' : 'desktop mouse', () => {
    test.use({viewport: touch ? {width: 390, height: 844} : {width: 1440, height: 1000}, hasTouch: touch, isMobile: touch});

    for (const scheme of ['light', 'dark']) {
      test.describe(scheme, () => {
        test.use({storage: {'doona-scheme': scheme}});

        test('press opens the reason inside the content area; Escape restores focus', async ({page}) => {
          const lock = page.getByRole('button', {name: label});
          const dialog = page.getByRole('dialog', {name: label});
          await expect(dialog).toHaveCount(0);
          if (touch) await lock.tap();
          else await lock.click();
          await expect(dialog).toContainText(reason);
          const content = (await page.locator('.rp-content').boundingBox())!;
          const bubble = (await page.locator('.rp-popover').boundingBox())!;
          expect(bubble.x).toBeGreaterThanOrEqual(content.x);
          expect(bubble.x + bubble.width).toBeLessThanOrEqual(content.x + content.width);
          expect(bubble.y).toBeGreaterThanOrEqual(content.y);
          expect(bubble.y + bubble.height).toBeLessThanOrEqual(content.y + content.height);
          await page.screenshot({path: `shots/after-lock-tip-${touch ? 'phone' : 'desktop'}-${scheme}.png`});
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect(lock).toBeFocused();
        });
      });
    }
  });
}

test('keyboard press opens the reason while only the focused control has a ring', async ({page}) => {
  const lock = page.getByRole('button', {name: label});
  const dialog = page.getByRole('dialog', {name: label});
  await page.keyboard.press('Tab');
  await lock.focus();
  await expect(dialog).toHaveCount(0);
  expect(await lock.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await expect(page.locator('.rp-tabs')).toHaveAttribute('data-focus-visible', 'true');
  expect(await page.locator('.rp-tabs').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  expect(await page.locator('.rp-content').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  await page.keyboard.press('Enter');
  await expect(dialog).toContainText(reason);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(lock).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog).toContainText(reason);
  await page.keyboard.press('Escape');
  await expect(lock).toBeFocused();
});

test('the popover fits a narrow content column and dismisses on an outside press', async ({page}) => {
  const lock = page.getByRole('button', {name: label});
  await lock.click();
  await expect(page.getByRole('dialog', {name: label})).toContainText(reason);
  await page.setViewportSize({width: 320, height: 844});
  await expect(page.locator('.rp-popover')).toHaveCSS('max-width', '264px');
  const content = (await page.locator('.rp-content').boundingBox())!;
  const bubble = (await page.locator('.rp-popover').boundingBox())!;
  expect(bubble.x).toBeGreaterThanOrEqual(content.x);
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(content.x + content.width);
  const heading = (await page.getByRole('heading', {level: 1}).boundingBox())!;
  await page.mouse.click(heading.x + heading.width / 2, heading.y + heading.height / 2);
  await expect(page.getByRole('dialog', {name: label})).toHaveCount(0);
});

test('a pen press opens the lock explanation', async ({page}) => {
  const lock = page.getByRole('button', {name: label});
  const box = (await lock.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const position = {x: box.x + box.width / 2, y: box.y + box.height / 2, button: 'left' as const, pointerType: 'pen' as const, clickCount: 1};
  await session.send('Input.dispatchMouseEvent', {...position, type: 'mousePressed', buttons: 1});
  await session.send('Input.dispatchMouseEvent', {...position, type: 'mouseReleased', buttons: 0});
  await expect(page.getByRole('dialog', {name: label})).toContainText(reason);
  await page.keyboard.press('Escape');
  await expect(lock).toBeFocused();
  await session.detach();
});
