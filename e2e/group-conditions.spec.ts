import {expect, mockBackend, test} from './fixtures';
import {readGroupEntries, writeGroupEntry} from '../src/dae/groups';

test.use({storage: {'doona-lang': 'en'}});
const compound = `name(keyword: "hk")  && ! name(keyword: '02')`;
async function setup(page: import('@playwright/test').Page, filters = [compound]) {
  const backend = await mockBackend(page);
  const main = (await backend.api.config()).sources.find(source => source.kind === 'main')!;
  await backend.api.pollOperation(
    await backend.api.replaceConfigSource(main.id, writeGroupEntry(main.content, 'visual', {filters, policy: 'min_moving_avg'}), `"${main.content_sha256}"`)
  );
  await page.goto('/#/policies?group=visual');
  const card = page.getByRole('region', {name: 'visual', exact: true});
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  return {...backend, dialog: page.getByRole('dialog', {name: 'Edit group visual', exact: true}), card};
}

test('compound filters open as visual condition rows and preserve untouched source bytes', async ({page}) => {
  const {api, dialog} = await setup(page);
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await expect(dialog.getByRole('button', {name: /Match by$/})).toHaveCount(2);
  await expect(dialog.getByRole('textbox', {name: 'Custom expression', exact: true})).toHaveCount(0);
  await expect(dialog.getByRole('textbox', {name: 'Values', exact: true}).nth(0)).toHaveValue('hk');
  await expect(dialog.getByRole('switch', {name: 'Negate condition', exact: true}).nth(1)).toBeChecked();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
});

test('unfiltered cards show an All nodes Tag with one pencil entry', async ({page}) => {
  await mockBackend(page);
  await page.goto('/#/policies?group=office');
  const card = page.getByRole('region', {name: 'office', exact: true});
  await expect(card.getByRole('group', {name: 'Includes', exact: true}).getByText('All nodes', {exact: true})).toBeVisible();
  await expect(card.getByText(/no filter/)).toHaveCount(0);
  await expect(card.getByRole('button', {name: 'Edit group', exact: true})).toHaveCount(1);
});

test('AND rows, negate and OR filters edit membership and undo incomplete drafts', async ({page}) => {
  const {api, dialog, card} = await setup(page);
  const values = dialog.getByRole('textbox', {name: 'Values', exact: true});
  await values.nth(1).fill('01');
  await dialog.getByRole('button', {name: 'Add AND condition', exact: true}).click();
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  await dialog
    .getByRole('button', {name: /Match by$/})
    .nth(2)
    .click();
  await expect(page.getByRole('option', {name: 'group', exact: true})).toHaveCount(0);
  await page.getByRole('option', {name: 'subtag keyword', exact: true}).click();
  await values.nth(2).fill('inline');
  await dialog.getByRole('button', {name: 'Remove condition', exact: true}).nth(2).click();
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await expect(dialog.getByText('OR', {exact: true})).toBeVisible();
  await dialog
    .getByRole('button', {name: /Match by$/})
    .nth(2)
    .click();
  await page.getByRole('option', {name: 'Exact names', exact: true}).click();
  await values.nth(2).fill('sg-01');
  await expect(dialog.getByRole('button', {name: 'Remove sg-01', exact: true})).toHaveCount(0);
  await values.nth(2).fill('');
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  await dialog.getByRole('button', {name: 'Undo', exact: true}).click();
  await expect(values.nth(2)).toHaveValue('sg-01');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  const entry = readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(entry => entry.name === 'visual')!;
  expect(entry.filters).toEqual([`name(keyword: 'hk') && !name(keyword: '01')`, `name('sg-01')`]);
  expect((await api.group('visual')).members.map(member => member.name)).toEqual(['hk-02', 'sg-01']);
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await expect(values).toHaveCount(2);
  await expect(dialog.getByRole('button', {name: 'Remove sg-01', exact: true})).toBeVisible();
});

test('only unrepresentable expressions keep the raw editor', async ({page}) => {
  const raw = "unsupported('hk')";
  const {api, dialog} = await setup(page, [compound, raw]);
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await expect(dialog.getByRole('textbox', {name: 'Custom expression', exact: true})).toHaveValue(raw);
  await expect(dialog.getByRole('button', {name: /Match by$/})).toHaveCount(2);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
});

test('Nodes creates a group through visual AND conditions', async ({page}) => {
  const {api} = await mockBackend(page);
  await page.goto('/#/nodes?provider=inline');
  await page
    .getByRole('row')
    .filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})})
    .getByRole('button', {name: 'Node actions', exact: true})
    .click();
  await page.getByRole('menuitem', {name: 'New group…', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'New group', exact: true});
  await dialog.getByRole('textbox', {name: 'Group name', exact: true}).fill('visual');
  await dialog.getByRole('button', {name: 'Remove hk-01', exact: true}).click();
  await dialog.getByRole('button', {name: 'Advanced', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values', exact: true}).fill('hk');
  await dialog.getByRole('button', {name: 'Add AND condition', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values', exact: true}).nth(1).fill('02');
  await dialog.getByRole('switch', {name: 'Negate condition', exact: true}).nth(1).focus();
  await page.keyboard.press('Space');
  await dialog.getByRole('button', {name: 'Create', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.group('visual')).members.map(member => member.name)).toEqual(['hk-01']);
});

test('nested groups have one selector and never appear among Advanced condition kinds', async ({page}) => {
  const {api, dialog, card} = await setup(page, [compound, 'group("auto")', "group('auto')"]);
  await expect(dialog.getByRole('button', {name: 'Groups', exact: true})).toHaveCount(1);
  await expect(dialog.getByRole('button', {name: 'Remove auto', exact: true})).toHaveCount(1);
  await dialog.getByRole('button', {name: 'Add filter', exact: true}).click();
  await dialog
    .getByRole('button', {name: /Match by$/})
    .last()
    .click();
  await expect(page.getByRole('option', {name: 'group', exact: true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', {name: 'Undo', exact: true}).click();
  await dialog.getByRole('button', {name: 'Groups', exact: true}).click();
  await expect(page.getByRole('option', {name: 'auto', exact: true})).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(
    readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(entry => entry.name === 'visual')!.filters
  ).toEqual([compound, 'group("auto")', "group('auto')"]);
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await dialog.getByRole('button', {name: 'Remove auto', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(
    readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(entry => entry.name === 'visual')!.filters
  ).toEqual([compound]);
});

test('mixed argument matches edit visually and keep OR inside a negated AND row', async ({page}) => {
  const source = `name(keyword: "hk", regex: '^jp') && name(regex: '^[a-z]')`;
  const {api, dialog, card} = await setup(page, [source]);
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await expect(dialog.getByRole('textbox', {name: 'Custom expression', exact: true})).toHaveCount(0);
  await expect(dialog.getByRole('textbox', {name: 'Values', exact: true})).toHaveCount(3);
  await expect(dialog.getByRole('switch', {name: 'Negate condition', exact: true})).toHaveCount(2);
  await expect(dialog.getByRole('group', {name: 'OR', exact: true})).toHaveCount(1);
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values', exact: true}).nth(1).fill('^sg');
  await dialog.getByRole('switch', {name: 'Negate condition', exact: true}).first().focus();
  await page.keyboard.press('Space');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(
    readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(entry => entry.name === 'visual')!.filters
  ).toEqual([`!name(keyword: 'hk', regex: '^sg') && name(regex: '^[a-z]')`]);
  expect((await api.group('visual')).members.map(member => member.name)).toEqual(['jp-01', 'us-01']);
});

test('OR matches can be added, removed and combined with the existing AND row', async ({page}) => {
  const {api, dialog, card} = await setup(page);
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await dialog.getByRole('button', {name: 'Add OR match', exact: true}).first().click();
  await expect(dialog.getByRole('button', {name: 'Apply', exact: true})).toBeDisabled();
  await dialog.getByRole('button', {name: 'Remove OR match', exact: true}).click();
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
  await card.getByRole('button', {name: 'Edit group', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add OR match', exact: true}).first().click();
  await dialog
    .getByRole('button', {name: /Match by$/})
    .nth(1)
    .click();
  await expect(page.getByRole('option', {name: 'subtag', exact: true})).toHaveCount(0);
  await page.getByRole('option', {name: 'Name regex', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values', exact: true}).nth(1).fill('^jp');
  await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(
    readGroupEntries((await api.config()).sources.find(source => source.kind === 'main')!.content).find(entry => entry.name === 'visual')!.filters
  ).toEqual([`name(keyword: 'hk', regex: '^jp') && !name(keyword: '02')`]);
  expect((await api.group('visual')).members.map(member => member.name)).toEqual(['hk-01', 'jp-01']);
});
