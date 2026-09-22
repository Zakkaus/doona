import {test as browserTest} from '@playwright/test';
import {expect, routes, test} from './fixtures';
import {createMockApi} from '../src/api/mock';

test('Disclosure toggles with Enter and Space and keeps focus on its trigger', async ({page}) => {
  await page.goto('/#/rules?tab=trace');
  const disclosure = page.locator('.rp-disclosure').first();
  const trigger = disclosure.getByRole('button', {name: 'Advanced', exact: true});
  const panel = disclosure.getByRole('group', {includeHidden: true});
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await panel.locator(':focus').count()).toBe(0);
});

test('connection test stays pending and suppresses repeated activation until discovery completes', async ({page}) => {
  let requests = 0;
  let release = () => {};
  const hold = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/pending-backend/api', async route => {
    requests++;
    await hold;
    await route.fulfill({json: {name: 'dae/honk-native', api_major: 1, base_path: '/api/v1', links: {}}});
  });
  await page.goto('/#/settings');
  await page.locator('[name=api]').fill(new URL(page.url()).origin + '/pending-backend');
  const control = page.getByRole('button', {name: 'Test connection', exact: true});
  await control.click();
  await expect(control).toHaveAttribute('data-pending');
  await expect(control).toHaveAttribute('aria-disabled', 'true');
  await expect(control.locator('.rp-spinner')).toBeVisible();
  await control.evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(control).not.toHaveAttribute('data-pending');
  await expect(page.locator('.rp-toast.positive')).toContainText('API v1');
  expect(requests).toBe(1);
});

test('a truncated table cell exposes the full value on hover and keyboard focus', async ({page}) => {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  capabilities.resources.events.available = false;
  const connections = await api.connections();
  const full = 'a-very-long-destination-name-that-does-not-fit-in-the-table-column.example.test';
  connections.tcp[0].domain = full;
  const responses: Record<string, unknown> = {
    '/capabilities': capabilities,
    '/version': await api.version(),
    '/connections': connections
  };
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-connections-view', JSON.stringify({hidden: [], sort: null, group: 'none'}));
  });
  await page.route('**/api/v1/**', route => route.fulfill({json: responses[new URL(route.request().url()).pathname.replace('/api/v1', '')]}));
  await page.goto('/#/connections');
  const cell = page.getByRole('rowheader').getByText(full, {exact: true});
  await expect(cell).toBeVisible();
  expect(await cell.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.mouse.move(0, 0);
  await cell.hover();
  await expect(page.getByRole('tooltip')).toHaveText(full);
  expect(await page.getByRole('tooltip').evaluate(el => [getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)', getComputedStyle(el).padding])).toEqual([
    true,
    '4px 8px'
  ]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
  await page.mouse.move(0, 0);
  // Keyboard users reach the text through grid navigation: the row, then its first cell.
  await page.locator('.rp-table [role="row"][data-key]').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(cell).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText(full);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect(cell).not.toHaveAttribute('title');
});

for (const route of routes) {
  browserTest(`${route} renders an inline error with an unreachable backend`, async ({page}) => {
    const exceptions: string[] = [];
    page.on('pageerror', error => exceptions.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('doona-api', 'http://127.0.0.1:1');
      localStorage.setItem('doona-lang', 'en');
    });
    await page.goto('/#/' + route);
    await expect(page.locator('.rp-content .rp-alert').first()).toContainText('Could not load data');
    await expect(page.locator('.rp-content h1')).toBeVisible();
    await expect(page.locator('.rp-content [role="status"]')).toHaveCount(0);
    expect(exceptions).toEqual([]);
  });
}

browserTest('API failures preserve request_id in the inline error', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('doona-api', location.origin);
    localStorage.setItem('doona-lang', 'en');
  });
  await page.route('**/api/v1/**', route =>
    route.fulfill({status: 503, json: {request_id: 'interaction-request-503', error: {code: 'unavailable', message: 'Backend unavailable'}}})
  );
  await page.goto('/#/connections');
  await expect(page.locator('.rp-content .rp-alert').first()).toContainText('request_id: interaction-request-503');
});

test('shared controls distinguish a held press from hover without moving', async ({page}) => {
  for (const [route, selector] of [
    ['settings', '.rp-selectbtn:not([disabled])'],
    ['settings', '.rp-btn.accent'],
    ['overview', '.rp-btn:not(.quiet):not(.accent)'],
    ['rules', '.rp-nav']
  ]) {
    await page.goto('/#/' + route);
    const control = page.locator(selector).filter({visible: true}).first();
    await expect(control).toBeEnabled();
    await control.scrollIntoViewIfNeeded();
    const bounds = await control.boundingBox();
    await control.hover();
    const hovered = await control.evaluate(el => getComputedStyle(el).backgroundColor);
    await page.mouse.down();
    await expect(control).toHaveAttribute('data-pressed');
    expect(await control.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(hovered);
    // The press scales the control about its centre; nothing around it moves.
    const pressed = (await control.boundingBox())!;
    expect(pressed.x + pressed.width / 2).toBeCloseTo(bounds!.x + bounds!.width / 2, 0);
    expect(pressed.y + pressed.height / 2).toBeCloseTo(bounds!.y + bounds!.height / 2, 0);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await page.keyboard.press('Escape');
  }
});

test('the engine version link is a styled control, not a bare anchor', async ({page}) => {
  await page.goto('/#/activity');
  const link = page.locator('.rp-version');
  await expect(link).toBeVisible();
  expect(await link.evaluate(el => [getComputedStyle(el).textDecorationLine, getComputedStyle(el).display])).toEqual(['none', 'flex']);
});

test('editor completion preserves policy keys and quoted-brace context', async ({page}) => {
  await page.goto('/#/config?tab=source');
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  const editor = page.locator('.cm-content[contenteditable="true"]');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('group { proxy {\n  policy: min');
  await page.keyboard.press('Control+Space');
  await page.getByRole('option', {name: 'min_avg10', exact: true}).click();
  await expect(editor).toContainText('policy: min_avg10');
  await expect(editor).not.toContainText('policy: policy:');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText("global {\n  log_file: '/tmp/}'\n  log_l");
  await page.keyboard.press('Control+Space');
  await page.getByRole('option', {name: 'log_level', exact: true}).click();
  await expect(editor).toContainText('log_level:');
});
