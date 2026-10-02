import {expect, test, editorText} from './fixtures';

test('a node joins an existing group or a new one through the name filter', async ({page}) => {
  await page.goto('/#/nodes?provider=inline');
  await page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'sg-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true})
    .click();
  await page.getByRole('menuitem', {name: 'Add to group', exact: true}).click();
  const menu = page.getByRole('menu', {name: 'Add to group', exact: true});
  await expect(menu.getByRole('menuitem', {name: /^auto/})).toHaveCount(0);
  await menu.getByRole('menuitem', {name: /^gaming/}).click();
  await page.getByRole('dialog', {name: 'Edit group gaming'}).getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Edit group gaming'})).toHaveCount(0);
  await page.goto('/#/nodes?provider=inline');
  await page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'us-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true})
    .click();
  await page.getByRole('menuitem', {name: 'Add to group', exact: true}).click();
  await page.getByRole('menuitem', {name: 'New group…', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', {name: 'Group name', exact: true}).fill('visual-travel');
  await expect(dialog.getByRole('button', {name: /Selection policy/})).toContainText('Fastest on average');
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Configuration for visual-travel written and reloaded'})).toBeVisible();
  await page.goto('/#/config?tab=source');
  expect(await editorText(page)).toContain('gaming {\n    filter: name(jp-01, hk-02)\n    filter: name(sg-01)\n    policy: min_last_delay\n  }');
  expect(await editorText(page)).toContain('visual-travel {\n    filter: name(us-01)\n    policy: min_moving_avg\n  }');
});

test('a group card edits its policy and filters in the main source', async ({page}) => {
  await page.goto('/#/policies?group=gaming');
  const card = page.getByRole('region', {name: 'gaming'});
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await dialog.getByRole('button', {name: 'Advanced', exact: true}).click();
  await expect(dialog.getByRole('group', {name: 'Includes', exact: true})).toContainText('jp-01');
  await expect(dialog.getByRole('group', {name: 'Includes', exact: true})).toContainText('hk-02');
  const policy = dialog.getByRole('button', {name: /Selection policy/});
  // The native value stays selected under its translated label.
  await expect(policy).toContainText('Fastest on average');
  await policy.click();
  await expect(page.getByRole('option', {name: /^First available/})).toContainText('Uses the current node until it fails, then the next in order');
  await page.getByRole('option', {name: /^First available/}).click();
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('button', {name: /Match by$/}).click();
  await page.getByRole('option', {name: 'subtag', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values', exact: true}).fill('harbor');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for gaming written and reloaded');
  await page.goto('/#/config?tab=source');
  expect(await editorText(page)).toContain("gaming {\n    filter: name(jp-01, hk-02)\n    filter: subtag('harbor')\n    policy: fallback\n  }");
});

test('editing only filters preserves the native policy spelling', async ({page}) => {
  await page.goto('/#/policies');
  await page.getByRole('region', {name: 'gaming'}).scrollIntoViewIfNeeded();
  await page.getByRole('region', {name: 'gaming'}).getByRole('button', {name: 'Edit group', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit group gaming'});
  await dialog.getByRole('button', {name: 'Advanced', exact: true}).click();
  await expect(dialog.getByRole('button', {name: /Selection policy/})).toContainText('Fastest on average');
  await dialog.getByRole('button', {name: 'Remove jp-01', exact: true}).click();
  await dialog.getByRole('button', {name: 'Remove hk-02', exact: true}).click();
  await dialog.getByRole('button', {name: 'Nodes', exact: true}).click();
  await page.getByRole('option', {name: 'hk-01', exact: true}).click();
  await page.getByRole('option', {name: 'sg-01', exact: true}).click();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Configuration for gaming written and reloaded');
  await page.goto('/#/config?tab=source');
  expect(await editorText(page)).toContain('gaming {\n    filter: name(hk-01)\n    filter: name(sg-01)\n    policy: min_last_delay\n  }');
});

test('a rule condition is composed from a kind and values, or typed as an expression', async ({page}) => {
  await page.goto('/#/rules?tab=list&view=advanced');
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: /Match by$/}).click();
  await page.getByRole('option', {name: 'geosite category', exact: true}).click();
  await dialog.getByLabel('Values').fill('netflix, disney');
  await expect(dialog.locator('.rp-code')).toHaveText('domain(geosite: netflix, geosite: disney)');
  await dialog.getByRole('radio', {name: 'Expression', exact: true}).click();
  await expect(dialog.getByRole('textbox', {name: 'Condition'})).toHaveValue('domain(geosite: netflix, geosite: disney)');
  await dialog.getByRole('textbox', {name: 'Condition'}).fill('domain(geosite: netflix, geosite: disney) && l4proto(tcp)');
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'New rule is in effect'})).toBeVisible();
  const list = page.getByRole('tabpanel', {name: 'Routing rules'}).locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');
  await expect(list.filter({hasText: 'domain(geosite: netflix, geosite: disney) && l4proto(tcp)'})).toContainText(
    'domain(geosite: netflix, geosite: disney) && l4proto(tcp)'
  );
});
