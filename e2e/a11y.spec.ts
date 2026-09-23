import AxeBuilder from '@axe-core/playwright';
import {expect, offered, routes, test} from './fixtures';

// Palettes carry their official values, so their own secondary text on their own base and surface is a known
// exception: Rosé Pine Dawn's subtle is 4.0:1 and Moon's 4.5:1. Any other pairing fails. Glass is not checked for
// contrast: its text sits on translucent layers over a gradient, which axe cannot see and reads as white.
const knownContrast = new Set(['#797593 on #faf4ed', '#797593 on #fffaf3', '#908caa on #232136', '#908caa on #2a273f']);
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
        await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
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
                      : rule.nodes.filter(node => !knownContrast.has(`${node.any[0]?.data?.fgColor} on ${node.any[0]?.data?.bgColor}`))
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
