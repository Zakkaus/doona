import {test, expect, mockBackend} from './fixtures';
import {ApiError} from '../src/api/error';
import type {Page} from '@playwright/test';

// A new subscription whose first fetch fails; `failures` sets how many fetches fail before one succeeds.
async function failingFirstFetch(page: Page, failures: number) {
  const backend = await mockBackend(page);
  let fetches = 0;
  let added = 0;
  backend.handlers['POST providers'] = async request => {
    // The toast names the subscription as typed, so a repeat can reuse the name under a fresh backend name.
    const body = request.postDataJSON();
    const created = await backend.api.createProvider({...body, name: added++ ? `${body.name}-${added}` : body.name});
    backend.handlers[`POST providers/${created.id}/refresh`] = async () => {
      if (fetches++ < failures) throw new ApiError(502, 'upstream_unavailable', 'Subscription server unreachable');
      return backend.api.refreshProvider(created.id);
    };
    return created;
  };
  return {fetches: () => fetches};
}
async function addSubscription(page: Page, name: string) {
  await page.getByRole('button', {name: 'Add subscription', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', {exact: true}).fill(name);
  await dialog.getByLabel('Subscription URL', {exact: true}).fill('https://example.org/sub');
  await dialog.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(dialog).toHaveCount(0);
}

test('a failed first fetch of a new subscription offers Retry, which stays until used and then closes', async ({page}) => {
  await page.clock.install();
  const backend = await failingFirstFetch(page, 1);
  await page.goto('/#/nodes?tab=list');
  await addSubscription(page, 'sub-t');
  const failure = page.locator('.rp-toast.negative', {hasText: 'sub-t was written to the configuration, but could not be refreshed'});
  const retry = failure.getByRole('button', {name: 'Retry', exact: true});
  await expect(retry).toBeVisible();
  // A plain toast leaves after five seconds; one with an action waits for the person.
  await page.clock.fastForward(10_000);
  await expect(retry).toBeVisible();
  // The toast region is a landmark: F6 reaches it from the page, and Tab reaches the action.
  await page.keyboard.press('F6');
  await expect.poll(() => page.locator('.rp-toasts').evaluate(region => region.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 4 && !(await retry.evaluate(button => button === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.rp-toast.positive', {hasText: 'sub-t added and refreshed'})).toBeVisible();
  await expect(failure).toHaveCount(0);
  expect(backend.fetches()).toBe(2);
  // The success toast has no action, so it times out as before.
  await page.clock.fastForward(6_000);
  await expect(page.locator('.rp-toast')).toHaveCount(0);
});

test('a repeated actionable toast replaces its earlier copy', async ({page}) => {
  await failingFirstFetch(page, 2);
  await page.goto('/#/nodes?tab=list');
  await addSubscription(page, 'sub-r');
  const failure = page.locator('.rp-toast.negative', {hasText: 'sub-r was written to the configuration, but could not be refreshed'});
  await expect(failure).toHaveCount(1);
  await addSubscription(page, 'sub-r');
  await expect(page.locator('.rp-toast')).toHaveCount(1);
  await expect(failure.getByRole('button', {name: 'Retry', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: /^Show all/})).toHaveCount(0);
});

test('the notification position setting moves the toasts and survives a reload', async ({page}) => {
  await failingFirstFetch(page, 9);
  await page.goto('/#/settings');
  await page.getByRole('button', {name: /Notification position/}).click();
  await page.getByRole('option', {name: 'Bottom corner', exact: true}).click();
  await page.reload();
  await expect(page.getByRole('button', {name: /Notification position/})).toContainText('Bottom corner');
  await page.goto('/#/nodes?tab=list');
  await addSubscription(page, 'sub-p');
  const region = page.locator('.rp-toasts');
  await expect(region).toHaveAttribute('data-placement', 'bottom');
  await expect(region).toHaveAttribute('data-align', 'end');
  const viewport = page.viewportSize()!;
  const box = (await region.boundingBox())!;
  expect(Math.round(viewport.width - (box.x + box.width))).toBe(16);
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 80);
});

test('toasts default to the bottom centre', async ({page}) => {
  await failingFirstFetch(page, 1);
  await page.goto('/#/nodes?tab=list');
  await addSubscription(page, 'sub-d');
  const region = page.locator('.rp-toasts');
  await expect(region).toHaveAttribute('data-placement', 'bottom');
  await expect(region).toHaveAttribute('data-align', 'center');
  const box = (await region.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
});

test('a failure toast leaves the request id out of its text and logs it', async ({page}) => {
  const warnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  const backend = await mockBackend(page);
  backend.handlers['POST providers/sub-c/refresh'] = async () => {
    throw new ApiError(502, 'upstream_unavailable', 'Subscription server unreachable', '0f8c2a4e-5b1d-4c3e-9a7f-2d6b8e1c4f90');
  };
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Refresh sub-c', exact: true}).click();
  const failure = page.locator('.rp-toast.negative');
  await expect(failure).toBeVisible();
  await expect(failure).not.toContainText('request_id');
  expect(warnings.filter(text => text.includes('request_id: 0f8c2a4e-5b1d-4c3e-9a7f-2d6b8e1c4f90'))).toHaveLength(1);
});
