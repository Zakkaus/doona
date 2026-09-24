import {expect, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('tabpanel', {name: 'Rule list'}).locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');

test('the add-rule switch explains the must keyword in each locale', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/rules?tab=list');
  for (const lang of ['zh-TW', 'en']) {
    for (const scheme of ['light', 'dark']) {
      await page.evaluate(
        ({lang, scheme}) => {
          localStorage.setItem('doona-lang', lang);
          localStorage.setItem('doona-scheme', scheme);
        },
        {lang, scheme}
      );
      await page.reload();
      await page
        .getByRole('button', {name: lang === 'en' ? 'Add rule' : '新增規則', exact: true})
        .first()
        .click();
      const control = page.getByRole('dialog').getByRole('switch');
      await expect(control).toHaveAccessibleName(lang === 'en' ? 'Require this outbound must' : '強制使用此出站 must');
      await expect(page.getByRole('dialog').locator('.rp-switch code')).toHaveText('must');
    }
  }
});

test('the rule list shows the dictionary in evaluation order with its source lines', async ({page}) => {
  await page.goto('/#/rules?tab=list');
  const list = rows(page);
  await expect(list).toHaveCount(9);
  await expect(list.first()).toContainText('domain(suffix: doubleclick.net)');
  await expect(list.first()).toContainText('config.dae:40');
  await expect(list.nth(5)).toContainText('rules.dae:3');
  await expect(list.last()).toContainText('fallback: resilient');
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('9 rules, generation 40');
  await list.first().getByRole('button', {name: 'Open source', exact: true}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-main&line=40$/);
});

test('a rule is added before the fallback and removed again through validate, save and reload', async ({page}) => {
  await page.goto('/#/rules?tab=list');
  const list = rows(page);
  await expect(list).toHaveCount(9);
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', {name: 'Expression', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Condition'}).fill('domain(geosite:netflix)');
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule written'})).toBeVisible();
  await expect(list).toHaveCount(10);
  await expect(list.nth(8)).toContainText('domain(geosite:netflix)');
  await expect(list.nth(8)).toContainText('gaming');
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('generation 41');
  await list.nth(8).getByRole('button', {name: 'Remove rule', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule removed'})).toBeVisible();
  await expect(list).toHaveCount(9);
  await expect(page.getByRole('tabpanel', {name: 'Rule list'})).toContainText('generation 42');
});

test('a consumed rule seed keeps edits across generation misalignment and accepts a new navigation', async ({page}) => {
  const api = createMockApi();
  const [capabilities, rules, config] = await Promise.all([api.capabilities(), api.rules(), api.config()]);
  for (const resource of Object.values(capabilities.resources)) resource.available = false;
  capabilities.resources.rules.available = true;
  capabilities.resources.config.available = true;
  capabilities.resources.config.writable = true;
  await page.addInitScript(() => localStorage.setItem('doona-api', location.origin));
  await page.route('**/api/v1/version', async route => route.fulfill({json: await api.version()}));
  await page.route('**/api/v1/capabilities', route => route.fulfill({json: capabilities}));
  await page.route('**/api/v1/rules', route => route.fulfill({json: rules}));
  await page.route('**/api/v1/config', route => route.fulfill({json: config}));
  await page.goto('/#/rules?tab=list&add=domainSuffix:seed.example');
  const dialog = page.getByRole('dialog', {name: 'Add rule', exact: true});
  const values = dialog.getByRole('textbox', {name: 'Values', exact: true});
  await expect(values).toHaveValue('seed.example');
  await values.fill('edited.example');
  rules.generation_id = '41';
  // Refresh while the modal is open simulates a background resource invalidation.
  const refresh = page.getByRole('button', {name: 'Refresh', exact: true, includeHidden: true});
  await refresh.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('tabpanel', {name: 'Rule list', includeHidden: true})).toContainText('generation 41');
  await expect(values).toHaveValue('edited.example');
  config.generation_id = '41';
  const updated = page.waitForResponse('**/api/v1/config');
  await refresh.evaluate((button: HTMLButtonElement) => button.click());
  await updated;
  await expect(refresh).not.toHaveAttribute('data-pending');
  await expect(values).toHaveValue('edited.example');
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('out of sync');
  await expect(values).toHaveValue('edited.example');
  await page.evaluate(() => {
    location.hash = '/rules?tab=list&add=dip:2001:db8::1';
  });
  await page.getByRole('alertdialog', {name: 'Discard unsaved changes?'}).getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(values).toHaveValue('2001:db8::1');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list$/);
  await page.evaluate(() => {
    location.hash = '/rules?tab=list&add=dip:2001:db8::1';
  });
  await expect(values).toHaveValue('2001:db8::1');
});
