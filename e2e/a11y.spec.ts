import AxeBuilder from '@axe-core/playwright';
import {expect, offered, routes, test} from './fixtures';

// Dawn contrast remains a palette decision; other violations must fail this gate.
const KNOWN: Record<string, string> = {
  'color-contrast':
    'Rosé Pine Dawn is used with its official values: subtle text (#797593) reaches 4.0:1 and the gold current-page mark 2.1:1. Labels use subtle, never muted.'
};

for (const route of routes) {
  test(route, async ({page}, testInfo) => {
    await page.goto(`/#/${route}`);
    test.skip(!(await offered(page, route)), 'not offered by this backend');
    await expect(page.locator('.rp-content')).toBeVisible();
    await expect(page.locator(`.rp-nav[href="#/${route}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.rp-content').getByRole('status')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa']).analyze();
    const findings = Object.fromEntries(
      results.violations.map(rule => [
        rule.id,
        {
          count: rule.nodes.length,
          reason: KNOWN[rule.id] ?? null,
          nodes: rule.nodes.map(node => ({target: node.target, html: node.html, summary: node.failureSummary}))
        }
      ])
    );
    await testInfo.attach('axe.json', {body: JSON.stringify({route, findings}, null, 2), contentType: 'application/json'});
    const violations = results.violations.filter(rule => !Object.hasOwn(KNOWN, rule.id));
    expect(
      violations.map(rule => rule.id),
      'Unexpected rules; see axe.json for affected nodes'
    ).toHaveLength(0);
  });
}
