import {detail, expect, mockBackend, test, pickOutbound} from './fixtures';

test.use({viewport: {width: 1440, height: 900}});
const dialogOf = (page: import('@playwright/test').Page) => page.getByRole('dialog', {name: 'Add rule', exact: true});

test('the connection list toolbar adds a rule for the selected row', async ({page}) => {
  await page.goto('/#/connections?tab=list');
  const add = page.locator('.rp-toolbar').getByRole('button', {name: 'Add rule', exact: true});
  await expect(add).toBeDisabled();
  await expect(page.getByText('Select a row first', {exact: true})).toBeVisible();
  await expect(add).toHaveAccessibleDescription('Select a row first');
  // Clicking a row selects the connection the toolbar acts on.
  await page.getByRole('rowheader', {name: 'cdn.bilibili.com', exact: true}).click();
  await expect(page.locator('.rp-panel .rp-h3')).toHaveText('cdn.bilibili.com');
  await add.click();
  await expect(dialogOf(page).locator('.rp-code')).toHaveText(/^domain\(full: cdn\.bilibili\.com\)/);
  await dialogOf(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialogOf(page)).toHaveCount(0);
  await page.goto('/#/connections?tab=list&id=1');
  await expect(detail(page).getByRole('heading', {name: 'api.telegram.org'})).toBeVisible();
  await add.click();
  await pickOutbound(dialogOf(page), 'proxy');
  await expect(dialogOf(page).locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> proxy');
  // The destination address is offered beside the domain, as one host.
  await dialogOf(page)
    .getByRole('button', {name: /Match by$/})
    .click();
  await page.getByRole('option', {name: 'Destination IP', exact: true}).click();
  await expect(dialogOf(page).locator('.rp-code')).toHaveText(/^dip\([\d.]+\/32\) -> proxy$/);
  await dialogOf(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(dialogOf(page)).toHaveCount(0);
});

test('an outbound the configuration does not name is not replaced by the first choice', async ({page}) => {
  const {api, handlers} = await mockBackend(page);
  handlers['GET connections'] = async () => {
    const list = await api.connections({detail: 'full', limit: 1000});
    return {...list, tcp: list.tcp.map(row => ({...row, outbound: 'retired-group'}))};
  };
  await page.goto('/#/connections?tab=list&id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = dialogOf(page);
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org)');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeDisabled();
  await expect(dialog).toContainText('Choose an outbound');
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await page.getByRole('option', {name: 'direct', exact: true}).click();
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> direct');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeEnabled();
});

test('a trace result adds a rule for the traced target', async ({page}) => {
  await page.goto('/#/rules?tab=trace');
  await page.getByLabel('Domain', {exact: true}).fill('api.telegram.org');
  await page.getByLabel('Destination IP', {exact: true}).fill('149.154.167.220');
  await page.getByLabel('Destination port', {exact: true}).fill('443');
  await page.getByRole('button', {name: 'Run trace', exact: true}).click();
  const card = page.locator('.rp-card').filter({has: page.getByRole('heading', {name: '149.154.167.220', exact: true})});
  await card.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(dialogOf(page).locator('.rp-code')).toContainText('domain(full: api.telegram.org)');
  await dialogOf(page).getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=trace$/);
});

test('adding and reloading ends with View rule, which selects the new rule in the list', async ({page}) => {
  await page.goto('/#/connections?tab=list&id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  await pickOutbound(dialogOf(page), 'proxy');
  await dialogOf(page).getByRole('button', {name: 'Apply', exact: true}).click();
  const toast = page.locator('.rp-toast.positive', {hasText: 'New rule is in effect'});
  await toast.getByRole('button', {name: 'View rule', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&rule=/);
  await expect(page.locator('.rp-table [aria-selected="true"]')).toContainText('domain(full: api.telegram.org)');
});

test('holding ends with Review held rules, which opens the held section', async ({page}) => {
  await page.goto('/#/connections?tab=list&id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  await pickOutbound(dialogOf(page), 'proxy');
  await dialogOf(page).getByRole('button', {name: 'Hold', exact: true}).click();
  await page.locator('.rp-toast.positive', {hasText: 'Rule held'}).getByRole('button', {name: 'Review held rules', exact: true}).click();
  await expect(page).toHaveURL(/#\/rules\?tab=list&held=1$/);
  await expect(page.getByRole('region', {name: 'Pending: 1'})).toBeFocused();
});

test('a rule already listed or held with the same condition and outbound is named, without blocking', async ({page}) => {
  await page.goto('/#/connections?tab=list&id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = dialogOf(page);
  await pickOutbound(dialog, 'proxy');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> proxy');
  await expect(dialog).not.toContainText('same condition and outbound');
  await dialog.getByRole('button', {name: 'Hold', exact: true}).click();
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  await pickOutbound(dialog, 'proxy');
  await expect(dialog).toContainText('A held rule already has the same condition and outbound.');
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeEnabled();
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  // A rule the list already holds is named by its number.
  await page.goto('/#/connections?tab=list&id=2');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  await pickOutbound(dialog, 'direct');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: cdn.bilibili.com) -> direct');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  await pickOutbound(dialog, 'direct');
  await expect(dialog).toContainText(/Rule \d+ already has the same condition and outbound\./);
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeEnabled();
});

test('without a writable configuration the dialog still opens and copies the rule', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const {capabilities} = await mockBackend(page);
  capabilities.resources.config.writable = false;
  await page.goto('/#/connections?tab=list&id=1');
  await detail(page).getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = dialogOf(page);
  // Without an outbound there is no rule to copy yet.
  await expect(dialog.getByRole('button', {name: 'Copy rule', exact: true})).toBeDisabled();
  await pickOutbound(dialog, 'proxy');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(full: api.telegram.org) -> proxy');
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  await expect(dialog.getByRole('button', {name: 'Hold', exact: true})).toBeDisabled();
  await expect(dialog).toContainText('Configuration writes are unavailable here. Copy the rule instead.');
  await dialog.getByRole('button', {name: 'Copy rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule copied'})).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('domain(full: api.telegram.org) -> proxy');
});

test.describe('disabled actions on touch', () => {
  test.use({viewport: {width: 390, height: 844}, hasTouch: true});

  test('Add rule shows its reason without hover until a connection is selected', async ({page}) => {
    await mockBackend(page);
    await page.goto('/#/connections?tab=list');
    const add = page.locator('.rp-toolbar').getByRole('button', {name: 'Add rule', exact: true, includeHidden: true});
    const reason = page.locator('.rp-label').filter({hasText: /^Select a row first$/});
    await expect(add).toBeDisabled();
    await expect(reason).toBeVisible();
    await expect(add).toHaveAccessibleDescription('Select a row first');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.getByRole('rowheader', {name: 'cdn.bilibili.com', exact: true}).tap();
    await expect(add).toBeEnabled();
    await expect(reason).toHaveCount(0);
    await expect(add).not.toHaveAttribute('aria-describedby');
  });
});
