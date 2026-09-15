import AxeBuilder from '@axe-core/playwright';
import {compatRoutes, expect, routes, test} from './fixtures';

// Dawn contrast remains a palette decision; other violations must fail this gate.
const KNOWN: Record<string, string> = {
  'color-contrast': 'Dawn muted, subtle and accent text fall below WCAG AA contrast; adjust palette tokens in src/ui/theme.css:21-32.'
};

for (const route of routes) {
  // The compat pages show their demo content only for the Clash backend kind.
  const storage: Record<string, string> = compatRoutes.includes(route) ? {'doona-backend': 'clash'} : {};
  test.describe(route, () => {
    test.use({storage});
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
      if (route === 'config') {
        const pane = page.locator('.rp-frame .body');
        await pane.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(pane).toBeFocused();
        await expect(page.locator('.rp-frame')).toHaveCSS('outline-style', 'solid');
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => pane.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        await testInfo.attach('config-keyboard-focus.png', {body: await page.screenshot(), contentType: 'image/png'});
      }
    });
  });
}
