import {test, expect, expectApart, mockBackend, moreAction, box} from './fixtures';
import {ApiError} from '../src/api/error';
import type {Page} from '@playwright/test';
import type {Provider} from '../src/api/model';

// A new subscription whose first fetch fails; `failures` sets how many fetches fail before one succeeds.
async function failingFirstFetch(page: Page, failures: number) {
  const backend = await mockBackend(page);
  let fetches = 0;
  let added = 0;
  backend.handlers['POST providers'] = async request => {
    // The toast names the subscription as typed, so a repeat can reuse the name under a fresh backend name.
    const body = request.postDataJSON();
    const created = (await backend.api.createProvider({...body, name: added++ ? `${body.name}-${added}` : body.name})) as Provider;
    backend.handlers[`POST providers/${created.id}/refresh`] = async () => {
      if (fetches++ < failures) throw new ApiError(502, 'upstream_unavailable', 'Subscription server unreachable');
      return backend.api.refreshProvider(created.id);
    };
    backend.handlers[`DELETE providers/${created.id}`] = () => backend.api.deleteProvider(created.id);
    return created;
  };
  return {fetches: () => fetches};
}
async function addSubscription(page: Page, name: string) {
  const toolbar = page.locator('.rp-content .rp-toolbar').first();
  await expect(toolbar).toBeVisible();
  const add = toolbar.getByRole('button', {name: 'Add subscription', exact: true});
  if (await add.isVisible()) await add.click();
  else await moreAction(toolbar, 'Add subscription');
  const dialog = page.getByRole('dialog', {name: 'Add subscription', exact: true});
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
  const failure = page.locator('.rp-toast.negative', {hasText: 'sub-t was written to the configuration, but could not be updated'});
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
  const success = page.locator('.rp-toast.positive', {hasText: 'sub-t added and updated'});
  await expect(success).toBeVisible();
  await expect(failure).toHaveCount(0);
  expect(backend.fetches()).toBe(2);
  // The success toast offers the new nodes, so it also waits until used.
  await page.clock.fastForward(6_000);
  await success.getByRole('button', {name: 'View nodes', exact: true}).click();
  await expect(page.locator('.rp-toast')).toHaveCount(0);
});

// The boxes of a toast's parts, for the layout checks below.
async function parts(toast: ReturnType<Page['locator']>) {
  return toast.evaluate(toast => {
    const box = (selector: string | null) => {
      const rect = (selector ? toast.querySelector(selector) : toast)?.getBoundingClientRect();
      return rect ? {top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, middle: rect.top + rect.height / 2} : null;
    };
    return {
      toast: box(null)!,
      msg: box('.msg')!,
      summary: box('[slot="title"]')!,
      detail: box('[slot="description"]'),
      icon: box('.icon svg'),
      close: box('.close')!,
      foot: box('.foot'),
      action: box('.foot .action:last-child'),
      actions: [...toast.querySelectorAll('.foot .action')].map(el => el.getBoundingClientRect()),
      more: box('.more')
    };
  });
}

// The message column runs from the icon to the close button, 8px short of it, and the footer row sits 4px under the first
// row with the toast's 12px padding below it.
function expectMessageBesideClose(boxes: Awaited<ReturnType<typeof parts>>) {
  expect(Math.abs(boxes.close.left - boxes.msg.right - 8)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes.foot!.top - Math.max(boxes.msg.bottom, boxes.close.bottom) - 4)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes.toast.bottom - boxes.foot!.bottom - 12)).toBeLessThanOrEqual(1);
}

for (const width of [1280, 390])
  test(`a failure toast at ${width}px puts the error under its summary and the action on a footer row that ends where close ends`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await failingFirstFetch(page, 1);
    await page.goto('/#/nodes?tab=list');
    await addSubscription(page, 'sub-w');
    const failure = page.locator('.rp-toast.negative');
    await expect(failure.locator('[slot="title"]')).toHaveText('sub-w was written to the configuration, but could not be updated');
    await expect(failure.locator('[slot="description"]')).toContainText('Subscription server unreachable');
    const boxes = await parts(failure);
    expect(boxes.detail!.top).toBeGreaterThanOrEqual(boxes.summary.bottom);
    // Icon and close sit on the first line of the summary.
    for (const middle of [boxes.icon!.middle, boxes.close.middle]) expect(Math.abs(middle - (boxes.summary.top + 10))).toBeLessThanOrEqual(1);
    expect(boxes.action!.top).toBeGreaterThanOrEqual(boxes.detail!.bottom);
    expect(Math.abs(boxes.action!.right - boxes.close.right)).toBeLessThanOrEqual(1);
    // The error is copied from an action after Retry on that row, so the message keeps the width it has without it.
    await expect(failure.locator('.foot .action')).toHaveText(['Retry', 'Copy error']);
    expect(boxes.actions[0].right).toBeLessThan(boxes.actions[1].left);
    expectMessageBesideClose(boxes);
    // A toast without a detail shows only its summary, and one with neither an action nor a stack behind it has no
    // footer row.
    await failure.getByRole('button', {name: 'Retry', exact: true}).click();
    const success = page.locator('.rp-toast.positive');
    await expect(success).toBeVisible();
    await expect(success.locator('[slot="description"]')).toHaveCount(0);
    await success.getByRole('button', {name: 'View nodes', exact: true}).click();
    await moreAction(page.locator('body'), 'Remove sub-w', 'More actions for sub-w');
    await page.getByRole('alertdialog').getByRole('button', {name: 'Remove sub-w', exact: true}).click();
    const removed = page.locator('.rp-toast.positive', {hasText: 'sub-w removed'});
    await expect(removed).toBeVisible();
    await expect(removed.locator('.foot')).toHaveCount(0);
  });

for (const width of [1280, 390])
  test(`the front toast of a stack at ${width}px puts "show all" at the start of its footer row and the action at the end`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await failingFirstFetch(page, 9);
    await page.goto('/#/nodes?tab=list');
    await addSubscription(page, 'sub-s');
    await addSubscription(page, 'sub-u');
    const front = page.locator('.rp-toast:not(.background)');
    await expect(front.getByRole('button', {name: /^Show all/})).toBeVisible();
    const boxes = await parts(front);
    expect(Math.abs(boxes.action!.right - boxes.close.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes.action!.middle - boxes.more!.middle)).toBeLessThanOrEqual(1);
    expect(boxes.more!.right).toBeLessThan(boxes.action!.left);
    expect(boxes.more!.top).toBeGreaterThanOrEqual(boxes.detail!.bottom);
    expect(Math.abs(boxes.close.middle - (boxes.summary.top + 10))).toBeLessThanOrEqual(1);
  });

test('an expanded stack and its underlay close when the page changes', async ({page}) => {
  await failingFirstFetch(page, 9);
  await page.goto('/#/nodes?tab=list');
  await addSubscription(page, 'sub-s');
  await addSubscription(page, 'sub-u');
  await page
    .locator('.rp-toast:not(.background)')
    .getByRole('button', {name: /^Show all/})
    .click();
  await expect(page.locator('.rp-toast-underlay')).toHaveCount(1);
  // The underlay covers the navigation, so the page changes the way a shortcut or the browser's back button would.
  await page.evaluate(() => (location.hash = '#/rules'));
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Rules');
  await expect(page.locator('.rp-toast-underlay')).toHaveCount(0);
  await expect(page.locator('.rp-toasts')).not.toHaveClass(/expanded/);
  await expect(page.locator('.rp-toast.background')).not.toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Nodes');
  await expect(page.locator('.rp-toast-underlay')).toHaveCount(0);
  await expect(page.locator('.rp-toasts')).not.toHaveClass(/expanded/);
});

test('a repeated actionable toast replaces its earlier copy', async ({page}) => {
  await failingFirstFetch(page, 2);
  await page.goto('/#/nodes?tab=list');
  await addSubscription(page, 'sub-r');
  const failure = page.locator('.rp-toast.negative', {hasText: 'sub-r was written to the configuration, but could not be updated'});
  await expect(failure).toHaveCount(1);
  await addSubscription(page, 'sub-r');
  await expect(page.locator('.rp-toast')).toHaveCount(1);
  await expect(failure.getByRole('button', {name: 'Retry', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: /^Show all/})).toHaveCount(0);
});

test('the notification position setting moves the toasts and survives a reload', async ({page}) => {
  await failingFirstFetch(page, 9);
  await page.goto('/#/settings?tab=appearance');
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
  const rect = await box(region);
  expect(Math.round(viewport.width - (rect.x + rect.width))).toBe(16);
  expect(rect.y + rect.height).toBeGreaterThan(viewport.height - 80);
});

test('toasts default to the bottom centre', async ({page}) => {
  await failingFirstFetch(page, 1);
  await page.goto('/#/nodes?tab=list');
  await addSubscription(page, 'sub-d');
  const region = page.locator('.rp-toasts');
  await expect(region).toHaveAttribute('data-placement', 'bottom');
  await expect(region).toHaveAttribute('data-align', 'center');
  const rect = await box(region);
  expect(Math.abs(rect.x + rect.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
});

test('a failure toast leaves the request id out of its text and logs it', async ({page}) => {
  const warnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  const backend = await mockBackend(page);
  backend.handlers['POST providers/harbor/refresh'] = async () => {
    throw new ApiError(502, 'upstream_unavailable', 'Subscription server unreachable', '0f8c2a4e-5b1d-4c3e-9a7f-2d6b8e1c4f90');
  };
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Update harbor', exact: true}).click();
  const failure = page.locator('.rp-toast.negative');
  await expect(failure).toBeVisible();
  await expect(failure).not.toContainText('request_id');
  expect(warnings.filter(text => text.includes('request_id: 0f8c2a4e-5b1d-4c3e-9a7f-2d6b8e1c4f90'))).toHaveLength(1);
});

// A failed refresh leaves an error toast, which stays until read; the settings page's Add profile dialog then opens.
async function openDialogUnderErrorToast(page: Page) {
  const backend = await mockBackend(page);
  backend.handlers['POST providers/harbor/refresh'] = async () => {
    throw new ApiError(502, 'upstream_unavailable', 'Subscription server unreachable');
  };
  await page.goto('/#/nodes?tab=list');
  await page.getByRole('button', {name: 'Update harbor', exact: true}).click();
  const failure = page.locator('.rp-toast.negative');
  await expect(failure.locator('.foot .action')).toHaveText('Copy error');
  await page.goto('/#/settings');
  await page.getByRole('button', {name: 'Add profile', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add profile'});
  await dialog.getByRole('textbox', {name: 'Profile name'}).fill('Home');
  await expect(failure).toBeVisible();
  return failure;
}

for (const width of [1280, 390])
  test(`an error toast without an action at ${width}px copies its error from a footer row and stays above a dialog that opens`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await page.clock.install();
    const failure = await openDialogUnderErrorToast(page);
    const boxes = await parts(failure);
    expectMessageBesideClose(boxes);
    expect(Math.abs(boxes.action!.right - boxes.close.right)).toBeLessThanOrEqual(1);
    // A modal dialog starts below the toasts, which wait at the top: the stack's own height sets where it begins.
    await expectApart(failure, page.locator('.rp-modal'));
    expect((await box(failure)).y).toBeLessThan(20);
  });

test.describe('toasts at the end of the window', () => {
  test.use({storage: {'doona-toast-placement': 'bottom end'}});
  test('stack from the top centre while a dialog is open', async ({page}) => {
    await page.clock.install();
    const failure = await openDialogUnderErrorToast(page);
    await expectApart(failure, page.locator('.rp-modal'));
    const rect = await box(failure);
    expect(rect.y).toBeLessThan(20);
    expect(Math.abs(rect.x + rect.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
  });
});
