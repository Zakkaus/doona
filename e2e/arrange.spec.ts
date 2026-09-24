import {expect, mockBackend, test} from './fixtures';
import {ApiError} from '../src/api/error';

test.use({storage: {'doona-lang': 'en'}});

async function withRuleGroup(page: import('@playwright/test').Page) {
  const backend = await mockBackend(page);
  const main = (await backend.api.config()).sources.find(source => source.kind === 'main')!;
  const content = main.content!.replace('group {\n', "group {\n  hkauto { filter: name(keyword: 'hk') policy: min_moving_avg }\n");
  await backend.api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  // The replacement is an operation; the page must load the text it produced.
  await expect.poll(async () => (await backend.api.config()).sources.find(source => source.kind === 'main')!.content).toContain('hkauto');
  return backend;
}

test('arranging explains membership, stages edits by menu and drag, and applies them in one write', async ({page}) => {
  const backend = await withRuleGroup(page);
  await page.goto('/#/policies?tab=arrange');
  const card = (name: string) => page.locator('.rp-drop').filter({has: page.getByRole('heading', {name, exact: true})});
  // Why each group holds what it holds, in words.
  await expect(card('proxy')).toContainText('This group has no filter, so it holds every node.');
  await expect(card('skylink')).toContainText('Whole subscriptions');
  await expect(card('hkauto')).toContainText("name(keyword: 'hk')");
  await expect(card('hkauto')).toContainText('cannot be removed here');
  // The rule is explained by what it selects, with the evaluator honk's filters follow.
  await expect(card('hkauto')).toContainText('Selects now: hk-01, hk-02');
  // The only filter of a group cannot be removed, since the group would then hold every node.
  await expect(card('skylink').getByRole('button', {name: /^Remove /})).toBeDisabled();

  // Selection path: tick rows, then add them together from the bar under the tray.
  const tray = page.getByRole('grid', {name: 'Nodes and subscriptions'});
  await tray.getByRole('row', {name: /^sg-01/}).click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await page.getByRole('button', {name: 'Add to group'}).click();
  await page.getByRole('menuitem', {name: 'gaming'}).click();
  await expect(card('gaming')).toContainText('sg-01');
  await expect(page.getByRole('region', {name: 'Changes not applied'})).toContainText('1 change not applied');
  // A group that already holds every ticked item is not offered again.
  await tray.getByRole('row', {name: /^jp-01/}).click();
  await page.getByRole('button', {name: 'Add to group'}).click();
  await expect(page.getByRole('menuitem', {name: 'gaming'})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: 'Clear selection'}).click();

  // Keyboard drag, as react-aria offers it: from the row, ArrowRight to its drag handle, Enter, Tab through the
  // groups, Enter.
  await tray.getByRole('row', {name: /^us-01/}).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', {name: 'Drag us-01'})).toBeFocused();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 10 && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) !== 'Drop into group gaming'; i++)
    await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(card('gaming')).toContainText('us-01');

  // Remove an explicit member.
  await card('resilient').getByRole('button', {name: 'Remove hk-01 from resilient'}).click();
  // A staged removal stays in view, marked, until it is applied or undone.
  const undo = card('resilient').getByRole('button', {name: 'Undo removing hk-01'});
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(undo).toHaveCount(0);
  await card('resilient').getByRole('button', {name: 'Remove hk-01 from resilient'}).click();
  await expect(page.getByRole('region', {name: 'Changes not applied'})).toContainText('3 changes not applied');

  // Review lists each change in words; one write carries them all.
  await page.getByRole('button', {name: 'Review and apply'}).click();
  const review = page.getByRole('dialog', {name: 'Review changes'});
  await review.getByText('Show the configuration text to be written').click();
  const preview = review.locator('pre.rp-arrange-preview').first();
  await expect(preview.locator('.rp-dae-punctuation').first()).toBeVisible();
  expect(await preview.textContent()).toContain('{');
  await expect(review.getByRole('listitem')).toHaveText(['Add node sg-01 to gaming', 'Add node us-01 to gaming', 'Remove node hk-01 from resilient']);
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes('/config/sources/')) writes.push(request.postDataJSON().content);
  });
  await review.getByRole('button', {name: 'Apply'}).click();
  await expect(page.locator('.rp-toast.positive')).toContainText('Applied 3 changes and reloaded.');
  expect(writes).toHaveLength(1);
  const written = (await backend.api.config()).sources.find(source => source.kind === 'main')!.content!;
  expect(written).toContain('filter: name(jp-01, hk-02, sg-01, us-01)');
  expect(written).toContain('filter: name(sg-01, us-01)');
  expect(written).toContain("hkauto { filter: name(keyword: 'hk') policy: min_moving_avg }");
  await expect(page.getByRole('region', {name: 'Changes not applied'})).toHaveCount(0);
});

test('a new group needs a member before it can be applied, and undoing a change drops it', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/policies?tab=arrange');
  await page.getByRole('button', {name: 'New group'}).click();
  const dialog = page.getByRole('dialog', {name: 'New group'});
  await dialog.getByRole('textbox', {name: 'Group name'}).fill('bad name');
  await dialog.getByRole('button', {name: 'Create'}).click();
  await expect(dialog).toContainText('Use only letters, digits, underscores, periods and hyphens.');
  await dialog.getByRole('textbox', {name: 'Group name'}).fill('streaming');
  await dialog.getByRole('button', {name: 'Create'}).click();
  const card = page.locator('.rp-drop').filter({has: page.getByRole('heading', {name: 'streaming', exact: true})});
  await expect(card).toContainText('New');
  await page.getByRole('button', {name: 'Review and apply'}).click();
  const review = page.getByRole('dialog', {name: 'Review changes'});
  await expect(review).toContainText('Group streaming has no members yet');
  await expect(review.getByRole('button', {name: 'Apply'})).toBeDisabled();
  await review.getByRole('button', {name: 'Undo: Create group streaming'}).click();
  await expect(page.getByRole('region', {name: 'Changes not applied'})).toHaveCount(0);
});

// The events a mouse drag produces, with one DataTransfer carried from the tray row to the group card.
test('a pointer drag from the tray stages the node on the group it lands on', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/policies?tab=arrange');
  const row = page.getByRole('grid', {name: 'Nodes and subscriptions'}).getByRole('row', {name: /^us-01/});
  const gaming = page.locator('.rp-drop').filter({has: page.getByRole('heading', {name: 'gaming', exact: true})});
  await row.scrollIntoViewIfNeeded();
  const center = async (target: typeof row) => {
    const box = (await target.boundingBox())!;
    return {clientX: box.x + box.width / 2, clientY: box.y + box.height / 2};
  };
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await row.dispatchEvent('dragstart', {dataTransfer, ...(await center(row))});
  for (const type of ['dragenter', 'dragover', 'dragover']) await gaming.dispatchEvent(type, {dataTransfer, ...(await center(gaming))});
  await gaming.dispatchEvent('drop', {dataTransfer, ...(await center(gaming))});
  await row.dispatchEvent('dragend', {dataTransfer});
  await expect(gaming).toContainText('us-01');
  await expect(page.getByRole('region', {name: 'Changes not applied'})).toContainText('1 change not applied');
});

test('a failed node list is shown with a retry instead of loading forever', async ({page}) => {
  const backend = await mockBackend(page);
  let fail = true;
  backend.handlers['GET nodes'] = async () => {
    if (fail) throw new ApiError(503, 'unavailable', 'Node list unavailable');
    return backend.api.nodes();
  };
  await page.goto('/#/policies?tab=arrange');
  const alert = page.getByRole('alert').filter({hasText: 'Node list unavailable'});
  await expect(alert).toBeVisible();
  fail = false;
  await alert.getByRole('button', {name: 'Retry'}).click();
  await expect(page.getByRole('grid', {name: 'Nodes and subscriptions'})).toBeVisible();
});
