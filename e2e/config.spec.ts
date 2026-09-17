import {expect, test} from './fixtures';

test.use({viewport: {width: 1440, height: 1000}});

test('configuration sources list with the main source open, read-only ones cannot be edited', async ({page}) => {
  await page.goto('/#/config');
  await expect(page.getByRole('region', {name: '/etc/honk/config.dae'})).toContainText('tproxy_port: 12345');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
  const picker = page.getByRole('button', {name: /Source/});
  await expect(picker).toContainText('/etc/honk/config.dae');
  await picker.click();
  await expect(page.getByRole('option')).toHaveCount(4);
  await page.getByRole('option', {name: /sub-c\.dae/}).click();
  await expect(page).toHaveURL(/source=src-sub-c$/);
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toHaveCount(0);
  await expect(page.getByRole('region', {name: '/var/lib/honk/subscriptions/sub-c.dae'})).toContainText('redacted');
});

test('editing validates, shows diagnostics on errors, and saves through a reload', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.getByRole('textbox', {name: '/etc/honk/rules.dae'});
  const original = await editor.inputValue();
  await editor.fill(original + 'domain(geosite: netflix) -> nowhere\n');
  await page.getByRole('button', {name: 'Validate', exact: true}).click();
  const diagnostics = page.getByRole('list', {name: 'Diagnostics'});
  await expect(diagnostics.getByRole('listitem')).toHaveCount(1);
  await expect(diagnostics).toContainText('No group named "nowhere"');
  await expect(page.locator('.rp-toast.negative')).toContainText('Validation found 1 error');
  await editor.fill(original + 'domain(geosite: netflix) -> proxy\n');
  await expect(page.locator('.rp-badge', {hasText: 'Unsaved'})).toBeVisible();
  await page.getByRole('button', {name: 'Apply and reload', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'written'})).toContainText('configuration reloaded');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeVisible();
  await expect(page.getByRole('region', {name: '/etc/honk/rules.dae'})).toContainText('domain(geosite: netflix) -> proxy');
  await expect(page.locator('.rp-toolbar').first()).toContainText('41');
  await expect(page.locator('.rp-toolbar').nth(1)).toContainText('8 lines');
});

test.describe('without configuration readback', () => {
  test.use({storage: {'doona-mock-profile': 'base'}});

  test('the page is hidden from navigation and says so when opened', async ({page}) => {
    await page.goto('/#/config');
    await expect(page.locator('.rp-nav[href="#/config"]')).toHaveCount(0);
    await expect(page.locator('.rp-content')).toContainText('does not expose its configuration');
  });
});
