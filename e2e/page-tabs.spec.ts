import {expect, test, settleFrames} from './fixtures';

// Page navigation keeps the tab roles and is drawn as S2's SegmentedControl at L: 40px tabs in a filled track, the
// selected one under the sliding slider. A segmented control inside the page stays M.
for (const width of [1280, 390]) {
  test.describe(`${width}px`, () => {
    test.use({viewport: {width, height: 900}});

    test('page tabs are 40px with the filled slider, and segmented controls stay M', async ({page}) => {
      await page.goto('/#/rules?tab=list');
      const bar = page.locator('.rp-content [data-page-tabrow]');
      await expect(bar.getByRole('tab').first()).toBeVisible();
      await expect(page.locator('.rp-content .rp-tabpanel[data-shown] .rp-seg').first()).toBeVisible();
      await settleFrames(page);
      const geometry = await bar.evaluate(el => {
        const sizes = getComputedStyle(document.documentElement);
        const tabs = [...el.querySelectorAll<HTMLElement>('[role=tab]')];
        const selected = el.querySelector<HTMLElement>('[role=tab][data-selected]')!.getBoundingClientRect();
        const slider = el.querySelector<HTMLElement>(':scope > .rp-slider')!;
        const marker = slider.getBoundingClientRect();
        const seg = document.querySelector<HTMLElement>('.rp-content .rp-tabpanel[data-shown] .rp-seg')!;
        return {
          heights: tabs.map(tab => tab.getBoundingClientRect().height),
          fonts: tabs.map(tab => getComputedStyle(tab).fontSize),
          bar: el.getBoundingClientRect().height,
          barFill: getComputedStyle(el).backgroundColor,
          sliderFill: getComputedStyle(slider).backgroundColor,
          marker: {
            left: marker.left - selected.left,
            right: marker.right - selected.right,
            top: marker.top - selected.top,
            bottom: marker.bottom - selected.bottom
          },
          segment: seg.getBoundingClientRect().height,
          segmentFont: getComputedStyle(seg.querySelector('[role=radio]')!).fontSize,
          large: parseFloat(sizes.getPropertyValue('--rp-control-lg')),
          control: parseFloat(sizes.getPropertyValue('--rp-control'))
        };
      });
      expect(geometry.large).toBe(40);
      expect(
        geometry.heights.every(height => height === 40),
        JSON.stringify(geometry.heights)
      ).toBe(true);
      expect(
        geometry.fonts.every(font => font === '16px'),
        JSON.stringify(geometry.fonts)
      ).toBe(true);
      expect(geometry.bar).toBe(40);
      expect(geometry.barFill).not.toBe('rgba(0, 0, 0, 0)');
      expect(geometry.sliderFill).not.toBe('rgba(0, 0, 0, 0)');
      // The slider covers the selected tab exactly.
      for (const edge of Object.values(geometry.marker)) expect(Math.abs(edge)).toBeLessThanOrEqual(0.5);
      expect(geometry.segment).toBe(geometry.control);
      expect(geometry.segmentFont).toBe('14px');
    });

    // A page without tabs draws its top-level switch at L in their place, and the button on its row with it.
    test('the Policies kind switch and the new group button are L, centred on one line', async ({page}) => {
      await page.goto('/#/policies');
      const row = page.locator('.rp-content [data-page-toolbar]').first();
      await expect(row.locator('.rp-seg')).toBeVisible();
      await settleFrames(page);
      const geometry = await row.evaluate(el => {
        const measure = (node: HTMLElement) => {
          const box = node.getBoundingClientRect();
          return {height: box.height, top: box.top, bottom: box.bottom, centre: box.top + box.height / 2, font: getComputedStyle(node).fontSize};
        };
        const seg = el.querySelector<HTMLElement>('.rp-seg')!;
        return {
          seg: measure(seg),
          items: [...seg.querySelectorAll<HTMLElement>('[role=radio]')].map(measure),
          button: measure([...el.querySelectorAll<HTMLElement>(':scope > .rp-btn')].at(-1)!)
        };
      });
      for (const control of [geometry.seg, geometry.button, ...geometry.items]) expect(control.height, JSON.stringify(geometry)).toBe(40);
      for (const control of [geometry.button, ...geometry.items]) expect(control.font, JSON.stringify(geometry)).toBe('16px');
      // On a phone the L row is wider than the page and the button wraps under the switch; on a line they share a centre.
      if (width === 1280 || geometry.button.top < geometry.seg.bottom) expect(Math.abs(geometry.seg.centre - geometry.button.centre)).toBeLessThanOrEqual(1);
      else expect(geometry.button.top).toBeGreaterThanOrEqual(geometry.seg.bottom);
    });

    test('switching tabs keeps the heading, the tab row and the panel top in place', async ({page}) => {
      await page.goto('/#/dns?tab=stats');
      const tabs = page.locator('.rp-content [data-page-tabrow] [role=tab]');
      await expect(tabs.first()).toBeVisible();
      const tops = () =>
        page.evaluate(() =>
          ['.rp-content h1', '.rp-content [data-page-tabrow]', '.rp-content .rp-tabpanel[data-shown]'].map(
            selector => document.querySelector(selector)!.getBoundingClientRect().top
          )
        );
      await settleFrames(page);
      const first = await tops();
      for (let index = 1; index < (await tabs.count()); index++) {
        await tabs.nth(index).click();
        await expect(tabs.nth(index)).toHaveAttribute('data-selected', 'true');
        await settleFrames(page);
        expect(await tops(), `tab ${index}`).toEqual(first);
      }
    });
  });
}

test.describe('page tops', () => {
  test.use({viewport: {width: 1280, height: 900}});
  test('a tabbed page puts its heading where a page without tabs does', async ({page}) => {
    const heading = async (route: string) => {
      await page.goto(`/#/${route}`);
      await expect(page.locator('.rp-content h1')).toBeVisible();
      await settleFrames(page);
      return page.locator('.rp-content h1').evaluate(el => el.getBoundingClientRect().top);
    };
    expect(await heading('dns')).toBe(await heading('settings'));
  });
});
