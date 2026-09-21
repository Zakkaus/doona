import AxeBuilder from '@axe-core/playwright';
import {expect, offered, routes, test} from './fixtures';

// Dawn retains its official subtle text and navigation accents on these existing surfaces.
const knownContrast =
  '[data-family="rose-pine"][data-scheme="light"] :is(.rp-brand-version, .rp-search > .grow, .rp-kbd, .rp-side .rp-group, .rp-nav, .rp-version, .rp-head .rp-hint, .rp-tile-head, .rp-seg > .rp-btn[aria-checked="false"], .rp-legend > .it, .rp-card .rp-label, .rp-donut .r > span:nth-child(3), .rp-donut .r > .p, .rp-bar > .top > .v, .rp-note)';

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
          reason: rule.id === 'color-contrast' ? knownContrast : null,
          nodes: rule.nodes.map(node => ({target: node.target, html: node.html, summary: node.failureSummary}))
        }
      ])
    );
    await testInfo.attach('axe.json', {body: JSON.stringify({route, findings}, null, 2), contentType: 'application/json'});
    const violations = [];
    for (const rule of results.violations) {
      const unexpected = [];
      for (const node of rule.nodes) {
        const known =
          rule.id === 'color-contrast' &&
          node.target.length === 1 &&
          typeof node.target[0] === 'string' &&
          node.any.every(
            check =>
              check.id === 'color-contrast' &&
              ['#797593', '#907aa9', '#b4637a', '#ea9d34'].includes(check.data?.fgColor) &&
              ['#faf4ed', '#fffaf3', '#f2e9e1'].includes(check.data?.bgColor)
          ) &&
          // Matched in one evaluate: a locator would wait on a placeholder axe saw that has since been replaced.
          (await page.evaluate(({target, selector}) => Array.from(document.querySelectorAll(target)).every(element => element.matches(selector)), {
            target: node.target[0],
            selector: knownContrast
          }));
        if (!known) unexpected.push(node);
      }
      if (unexpected.length) violations.push({...rule, nodes: unexpected});
    }
    expect(
      violations.map(rule => rule.id),
      'Unexpected rules; see axe.json for affected nodes'
    ).toHaveLength(0);
  });
}
