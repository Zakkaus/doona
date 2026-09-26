import type {Locator, Page} from '@playwright/test';
import {expect, mockBackend, test} from './fixtures';

// The traffic view's fact tiles (src/features/connections/Traffic.tsx, FactStrip's `lead`): on a phone the busiest
// connection takes the first row alone and download and upload share the second; wide, the three share one row.
test.use({storage: {'doona-lang': 'en'}});

const tile = (page: Page, label: string) => page.locator('.rp-facts > div').filter({has: page.locator('dt', {hasText: new RegExp(`^${label}$`)})});
const box = async (locator: Locator) => (await locator.boundingBox())!;
const long = 'cn-gdfs-ct-01-12.upos-sz-mirrorcos.vod.bilivideo.com';

// The mock's busiest connection under a host too long even for a phone's full row.
async function longHost(page: Page) {
  const backend = await mockBackend(page);
  backend.handlers['GET connections'] = async () => {
    const list = await backend.api.connections();
    const rename = <T extends {domain?: string | null}>(row: T) => (row.domain === 'cdn.bilibili.com' ? {...row, domain: long} : row);
    return {...list, tcp: list.tcp.map(rename), udp: list.udp.map(rename)};
  };
}

// How far the host sits from its tile body's left and right edges.
const gaps = (dd: Locator) =>
  dd.evaluate(el => {
    const body = el.getBoundingClientRect();
    const host = el.querySelector('.rp-big')!.getBoundingClientRect();
    return {left: Math.round(host.left - body.left), right: Math.round(body.right - host.right)};
  });

// Whether the host is cut, and whether its first and last characters fall inside its box.
const edges = (value: Locator) =>
  value.evaluate(el => {
    const outer = el.getBoundingClientRect();
    const text = el.querySelector('bdi')!.firstChild!;
    const inside = (from: number) => {
      const range = document.createRange();
      range.setStart(text, from);
      range.setEnd(text, from + 1);
      const r = range.getBoundingClientRect();
      return r.left >= outer.left - 0.5 && r.right <= outer.right + 0.5;
    };
    return {cut: el.scrollWidth > el.clientWidth, first: inside(0), last: inside(text.textContent!.length - 1)};
  });

test.describe('390px', () => {
  test.use({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});

  test('the busiest connection takes the first row whole, download and upload share the second', async ({page}) => {
    await page.goto('/#/connections');
    const busiest = tile(page, 'Heaviest connection');
    const down = tile(page, 'Download');
    const up = tile(page, 'Upload');
    await expect(busiest.locator('.rp-big')).toHaveText('cdn.bilibili.com');
    await expect(busiest.locator('.rp-fact-caption')).toHaveText('direct');
    await expect(down.locator('dd')).toHaveText('1.2 GB');
    await expect(up.locator('dd')).toHaveText('9.4 MB');
    // It fits the row, so it is neither cut nor given a tip, and sits at the tile's start.
    await expect(busiest.locator('.rp-big')).not.toHaveAttribute('data-tip');
    expect(await busiest.locator('.rp-big').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
    expect((await gaps(busiest.locator('dd'))).left).toBe(0);
    const [strip, first, second, third] = await Promise.all([box(page.locator('.rp-facts')), box(busiest), box(down), box(up)]);
    expect(first.x).toBeCloseTo(strip.x, 0);
    expect(first.width).toBeCloseTo(strip.width, 0);
    expect(second.y).toBeGreaterThan(first.y + first.height);
    expect(third.y).toBeCloseTo(second.y, 0);
    expect(second.x).toBeCloseTo(strip.x, 0);
    expect(third.x + third.width).toBeCloseTo(strip.x + strip.width, 0);
    expect(second.width).toBeCloseTo(third.width, 0);
    expect(second.height).toBeCloseTo(third.height, 0);
  });

  test('a host too long for the row loses its start, keeps its end and shows whole on a tap', async ({page}) => {
    await longHost(page);
    await page.goto('/#/connections');
    const value = tile(page, 'Heaviest connection').locator('.rp-big');
    await expect(value).toHaveText(long);
    await expect(value).toHaveAttribute('data-tip', '');
    expect(await edges(value)).toEqual({cut: true, first: false, last: true});
    await value.tap();
    await expect(page.getByRole('tooltip')).toHaveText(long);
  });

  test.describe('with a mouse', () => {
    test.use({hasTouch: false, isMobile: false});

    test('a hover on a cut host shows it whole', async ({page}) => {
      await longHost(page);
      await page.goto('/#/connections');
      const value = tile(page, 'Heaviest connection').locator('.rp-big');
      await expect(value).toHaveAttribute('data-tip', '');
      await expect(async () => {
        // Leave and re-enter: a pointer that never moved raises no new hover after the measurement.
        await page.mouse.move(0, 0);
        await value.hover();
        await expect(page.getByRole('tooltip')).toHaveText(long, {timeout: 1500});
      }).toPass();
    });
  });

  test.describe('mirrored', () => {
    test.use({storage: {'doona-lang': 'en', 'doona-mirror': 'on'}});

    test('the host sits at the start, on the right', async ({page}) => {
      await page.goto('/#/connections');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const busiest = tile(page, 'Heaviest connection');
      await expect(busiest.locator('.rp-big')).toHaveText('cdn.bilibili.com');
      const gap = await gaps(busiest.locator('dd'));
      expect(gap.right).toBe(0);
      expect(gap.left).toBeGreaterThan(0);
    });

    test('a long host still loses its start, not its end', async ({page}) => {
      await longHost(page);
      await page.goto('/#/connections');
      const value = tile(page, 'Heaviest connection').locator('.rp-big');
      await expect(value).toHaveAttribute('data-tip', '');
      expect(await edges(value)).toEqual({cut: true, first: false, last: true});
    });
  });
});

test.describe('1440px', () => {
  test.use({viewport: {width: 1440, height: 900}});

  test('the three tiles share one row with the same values', async ({page}) => {
    await page.goto('/#/connections');
    const busiest = tile(page, 'Heaviest connection');
    await expect(busiest.locator('.rp-big')).toHaveText('cdn.bilibili.com');
    await expect(busiest.locator('.rp-big')).toHaveAttribute('title', 'cdn.bilibili.com');
    await expect(busiest.locator('.rp-fact-caption')).toHaveText('direct');
    await expect(tile(page, 'Download').locator('dd')).toHaveText('1.2 GB');
    await expect(tile(page, 'Upload').locator('dd')).toHaveText('9.4 MB');
    const [first, second, third] = await Promise.all([box(busiest), box(tile(page, 'Download')), box(tile(page, 'Upload'))]);
    expect(second.y).toBeCloseTo(first.y, 0);
    expect(third.y).toBeCloseTo(first.y, 0);
    expect(second.width).toBeCloseTo(first.width, 0);
    expect(third.width).toBeCloseTo(first.width, 0);
  });

  test('a long host is still cut at its end, with its title', async ({page}) => {
    await longHost(page);
    await page.goto('/#/connections');
    const value = tile(page, 'Heaviest connection').locator('.rp-big');
    await expect(value).toHaveText(long);
    await expect(value).toHaveAttribute('title', long);
    await expect(value).not.toHaveClass(/rp-truncate-start/);
  });
});
