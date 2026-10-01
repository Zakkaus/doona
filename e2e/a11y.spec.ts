import AxeBuilder from '@axe-core/playwright';
import {expect, offered, routes, test, detail, mockBackend} from './fixtures';

// Palettes carry their official values, so their own secondary text on their own base and surface is a known
// exception: Rosé Pine Dawn's subtle is 4.0:1 and Moon's 4.5:1. Any other pairing fails. Glass is not checked for
// contrast: its text sits on translucent layers over a gradient, which axe cannot see and reads as white.
const knownContrast = new Set(['#797593 on #faf4ed', '#797593 on #fffaf3', '#908caa on #232136', '#908caa on #2a273f']);
// Highlighted rule tokens take the palette's official code colours, which doona does not change; other text is checked.
const highlighted = (html: string) => /^<span class="rp-dae-(comment|string|keyword|number|propertyName|variableName|punctuation|operator)">/.test(html);
// The default look, its dark side, and glass, whose translucent surfaces depend on what lies beneath them.
const looks = [
  ['rose-pine/moon', 'light'],
  ['rose-pine/moon', 'dark'],
  ['glass/glass', 'light'],
  ['glass/glass', 'dark']
] as const;
for (const [palette, scheme] of looks)
  test.describe(`${palette} ${scheme}`, () => {
    test.use({storage: {'doona-palette': palette, 'doona-scheme': scheme}});
    for (const route of routes) {
      test(route, async ({page}, testInfo) => {
        await page.goto(`/#/${route}`);
        test.skip(!(await offered(page, route)), 'not offered by this backend');
        await expect(page.locator('html')).toHaveAttribute('data-scheme', scheme);
        await expect(page.locator('.rp-content')).toBeVisible();
        await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
        // A loading notice stays hidden for its first 150ms, and a role query skips hidden elements: select it by CSS so
        // a fast machine does not scan the page before its data has arrived.
        await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa']).analyze();
        const findings = Object.fromEntries(
          results.violations.map(rule => [
            rule.id,
            {count: rule.nodes.length, nodes: rule.nodes.map(node => ({target: node.target, html: node.html, summary: node.failureSummary}))}
          ])
        );
        await testInfo.attach('axe.json', {body: JSON.stringify({route, findings}, null, 2), contentType: 'application/json'});
        const gated = results.violations
          .map(rule =>
            rule.id === 'color-contrast'
              ? {
                  ...rule,
                  nodes:
                    palette === 'glass/glass'
                      ? []
                      : rule.nodes.filter(
                          node => !highlighted(node.html) && !knownContrast.has(`${node.any[0]?.data?.fgColor} on ${node.any[0]?.data?.bgColor}`)
                        )
                }
              : rule
          )
          .filter(rule => rule.nodes.length > 0);
        expect(
          gated.map(rule => rule.id),
          'Unexpected rules; see axe.json for affected nodes'
        ).toHaveLength(0);
      });
    }
  });

// Each panel's More menu, open, passes the same rules as the page.
const menus = [
  ['connections?id=1', (page: import('@playwright/test').Page) => detail(page), 'More actions'],
  ['policies', (page: import('@playwright/test').Page) => page.getByRole('region', {name: 'auto', exact: true}), 'More actions'],
  ['nodes?tab=list', (page: import('@playwright/test').Page) => page.locator('body'), 'More actions for harbor']
] as const;
for (const [route, scope, name] of menus)
  test(`the More menu on ${route.split('?')[0]} passes axe`, async ({page}) => {
    await mockBackend(page);
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`/#/${route}`);
    await scope(page).getByRole('button', {name, exact: true}).click();
    await expect(page.getByRole('menu', {name})).toBeVisible();
    const results = await new AxeBuilder({page}).include('[role=menu]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map(rule => rule.id)).toHaveLength(0);
  });

// Headings step down one level at a time: cards under the page's h1 are h2, on each page and with a row's detail open.
for (const route of ['activity', 'overview', 'connections?id=1', 'flows', 'dns', 'policies', 'config', 'logs'])
  test(`headings on ${route.split('?')[0]} keep their order`, async ({page}) => {
    await page.goto(`/#/${route}`);
    await expect(page.locator('.rp-content').getByRole('heading').first()).toBeVisible();
    await expect(page.locator('.rp-content .rp-empty[role=status]')).toHaveCount(0);
    const results = await new AxeBuilder({page}).withRules(['heading-order']).analyze();
    expect(results.violations.flatMap(rule => rule.nodes.map(node => node.target.join(' ')))).toEqual([]);
  });
