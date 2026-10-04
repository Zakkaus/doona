import {expect, test, box, loadingState} from './fixtures';
import type {Locator, Page} from '@playwright/test';

const phase = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.DOONA_OWNER_SHOTS;

async function focusEdges(page: Page, track: Locator) {
  const items = track.locator('.rp-tab, .rp-btn');
  for (const item of [items.first(), items.last()]) {
    if (await item.isDisabled()) continue;
    await item.click();
    await page.keyboard.press('Tab');
    await item.focus();
    await expect(item).toHaveAttribute('data-focus-visible');
    await expect
      .poll(() =>
        item.evaluate(el => {
          const track = el.closest('.rp-tabbar, .rp-seg')!;
          const box = el.getBoundingClientRect();
          const outer = track.getBoundingClientRect();
          const marker = track.querySelector('.rp-slider')!.getBoundingClientRect();
          const style = getComputedStyle(el);
          const extent = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
          return {
            inside:
              box.left - extent >= outer.left - 1 &&
              box.right + extent <= outer.right + 1 &&
              box.top - extent >= outer.top - 1 &&
              box.bottom + extent <= outer.bottom + 1,
            concentric:
              Math.abs(box.left + box.width / 2 - marker.left - marker.width / 2) <= 1 &&
              Math.abs(box.top + box.height / 2 - marker.top - marker.height / 2) <= 1
          };
        })
      )
      .toEqual({inside: true, concentric: true});
  }
}

for (const width of [390, 768, 1440]) {
  for (const scheme of ['light', 'dark']) {
    test.describe(`${width}px ${scheme} focus`, () => {
      test.use({viewport: {width, height: 1000}, storage: {'doona-lang': 'zh-TW', 'doona-scheme': scheme}});
      test('first and last rule tabs keep a concentric ring inside the track', async ({page}) => {
        await page.addInitScript(() => {
          new MutationObserver(() => {
            for (const list of document.querySelectorAll<HTMLElement>('.rp-tablist:not([data-placeholder-height])')) {
              list.dataset.placeholderHeight = '';
              const clone = list.cloneNode(false) as HTMLElement;
              list.parentElement!.append(clone);
              list.dataset.placeholderHeight = String(clone.getBoundingClientRect().height);
              clone.remove();
            }
          }).observe(document, {childList: true, subtree: true});
        });
        await page.goto('/#/rules?tab=list&view=advanced');
        const track = page.locator('.rp-tabbar').first();
        await expect(track.getByRole('tab').last()).toBeVisible();
        if (phase) {
          await track.getByRole('tab').last().focus();
          await page.keyboard.press('Space');
          await page.screenshot({path: `test-results/owner-shots/${phase}/tabs-ring.${width}.${scheme}.zh-TW.png`});
        }
        const list = track.locator('.rp-tablist');
        const placeholder = Number(await list.getAttribute('data-placeholder-height'));
        expect(placeholder).toBeGreaterThan(0);
        expect(placeholder).toBe((await box(list)).height);
        await focusEdges(page, track);
      });
      for (const route of ['activity', 'connections', 'flows', 'dns', 'policies', 'rules', 'nodes', 'config']) {
        test(`${route}: every visible tab and segmented track contains its edge rings`, async ({page}) => {
          await page.goto(`/#/${route}`);
          await expect(page.locator('.rp-content > *').first()).toBeVisible();
          const tabs = page.locator('.rp-content .rp-tabbar .rp-tab');
          for (let index = 0; index < Math.max(1, await tabs.count()); index++) {
            if (await tabs.count()) {
              await tabs.nth(index).click();
              await expect(page.locator('.rp-tabpanel[data-shown]')).toHaveAttribute('aria-labelledby', (await tabs.nth(index).getAttribute('id'))!);
            }
            await expect(page.locator(`.rp-content ${loadingState}`)).toHaveCount(0);
            const tracks = page.locator('.rp-content .rp-seg:visible');
            for (let at = 0; at < (await tracks.count()); at++) {
              if (phase && route === 'activity' && at === 0) {
                await tracks.nth(at).locator('.rp-btn').last().focus();
                await page.keyboard.press('Space');
                await page.screenshot({path: `test-results/owner-shots/${phase}/segmented-ring.${width}.${scheme}.zh-TW.png`});
              }
              await focusEdges(page, tracks.nth(at));
            }
          }
          const bars = page.locator('.rp-content .rp-tabbar:visible');
          for (let at = 0; at < (await bars.count()); at++) await focusEdges(page, bars.nth(at));
          if (route === 'rules') {
            await page.goto('/#/rules?tab=list&view=advanced');
            await page.getByRole('button', {name: '新增規則', exact: true}).first().click();
            await focusEdges(page, page.getByRole('dialog').locator('.rp-seg').first());
          }
        });
      }
    });
  }
}

test('focus rings clear field, picker, button, list, legend and table content without clipping', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 900});
  const samples = [
    ['settings', '.rp-input input', '.rp-input'],
    ['settings', '.rp-selectbtn:enabled', ''],
    ['activity', '.rp-content .rp-btn', ''],
    ['activity', '.rp-bar .top .l > .rp-link', ''],
    ['activity', '.rp-donut .r .n > .rp-link', ''],
    ['dns?tab=cache', '[role=rowheader]', '']
  ];
  for (const [route, selector, owner] of samples) {
    await page.goto(`/#/${route}`);
    const target = page.locator(`${selector}:visible`).first();
    await expect(target).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await target.scrollIntoViewIfNeeded();
    await page.keyboard.press('Tab');
    await target.focus();
    await expect(target).toBeFocused();
    await expect
      .poll(() =>
        target.evaluate((element, owner) => {
          const frame = owner ? element.closest(owner)! : element;
          const style = getComputedStyle(frame);
          const bounds = frame.getBoundingClientRect();
          const offset = parseFloat(style.outlineOffset);
          const width = parseFloat(style.outlineWidth);
          const inner = {left: bounds.left - offset, right: bounds.right + offset, top: bounds.top - offset, bottom: bounds.bottom + offset};
          const content: DOMRect[] = [];
          if (element instanceof HTMLInputElement) content.push(element.getBoundingClientRect());
          else {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              if (!walker.currentNode.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(walker.currentNode);
              content.push(...range.getClientRects());
            }
          }
          const clear = content.every(
            box => box.left - inner.left >= 2 && inner.right - box.right >= 2 && box.top - inner.top >= 2 && inner.bottom - box.bottom >= 2
          );
          let clipped = false;
          for (let parent = frame.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const css = getComputedStyle(parent);
            const box = parent.getBoundingClientRect();
            if (/(hidden|clip|auto|scroll)/.test(css.overflowX)) clipped ||= inner.left - width < box.left - 1 || inner.right + width > box.right + 1;
            if (/(hidden|clip|auto|scroll)/.test(css.overflowY)) clipped ||= inner.top - width < box.top - 1 || inner.bottom + width > box.bottom + 1;
          }
          return {clear, clipped, visible: style.outlineStyle === 'solid' && width === 2, shadow: style.boxShadow};
        }, owner)
      )
      .toEqual({clear: true, clipped: false, visible: true, shadow: 'none'});
  }
});

test('a text field darkens its border on any focus and shows the ring only for the keyboard', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto('/#/settings');
  const input = page.locator('.rp-input input:visible').first();
  const field = input.locator('xpath=ancestor::*[contains(@class,"rp-input")][1]');
  await expect(input).toBeVisible();
  const look = () =>
    field.evaluate(el => {
      const style = getComputedStyle(el);
      return {border: style.borderTopColor, outline: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, shadow: style.boxShadow};
    });
  const rest = await look();
  await input.click();
  await expect(input).toBeFocused();
  await expect.poll(async () => (await look()).border).not.toBe(rest.border);
  expect((await look()).outline).toBe('none');
  expect((await look()).shadow).toBe('none');
  await input.blur();
  await page.keyboard.press('Tab');
  await input.focus();
  await expect(input).toHaveAttribute('data-focus-visible');
  await expect.poll(look).toMatchObject({outline: 'solid', width: '2px', offset: '2px', shadow: 'none'});
  expect((await look()).border).not.toBe(rest.border);
});
