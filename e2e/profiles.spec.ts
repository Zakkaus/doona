import {expect, expectLoadFailures, test} from './fixtures';
import {test as browserTest} from '@playwright/test';

// Tokens are saved explicitly; switching profiles never writes a draft into the profile being left.
test('profiles add, rename, switch, and delete without losing the route', async ({page}) => {
  // The built-in demo takes no token, so each profile points at an address of its own that refuses every read.
  expectLoadFailures(page, /\/(home|office)\/api/);
  await page.route(/\/(home|office)\/api/, route =>
    route.fulfill({status: 401, json: {error: {code: 'authentication_required', message: 'Token required', details: null}, request_id: 'profiles'}})
  );
  await page.goto('/#/settings?from=connections');
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', {name: 'Add profile', exact: true}).click();
  let dialog = page.getByRole('dialog', {name: 'Add profile'});
  await dialog.getByRole('textbox', {name: 'Profile name'}).fill('Home');
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', {name: 'Save', exact: true}).click()]);
  await expect(page.locator('[name=api]')).toHaveValue('mock');
  await page.locator('[name=api]').fill(origin + '/home');
  await page.locator('[name=token]').fill('home-secret');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Save', exact: true}).click()]);
  await page.getByRole('button', {name: 'Add profile', exact: true}).click();
  dialog = page.getByRole('dialog', {name: 'Add profile'});
  await dialog.getByRole('textbox', {name: 'Profile name'}).fill('Office');
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', {name: 'Save', exact: true}).click()]);
  await expect(page).toHaveURL(/#\/settings\?from=connections$/);
  await page.locator('[name=api]').fill(origin + '/office');
  await expect(page.locator('[name=token]')).toHaveValue('');
  await page.locator('[name=token]').fill('office-secret');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Save', exact: true}).click()]);
  await page.getByRole('button', {name: /Profile$/}).click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('option', {name: 'Home', exact: true}).click()]);
  await expect(page).toHaveURL(/#\/settings\?from=connections$/);
  await expect(page.locator('[name=token]')).toHaveValue('home-secret');
  await page.getByRole('button', {name: 'Rename profile', exact: true}).click();
  dialog = page.getByRole('dialog', {name: 'Rename profile'});
  await dialog.getByRole('textbox', {name: 'Profile name'}).fill('Home router');
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', {name: 'Save', exact: true}).click()]);
  await page.getByRole('button', {name: 'Delete profile', exact: true}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', {name: 'Delete profile'})).toBeHidden();
  await page.getByRole('button', {name: 'Delete profile', exact: true}).click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('alertdialog', {name: 'Delete profile'}).getByRole('button', {name: 'Delete profile'}).click()]);
  await expect(page.locator('[name=token]')).toHaveValue('office-secret');
  await page.getByRole('button', {name: 'Delete profile', exact: true}).click();
  await Promise.all([page.waitForEvent('load'), page.getByRole('alertdialog').getByRole('button', {name: 'Delete profile'}).click()]);
  await page.goto('/');
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.locator('[name=api]')).toHaveValue('');
});

test('corrupt stored profiles show one error without overwriting the stored data', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('doona-profiles', '{'));
  await page.goto('/#/activity');
  const error = page.locator('.rp-toast.negative');
  await expect(error).toHaveCount(1);
  await expect(error).toContainText('saved backend profiles');
  await page.goto('/#/settings');
  await expect(error).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('doona-profiles'))).toBe('{');
});

browserTest('a token draft survives persistence failure and can be retried', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('doona-lang', 'en');
    if (!localStorage.getItem('doona-profiles')) {
      localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin, token: ''}]));
      localStorage.setItem('doona-profile', 'home');
    }
  });
  await page.route('**/api/v1/**', route =>
    route.fulfill({
      status: 401,
      json: {error: {code: 'authentication_required', message: 'Token required', details: null}, request_id: 'login'}
    })
  );
  await page.goto('/#/activity');
  const token = page.getByLabel('Token', {exact: true});
  await token.fill('retain-this-token');
  // Full even after the stored chart history is given up, which is the one retry the save makes.
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    let refusals = 2;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'doona-profiles' && refusals) {
        if (!--refusals) Storage.prototype.setItem = setItem;
        throw new DOMException('Storage denied', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await expect(page.locator('.rp-login [role="alert"]')).toBeVisible();
  await expect(token).toHaveValue('retain-this-token');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Connect', exact: true}).click()]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('doona-profiles')!)[0].token)).toBe('retain-this-token');
});

test('a profile that cannot be saved says so in its dialog, again on each attempt', async ({page}) => {
  await page.goto('/#/settings');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'doona-profiles') throw new DOMException('Blocked', 'SecurityError');
      return setItem.call(this, key, value);
    };
  });
  await page.getByRole('button', {name: 'Add profile', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add profile'});
  const name = dialog.getByRole('textbox', {name: 'Profile name'});
  await name.fill('Home');
  const save = dialog.getByRole('button', {name: 'Save', exact: true});
  const alert = dialog.getByRole('alert');
  for (let attempt = 0; attempt < 2; attempt++) {
    await name.focus();
    await save.click();
    await expect(alert).toContainText('Could not save settings');
    await expect(alert).toBeFocused();
  }
  await expect(page.locator('.rp-toast')).toHaveCount(0);
});
