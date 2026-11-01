import type {Locator, Page} from '@playwright/test';
import {expect, mockBackend, test} from './fixtures';

// Every in-app jump lands on the element it names: it is scrolled into the band between the top and bottom bars, holds
// focus, and is marked for a moment, whether the visit came by mouse or keyboard.
type Family = {
  name: string;
  // The base profile turns features off; the default one has them all on.
  profile?: 'base';
  // Opens the link: a click on the page that offers it, or the address.
  go: (page: Page) => Promise<unknown>;
  hash: RegExp;
  target: (page: Page) => Locator;
};
const open = (path: string) => (page: Page) => page.goto(path);
const families: Family[] = [
  {
    name: 'settings field',
    go: open('/#/settings?card=appearance&field=sparklines'),
    hash: /settings\?card=appearance&field=sparklines$/,
    target: page => page.locator('[data-setting="sparklines"]')
  },
  {
    name: 'settings card',
    go: open('/#/settings?card=runtime'),
    hash: /settings\?card=runtime$/,
    target: page => page.locator('section.rp-card:has(#settings-runtime)')
  },
  {
    name: 'overview card',
    profile: 'base',
    go: open('/#/overview?card=limits'),
    hash: /overview\?card=limits$/,
    target: page => page.locator('section.rp-card:has(#overview-limits)')
  },
  {
    name: 'overview status row',
    go: open('/#/overview?card=status'),
    hash: /overview\?card=status$/,
    target: page => page.locator('#overview-status')
  },
  {
    name: 'global settings field, from the probes card',
    go: async page => {
      await page.goto('/#/settings?card=probes');
      await page.getByRole('link', {name: 'Edit health checks in Configuration', exact: true}).click();
    },
    hash: /config\?tab=global&field=tcp_check_url$/,
    target: page => page.locator('[data-setting="tcp_check_url"]')
  },
  {
    name: 'policies group',
    go: open('/#/policies?group=gaming'),
    hash: /policies\?group=gaming$/,
    target: page => page.locator('#group-gaming')
  },
  {
    name: 'activity mode card',
    go: open('/#/activity?card=mode'),
    hash: /activity\?card=mode$/,
    target: page => page.locator('[data-module="mode"] .rp-card').first()
  },
  {
    name: 'overview limits, from the Activity status card',
    profile: 'base',
    go: async page => {
      await page.goto('/#/activity');
      await page.getByRole('link', {name: /features are off$/}).click();
    },
    hash: /overview\?card=limits$/,
    target: page => page.locator('section.rp-card:has(#overview-limits)')
  },
  {
    name: 'status card setting, from the Overview limits card',
    profile: 'base',
    go: async page => {
      await page.goto('/#/overview');
      await page.getByRole('link', {name: 'Status card setting', exact: true}).click();
    },
    hash: /settings\?card=appearance&field=limitNotice$/,
    target: page => page.locator('[data-setting="limitNotice"]')
  },
  {
    name: 'Activity history card, from the Overview',
    go: async page => {
      await page.goto('/#/overview');
      await page.getByRole('region', {name: 'Backend features', exact: true}).getByRole('link', {name: 'Traffic history', exact: true}).click();
    },
    hash: /activity\?card=history$/,
    target: page => page.locator('[data-module="history"] .rp-card').first()
  }
];

for (const viewport of [
  {width: 1280, height: 900},
  {width: 390, height: 844}
]) {
  for (const family of families) {
    test.describe(`${family.name} at ${viewport.width}px`, () => {
      test.use({storage: family.profile ? {'doona-mock-profile': family.profile} : {}, viewport});

      test('lands on its target, below the top bar, holding focus and marked until the mark expires', async ({page}) => {
        await mockBackend(page);
        await family.go(page);
        await expect(page).toHaveURL(family.hash);
        const target = family.target(page);
        await expect(target).toHaveAttribute('data-highlighted', 'true');
        await expect.poll(() => target.evaluate(element => element.contains(document.activeElement))).toBe(true);
        const bars = await page.evaluate(() => {
          const style = getComputedStyle(document.querySelector('.rp-popover-band')!);
          return {top: parseFloat(style.top), bottom: parseFloat(style.bottom), height: innerHeight};
        });
        // A card taller than the page is read from its title, so only its first 200px must fit.
        await expect
          .poll(async () => {
            const box = (await target.boundingBox())!;
            return box.y >= bars.top - 1 && box.y + Math.min(box.height, 200) <= bars.height - bars.bottom + 1;
          })
          .toBe(true);
        await expect(target).not.toHaveAttribute('data-highlighted', /.*/, {timeout: 5000});
      });
    });
  }
}

test('the Overview opens the diagnostics panel of the configuration', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/overview');
  await page.getByRole('region', {name: 'Backend features', exact: true}).getByRole('link', {name: 'Validation', exact: true}).click();
  await expect(page).toHaveURL(/config\?tab=validate$/);
  await expect(page.getByRole('region', {name: 'Diagnostics', exact: true})).toBeFocused();
});

test('a reader who scrolls stops the landing from pulling the page back', async ({page}) => {
  await mockBackend(page);
  await page.setViewportSize({width: 1280, height: 600});
  await page.goto('/#/settings?card=appearance&field=sparklines');
  const target = page.locator('[data-setting="sparklines"]');
  await expect(target).toHaveAttribute('data-highlighted', 'true');
  // The landing has moved the page, so a return to the top is the reader's doing.
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.mouse.wheel(0, -4000);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
