import {detail, expect, mockBackend, test} from './fixtures';

// TextTooltip only reveals on an ancestor's :focus-visible, which a tap never produces (src/ui/Button.tsx). On a
// phone the detail drawer has vertical room to spare, so a value that would otherwise truncate wraps instead, and the
// full text is on screen without needing the tooltip at all.
test('a truncated rule expression in the detail drawer wraps on phones instead of relying on a tap-only tooltip', async ({page}) => {
  const {api} = await mockBackend(page);
  const connections = await api.connections();
  const row = connections.tcp.find(row => row.rule_expression && row.chain.length)!;
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`/#/connections?id=${encodeURIComponent(row.id)}`);
  const rule = detail(page).locator('.rp-list .rp-truncate').first();
  await expect(rule).toHaveText(row.rule_expression!);
  expect(await rule.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('normal');
});

test('the same value stays a single-line truncation with its tooltip on desktop', async ({page}) => {
  const {api} = await mockBackend(page);
  const connections = await api.connections();
  const row = connections.tcp.find(row => row.rule_expression && row.chain.length)!;
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto(`/#/connections?id=${encodeURIComponent(row.id)}`);
  const rule = detail(page).locator('.rp-list .rp-truncate').first();
  await expect(rule).toHaveText(row.rule_expression!);
  expect(await rule.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
});
