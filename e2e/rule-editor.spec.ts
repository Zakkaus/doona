import {expect, mockBackend, setAppearance, settle, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('tabpanel', {name: 'Routing rules'}).locator('.rp-table [role=rowgroup]:last-child [role=row][data-key]');

test('the add-rule switch explains the must keyword in each locale', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/rules?tab=list&view=advanced');
  for (const lang of ['zh-TW', 'en']) {
    for (const scheme of ['light', 'dark']) {
      await setAppearance(page, lang, scheme);
      await settle(page);
      await page.reload();
      await page
        .getByRole('button', {name: lang === 'en' ? 'Add rule' : '新增規則', exact: true})
        .first()
        .click();
      const control = page.getByRole('dialog').getByRole('switch', {name: /must$/});
      await expect(control).toHaveAccessibleName(lang === 'en' ? 'Lock this outbound must' : '鎖定此出站 must');
      await expect(control).toHaveAccessibleDescription(
        lang === 'en' ? /^When locked, a match takes this outbound directly/ : /^鎖定後，命中此規則就直接採用該出站/
      );
      await expect(page.getByRole('dialog').locator('.rp-switch code')).toHaveText('must');
    }
  }
});

test('the insert position is searchable by the rule it goes before', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/#/rules?tab=list&view=advanced');
  await page.getByRole('button', {name: 'Add rule', exact: true}).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: /Insert/}).click();
  const listbox = page.getByRole('listbox');
  // The first place and the end come first, without a heading.
  await expect(listbox.getByRole('option').first()).toContainText('First');
  await expect(listbox.getByRole('option').nth(1)).toContainText('Last, before the fallback');
  const later = listbox.getByRole('option').nth(3);
  const label = (await later.locator('.rp-il').innerText()).trim();
  const expression = (await later.locator('.desc').innerText()).trim();
  await page.getByRole('searchbox', {name: 'Filter positions'}).fill(expression);
  await expect(listbox.getByRole('option', {name: new RegExp(`^${label}`)})).toBeVisible();
  await listbox.getByRole('option', {name: new RegExp(`^${label}`)}).click();
  await expect(dialog.getByRole('button', {name: /Insert/})).toContainText(label);
});

test('the rule list shows the dictionary in evaluation order with its source lines', async ({page}) => {
  await page.goto('/#/rules?tab=list&view=advanced');
  const list = rows(page);
  await expect(list).toHaveCount(21);
  await expect(list.first()).toContainText('pname(NetworkManager)');
  await expect(list.first()).toContainText('config.dae:149');
  await expect(list.nth(7)).toContainText('domain(geosite:telegram)');
  await expect(list.last()).toContainText('fallback: proxy');
  await expect(page.getByRole('tabpanel', {name: 'Routing rules'})).toContainText('21 rules, generation 40');
  await expect(list.first().getByRole('button', {name: 'Open config file', exact: true})).toHaveCount(0);
  await list.first().getByRole('button', {name: 'Edit rule', exact: true}).click();
  await expect(page.getByRole('dialog').getByRole('textbox', {name: 'Values'})).toHaveCount(1);
});

test('bare include rules edit and remove in place, while unsupported calls keep Expression and the source link', async ({page}) => {
  const {api} = await mockBackend(page, {includedRule: true});
  const include = (await api.config()).sources.find(source => source.id === 'src-rules')!;
  const before = include.content.replace('\n\n', '\nmac(aa:bb:cc:dd:ee:ff) && ipversion(4) -> direct\n');
  await api.pollOperation(await api.replaceConfigSource(include.id, before, `"${include.content_sha256}"`));
  await page.goto('/#/rules?tab=list&view=advanced');
  const row = rows(page).filter({hasText: /domain\(geosite:\s*(openai|github)\)/});
  await expect(row).toContainText('rules.dae:6');
  await expect(row.getByRole('button', {name: 'Open config file', exact: true})).toHaveCount(0);
  await row.getByRole('button', {name: 'Edit rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit rule'});
  await expect(dialog.getByRole('textbox', {name: 'Values'})).toHaveValue('openai');
  await dialog.getByRole('textbox', {name: 'Values'}).fill('github');
  await dialog.getByRole('button', {name: 'Edit rule', exact: true}).click();
  await expect(dialog).toBeHidden();
  expect((await api.config()).sources.find(source => source.id === 'src-rules')!.content).toBe(before.replace('geosite:openai', 'geosite: github'));
  await row.getByRole('button', {name: 'Remove rule', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
  await expect(rows(page)).toHaveCount(21);
  expect((await api.config()).sources.find(source => source.id === 'src-rules')!.content).toBe(before.replace(/^.*domain\(geosite:openai\).*\n/m, ''));
  const unsupported = rows(page).filter({hasText: 'mac(aa:bb:cc:dd:ee:ff)'});
  await unsupported.getByRole('button', {name: 'Edit rule', exact: true}).click();
  await expect(dialog.getByRole('textbox', {name: 'Expression'})).toHaveValue('mac(aa:bb:cc:dd:ee:ff) && ipversion(4)');
  await expect(dialog.getByRole('textbox', {name: 'Values'})).toHaveCount(0);
  await dialog.getByRole('textbox', {name: 'Expression'}).fill('mac(aa:bb:cc:dd:ee:ff) && ipversion(6)');
  await dialog.getByRole('button', {name: 'Edit rule', exact: true}).click();
  await expect(dialog).toBeHidden();
  await expect(unsupported).toContainText('ipversion(6)');
  await unsupported.getByRole('button', {name: 'Open config file', exact: true}).click();
  await expect(page).toHaveURL(/#\/config\?tab=source&source=src-rules&line=3$/);
});

test('a rule is added before the fallback and removed again through validate, save and reload', async ({page}) => {
  await page.goto('/#/rules?tab=list&view=advanced');
  const list = rows(page);
  await expect(list).toHaveCount(21);
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', {name: 'Expression', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Condition'}).fill('domain(geosite:netflix)');
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  // The outbound picker is a group's final outbound picker without None and the nodes, which a rule cannot name.
  const outbounds = page.getByRole('listbox');
  await expect(outbounds.getByRole('group', {name: 'Built-in'}).getByRole('option')).toHaveText(['direct', 'block']);
  await expect(outbounds.getByRole('group', {name: 'Groups'}).getByRole('option')).toHaveText([
    'proxy',
    'auto',
    'hk',
    'jp',
    'us',
    'tw',
    'sg',
    'kr',
    'telegram',
    'ai',
    'youtube',
    'netflix'
  ]);
  await page.getByRole('searchbox', {name: 'Filter outbounds'}).fill('gam');
  await expect(outbounds.getByRole('option')).toHaveText(['gaming']);
  await page.getByRole('option', {name: 'gaming', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'New rule is in effect'})).toBeVisible();
  await expect(list).toHaveCount(22);
  await expect(list.nth(20)).toContainText('domain(geosite:netflix)');
  await expect(list.nth(20)).toContainText('gaming');
  await expect(list.nth(21)).toContainText('fallback: proxy');
  await expect(page.getByRole('tabpanel', {name: 'Routing rules'})).toContainText('generation 41');
  await list.nth(20).getByRole('button', {name: 'Remove rule', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Remove rule', exact: true}).click();
  await expect(page.locator('.rp-toast.positive', {hasText: 'Rule removed'})).toBeVisible();
  await expect(list).toHaveCount(21);
  await expect(page.getByRole('tabpanel', {name: 'Routing rules'})).toContainText('generation 42');
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
  await expect(page.getByRole('tabpanel', {name: 'Routing rules', includeHidden: true})).toContainText('generation 41');
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
  await page.getByRole('alertdialog', {name: 'Discard changes not applied?'}).getByRole('button', {name: 'Discard changes', exact: true}).click();
  await expect(values).toHaveValue('2001:db8::1');
  await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
  // Closing keeps the rule table the link opened.
  await expect(page).toHaveURL(/#\/rules\?tab=list&view=advanced$/);
  await page.evaluate(() => {
    location.hash = '/rules?tab=list&add=dip:2001:db8::1';
  });
  await expect(values).toHaveValue('2001:db8::1');
});

test('the routing picker writes a domain keyword condition', async ({page}) => {
  await page.goto('/#/rules?tab=list&view=advanced&add=domainKeyword:tracker');
  const dialog = page.getByRole('dialog', {name: 'Add rule', exact: true});
  await expect(dialog.getByRole('textbox', {name: 'Values', exact: true})).toHaveValue('tracker');
  await expect(dialog.getByRole('button', {name: /Match by$/})).toContainText('Domain keyword');
  await dialog.getByRole('button', {name: /Outbound$/}).click();
  await page.getByRole('option', {name: 'block', exact: true}).click();
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(rows(page).filter({hasText: 'domain(keyword: tracker)'})).toContainText('domain(keyword: tracker)');
});

for (const lang of ['en', 'zh-CN']) {
  test(`the open condition kind picker matches the values field height in ${lang}`, async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.addInitScript(value => localStorage.setItem('doona-lang', value), lang);
    await page.goto('/#/rules?tab=list&view=advanced&add=domainKeyword:tracker');
    const dialog = page.getByRole('dialog');
    const kind = dialog.getByRole('button', {name: lang === 'en' ? /Match by$/ : /依据$/});
    await kind.click();
    await expect(page.getByRole('option', {name: lang === 'en' ? 'Domain keyword' : '域名关键字', exact: true})).toBeVisible();
    const picker = await kind.boundingBox();
    const values = await dialog.locator('.rp-input').boundingBox();
    expect(picker!.height).toBe(values!.height);
  });
}

test('existing routing conditions reconstruct, change kind and values, negate, add and remove AND rows', async ({page}) => {
  const {api} = await mockBackend(page);
  const source = (await api.config()).sources.find(source => source.id === 'src-main')!;
  const original = 'pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53) -> direct(must)';
  const before = source.content.replace('pname(NetworkManager) -> direct', original + ' # doona: custom');
  await api.pollOperation(await api.replaceConfigSource(source.id, before, `"${source.content_sha256}"`));
  const rule = (await api.rules()).rules.find(rule => rule.expression.startsWith('pname(NetworkManager, systemd-resolved)'))!;
  await page.goto(`/#/rules?tab=list&view=advanced&edit=${encodeURIComponent(rule.rule_id)}`);
  const dialog = page.getByRole('dialog', {name: 'Edit rule'});
  for (const [i, value] of ['NetworkManager, systemd-resolved', 'udp', '53'].entries())
    await expect(dialog.getByRole('textbox', {name: 'Values'}).nth(i)).toHaveValue(value);
  await dialog.getByRole('textbox', {name: 'Values'}).first().fill('curl, wget');
  await dialog.locator('.rp-switch').filter({hasText: 'Negate condition'}).first().click();
  await dialog.getByRole('button', {name: 'Remove condition', exact: true}).nth(1).click();
  await dialog.getByRole('button', {name: 'Add AND condition', exact: true}).click();
  await expect(dialog.getByRole('button', {name: 'Edit rule', exact: true})).toBeDisabled();
  await dialog
    .getByRole('button', {name: /Match by$/})
    .last()
    .click();
  await page.getByRole('option', {name: 'Domain keyword', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values'}).last().fill('tracker');
  await dialog.getByRole('button', {name: 'Edit rule', exact: true}).click();
  await expect(dialog).toBeHidden();
  expect((await api.config()).sources.find(item => item.id === source.id)!.content).toBe(
    before.replace(original, '!pname(curl, wget) && dport(53) && domain(keyword: tracker) -> direct(must)')
  );
  await expect(page).toHaveURL(/#\/rules\?tab=list&view=advanced$/);
});

test('adding a compound rule uses the same condition rows and previews the serialized AND', async ({page}) => {
  await page.goto('/#/rules?tab=list&view=advanced&add=domainSuffix:example.com');
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await dialog.locator('.rp-switch').filter({hasText: 'Negate condition'}).click();
  await dialog.getByRole('button', {name: 'Add AND condition', exact: true}).click();
  await dialog
    .getByRole('button', {name: /Match by$/})
    .last()
    .click();
  await page.getByRole('option', {name: 'Destination port', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Values'}).last().fill('443');
  await expect(dialog.locator('.rp-code')).toHaveText('!domain(suffix: example.com) && dport(443)');
  // An expression edit carries back into the rows; one the rows cannot hold keeps the expression mode.
  await dialog.getByRole('radio', {name: 'Expression', exact: true}).click();
  const condition = dialog.getByRole('textbox', {name: 'Condition'});
  await condition.fill('mac(aa:bb:cc:dd:ee:ff)');
  await dialog.getByRole('radio', {name: 'Select', exact: true}).click();
  await expect(condition).toHaveValue('mac(aa:bb:cc:dd:ee:ff)');
  const hint = dialog.getByText('Condition rows cannot represent this expression.');
  await expect(hint).toBeVisible();
  await condition.fill('!domain(suffix: example.com) && dport(8443)');
  await expect(hint).toBeHidden();
  await dialog.getByRole('radio', {name: 'Select', exact: true}).click();
  await expect(dialog.getByRole('textbox', {name: 'Values'}).last()).toHaveValue('8443');
  await expect(dialog.locator('.rp-code')).toHaveText('!domain(suffix: example.com) && dport(8443)');
  await dialog.getByRole('button', {name: 'Add rule', exact: true}).click();
  await expect(dialog).toBeHidden();
  await expect(rows(page).filter({hasText: '!domain(suffix: example.com) && dport(8443)'})).toHaveCount(1);
});

test('an emptied expression goes back to one empty condition row', async ({page}) => {
  await page.goto('/#/rules?tab=list&view=advanced&add=domainSuffix:example.com');
  const dialog = page.getByRole('dialog', {name: 'Add rule'});
  await dialog.getByRole('button', {name: 'Add AND condition', exact: true}).click();
  await dialog.getByRole('radio', {name: 'Expression', exact: true}).click();
  await dialog.getByRole('textbox', {name: 'Condition'}).fill('');
  await dialog.getByRole('radio', {name: 'Select', exact: true}).click();
  await expect(dialog.getByRole('textbox', {name: 'Values'})).toHaveValue('');
});

test('editing an include refuses a changed generation and retains the condition draft', async ({page}) => {
  const {api, handlers, requests} = await mockBackend(page, {includedRule: true});
  await page.goto('/#/rules?tab=list&view=advanced');
  await rows(page).filter({hasText: 'domain(geosite:openai)'}).getByRole('button', {name: 'Edit rule', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Edit rule'});
  await dialog.getByRole('textbox', {name: 'Values'}).fill('github');
  handlers['GET rules'] = async () => ({...(await api.rules()), generation_id: '41'});
  handlers['GET config'] = async () => ({...(await api.config()), generation_id: '41'});
  await page.getByRole('button', {name: 'Refresh', exact: true, includeHidden: true}).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('tabpanel', {name: 'Routing rules', includeHidden: true})).toContainText('generation 41');
  await dialog.getByRole('button', {name: 'Edit rule', exact: true}).click();
  await expect(page.locator('.rp-toast.negative')).toContainText('out of sync');
  await expect(dialog.getByRole('textbox', {name: 'Values'})).toHaveValue('github');
  expect(requests.filter(request => request.method() === 'PUT')).toHaveLength(0);
});

test('kit pickers keep symmetric insets', async ({page}) => {
  await page.goto('/#/rules?view=advanced');
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const pickers = page.locator('.rp-selectbtn');
  await expect(pickers.first()).toBeVisible();
  expect(
    await pickers.evaluateAll(elements =>
      elements.every(el => {
        const style = getComputedStyle(el);
        return style.paddingInlineStart === style.paddingInlineEnd;
      })
    )
  ).toBe(true);
});

test('the add-rule mode switch hugs its segments instead of the dialog width', async ({page}) => {
  await page.goto('/#/rules?view=advanced');
  await page.getByRole('button', {name: 'Add rule', exact: true}).click();
  const track = page.getByRole('dialog').getByRole('radiogroup', {name: 'Condition form'});
  await expect(track).toBeVisible();
  const trackBox = await track.boundingBox();
  const segments = await track.getByRole('radio').evaluateAll(els => els.map(el => el.getBoundingClientRect().width));
  const dialog = await page.getByRole('dialog').boundingBox();
  // Track = segments + gaps + padding + border, a few pixels over their sum, and well under the dialog.
  expect(trackBox!.width - segments.reduce((a, b) => a + b, 0)).toBeLessThan(24);
  expect(trackBox!.width).toBeLessThan(dialog!.width / 2);
});
