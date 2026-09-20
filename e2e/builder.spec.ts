import {expect, test} from './fixtures';

// The pages that write the group and routing sections from what they show: a node joins a group, a group's
// policy and filters are edited in place, and a rule condition is composed from a kind and its values.

test('a node joins an existing group or a new one through the name filter', async ({page}) => {
  await page.goto('/#/nodes?provider=inline');
  await page.getByRole('button', {name: 'Add jp-01 to a group', exact: true}).click();
  const menu = page.getByRole('menu');
  // Groups the node is already in are not offered.
  await expect(menu.getByRole('menuitemradio', {name: /^gaming/})).toHaveCount(0);
  await menu.getByRole('menuitemradio', {name: /^resilient/}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('jp-01 added to resilient');
  await page.getByRole('button', {name: 'Add sg-01 to a group', exact: true}).click();
  await page.getByRole('menuitemradio', {name: 'New group…', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('backup');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'sg-01 added to backup'})).toBeVisible();
  await page.goto('/#/config');
  await expect(page.locator('.cm-content')).toContainText('resilient {\n    filter: name(hk-01, sg-01, us-01, jp-01)\n    policy: min_avg10\n  }');
  await expect(page.locator('.cm-content')).toContainText('backup {\n    filter: name(sg-01)\n  }');
});

test('a group card edits its policy and filters in the main source', async ({page}) => {
  await page.goto('/#/policies');
  const card = page.getByRole('region', {name: 'gaming'});
  await card.getByRole('button', {name: 'Edit', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await expect(dialog.getByRole('textbox', {name: 'Filter 1'})).toHaveValue('name(jp-01, hk-02)');
  await dialog.getByRole('button', {name: /Policy$/}).click();
  await page.getByRole('option', {name: 'Lowest latency', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Filter 2'}).fill("subtag('sub-c')");
  await dialog.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Config updated for gaming');
  await page.goto('/#/config');
  await expect(page.locator('.cm-content')).toContainText("gaming {\n    filter: name(jp-01, hk-02)\n    filter: subtag('sub-c')\n    policy: urltest\n  }");
});

test('a rule condition is composed from a kind and values, or typed as an expression', async ({page}) => {
  await page.goto('/#/rules?tab=list');
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: /Match by$/}).click();
  await page.getByRole('option', {name: 'geosite category', exact: true}).click();
  await dialog.getByLabel('Values').fill('netflix, disney');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(geosite: netflix, disney)');
  await dialog.getByRole('radio', {name: 'Expression', exact: true}).click();
  await expect(dialog.getByRole('textbox', {name: 'Condition'})).toHaveValue('domain(geosite: netflix, disney)');
  await dialog.getByRole('textbox', {name: 'Condition'}).fill('domain(geosite: netflix, disney) && l4proto(tcp)');
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule written'})).toBeVisible();
  const list = page.getByRole('tabpanel', {name: 'Rule list'}).locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(list.nth(8)).toContainText('domain(geosite: netflix, disney) && l4proto(tcp)');
});
