import {expect, faults, test} from './fixtures';

// Actions the faults scenario refuses the way honk would, through the mock rather than intercepted routes.
test.use({storage: faults});

test('a file saved on disk after the last reload refuses writes until honk reloads it', async ({page}) => {
  await page.goto('/#/config?source=src-rules');
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.fill((await editor.innerText()) + '\n# faults draft\n');
  const apply = page.getByRole('button', {name: 'Apply', exact: true});
  await apply.click();
  await expect(page.locator('.rp-toast.negative')).toContainText('changed');
  await apply.click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'not the running configuration'})).toContainText('Reload honk to apply the file');
  await expect(editor).toContainText('# faults draft');
});

test('a subscription whose host fails keeps its cached nodes and says why the refresh failed', async ({page}) => {
  await page.goto('/#/nodes?tab=list');
  const source = page.locator('.rp-table').first().locator('[role=row]', {hasText: 'harbor'});
  await expect(source).toContainText('Stale');
  await page.getByRole('button', {name: 'Update harbor', exact: true}).click();
  await expect(page.locator('.rp-toast.negative', {hasText: 'Could not update harbor'})).toContainText(
    'Could not fetch the subscription; the active nodes are kept'
  );
  await expect(source).toContainText('Stale');
});
