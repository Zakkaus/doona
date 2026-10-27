async function waitForDemo(page, {keepBadge = false} = {}) {
  await page.locator('[data-group-row]').first().waitFor();
  // The demo badge can cover draft actions; use its dismissal control before exercising them.
  const badge = page.locator('.lite-demo-badge');
  if (!keepBadge && (await badge.isVisible())) await badge.getByRole('button').click();
}

module.exports = {waitForDemo};
