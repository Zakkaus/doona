import {expect, test} from './fixtures';

test.use({viewport: {width: 1440, height: 1000}});

test('configuration sources list with the main source open, read-only ones cannot be edited', async ({page}) => {
  await page.goto('/#/config');
  await expect(page.locator('.cm-content[aria-label="/etc/honk/config.dae"]')).toContainText('tproxy_port: 12345');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
  const picker = page.getByRole('button', {name: /Source/});
  await expect(picker).toContainText('/etc/honk/config.dae');
  await picker.click();
  await expect(page.getByRole('option')).toHaveCount(4);
  await page.getByRole('option', {name: /sub-c\.dae/}).click();
  await expect(page).toHaveURL(/source=src-sub-c$/);
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
  await expect(page.locator('.cm-content[aria-label="/var/lib/honk/subscriptions/sub-c.dae"]')).toContainText('redacted');
});

test('editing validates, shows diagnostics on errors, and saves through a reload', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  // Append a line the way a person would: cursor to the end of the document, then type.
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('domain(geosite: netflix) -> nowhere');
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  const diagnostics = page.getByRole('list', {name: 'Diagnostics'});
  await expect(diagnostics.getByRole('listitem')).toHaveCount(1);
  await expect(diagnostics).toContainText('No group named "nowhere"');
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation found 1 error');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  for (let i = 0; i < 'nowhere'.length; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('proxy');
  await expect(page.locator('.rp-badge', {hasText: 'Unsaved'})).toBeVisible();
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toContainText('configuration reloaded');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
  await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toContainText('domain(geosite: netflix) -> proxy');
  await expect(page.locator('.rp-toolbar').first()).toContainText('41');
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('8 lines');
});

test('the validation tab lists kept diagnostics and opens the source at the line', async ({page}) => {
  await page.goto('/#/config?tab=validate');
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('Passed with 2 warnings');
  const rows = page.locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(rows).toHaveCount(3);
  await page.getByRole('radio', {name: 'Info 1', exact: true}).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('radio', {name: 'All 3', exact: true}).click();
  await page.getByRole('button', {name: 'Validate again', exact: true}).click();
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('Last validation');
  await expect(rows).toHaveCount(0);
  await page.reload();
  await rows.filter({hasText: 'rules.dae:3'}).click();
  await page.getByRole('button', {name: 'Open source', exact: true}).click();
  await expect(page).toHaveURL(/tab=source&source=src-rules&line=3$/);
  await expect(page.locator('.cm-content[aria-label="/etc/honk/rules.dae"]')).toBeVisible();
  await expect(page.locator('.cm-activeLine')).toContainText('mac(aa:bb:cc:dd:ee:ff)');
});

test.describe('without configuration readback', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('the page is hidden from navigation and says so when opened', async ({page}) => {
    await page.goto('/#/config');
    await expect(page.locator('.rp-nav[href="#/config"]')).toHaveCount(0);
    await expect(page.locator('.rp-content')).toContainText('does not expose its configuration');
  });
});

test('the quick setup rewrites subscriptions and keeps groups and rules', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const card = page.getByRole('region', {name: 'Quick setup'});
  // The form starts from the main source: one subscription; the groups are left as written.
  await expect(card.getByLabel('Subscription URL', {exact: true})).toHaveValue('https://sub.example.net/api/v1/client/subscribe?token=demo');
  await expect(card).toContainText('Templates route to proxy');
  await card.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/sub?token=abc&type=v2ray');
  await expect(card.locator('.cm-content')).toContainText("sub-c: 'https://example.org/sub?token=abc&type=v2ray'");
  await card.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toBeVisible();
  await expect(page).toHaveURL(/tab=source&source=src-main$/);
  const main = page.locator('.cm-content[aria-label="/etc/honk/config.dae"]');
  await expect(main).toContainText('resilient { filter: name(hk-01, sg-01, us-01) policy: min_avg10 }');
  await expect(main).toContainText('gaming { filter: name(jp-01, hk-02) policy: min_last_delay }');
  await expect(page.locator('.rp-toolbar').first()).toContainText('41');
});

test('the quick setup guards unsaved changes like the editor', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const card = page.getByRole('region', {name: 'Quick setup'});
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^Blacklist/}).click();
  await page.getByRole('tab', {name: 'Sources'}).click();
  const dialog = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/tab=setup$/);
  await page.getByRole('tab', {name: 'Sources'}).click();
  await dialog.getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(page).toHaveURL(/tab=source$/);
});

test('the quick setup writes a rule template into routing', async ({page}) => {
  await page.goto('/#/config?tab=setup');
  const card = page.getByRole('region', {name: 'Quick setup'});
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^Whitelist/}).click();
  const preview = card.locator('.cm-content');
  await expect(preview).toContainText('domain(geosite:category-ads-all) -> block');
  await expect(preview).toContainText('geosite:category-games@cn) -> direct');
  await expect(preview).toContainText('domain(geosite:geolocation-!cn) -> proxy');
  await card.getByRole('button', {name: /Rules$/}).click();
  await page.getByRole('option', {name: /^Blacklist/}).click();
  await expect(preview).toContainText('domain(geosite:gfw) -> proxy');
  await expect(preview).toContainText('fallback: direct');
});

test('node sources list their nodes and a subscription can be refreshed', async ({page}) => {
  await page.goto('/#/nodes');
  const sources = page.locator('.rp-table').first().locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(sources).toHaveCount(2);
  await expect(sources.first()).toContainText('sub-c');
  const nodes = page.locator('.rp-table').nth(1).locator('[role=rowgroup]:last-child [role=row][data-key]');
  await expect(nodes.first()).toBeVisible();
  expect(await nodes.count()).toBeGreaterThan(10);
  await sources.nth(1).click();
  await expect(page).toHaveURL(/provider=inline$/);
  await expect(nodes).toHaveCount(5);
  await page.getByRole('button', {name: 'Refresh sub-c', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('sub-c refreshed, 100 nodes');
});
