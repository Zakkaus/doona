import AxeBuilder from '@axe-core/playwright';
import {expect, routes, test} from './fixtures';

// Observed with axe 4.13.0. Source fixes are outside this gate change.
const KNOWN: Record<string, string> = {
  'color-contrast': 'Dawn muted, subtle and accent text fall below WCAG AA contrast; adjust palette tokens in src/ui/theme.css:21-32.',
  'scrollable-region-focusable':
    'Config code pane has no keyboard focus target; add focusability to Frame in src/ui/ui.tsx:610 (used by src/features/clash-compat/ConfigPage.tsx:88).'
};

for (const route of routes) {
  test(route, async ({page}, testInfo) => {
    await page.goto(`/#/${route}`);
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
    console.log(JSON.stringify({route, rules: Object.fromEntries(results.violations.map(rule => [rule.id, rule.nodes.length]))}));
    const violations = results.violations.filter(rule => !Object.hasOwn(KNOWN, rule.id));
    expect(
      violations.map(rule => rule.id),
      'Unexpected rules; see axe.json for affected nodes'
    ).toHaveLength(0);
  });
}
