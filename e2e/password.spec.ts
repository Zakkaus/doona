import type {Request} from '@playwright/test';
import {expect, mockBackend, test} from './fixtures';
import {ApiError} from '../src/api/error';

// A password-mode backend: discovery says what to offer, protected reads need the session token.
async function passwordBackend(page: import('@playwright/test').Page, setupRequired: boolean) {
  const backend = await mockBackend(page);
  const state = {setupRequired, token: 'hnk1_session', attempts: [] as Array<{path: string; body: unknown; authorization?: string}>};
  const discovery = async () => ({
    ...(await backend.api.discovery()),
    auth: {mode: 'password', setup_required: state.setupRequired, anonymous_loopback: false}
  });
  backend.handlers['GET /api'] = discovery;
  backend.handlers['GET capabilities'] = async (request: Request) => {
    if (request.headers()['authorization'] !== 'Bearer ' + state.token) throw new ApiError(401, 'authentication_required', 'Authentication required');
    return backend.capabilities;
  };
  const session = {token: state.token, expires_at: new Date(Date.now() + 12 * 3600_000).toISOString()};
  const record = (path: string) => (request: Request) => {
    state.attempts.push({path, body: request.postDataJSON(), authorization: request.headers()['authorization']});
  };
  backend.handlers['POST auth/setup'] = async request => {
    record('setup')(request);
    if (!state.setupRequired) throw new ApiError(409, 'setup_already_completed', 'Setup already completed');
    state.setupRequired = false;
    return session;
  };
  backend.handlers['POST auth/login'] = async request => {
    record('login')(request);
    const {password} = request.postDataJSON();
    if (password !== 'correct horse battery') throw new ApiError(401, 'invalid_credentials', 'Invalid credentials');
    return session;
  };
  backend.handlers['POST auth/logout'] = async request => {
    record('logout')(request);
    state.token = 'hnk1_revoked';
    return null;
  };
  return state;
}

test.use({storage: {'doona-lang': 'en'}});

test('a first visit creates the administrator and continues with its session', async ({page}) => {
  const state = await passwordBackend(page, true);
  await page.goto('/#/activity');
  const form = page.locator('.rp-login');
  await expect(form.getByRole('heading')).toHaveText('Create the administrator');
  await form.getByLabel('Username', {exact: true}).fill('admin');
  await form.getByLabel('Password', {exact: true}).fill('correct horse battery');
  await form.getByLabel('Confirm password', {exact: true}).fill('correct horse batterx');
  await form.getByRole('button', {name: 'Create and sign in'}).click();
  // A field's own problem is reported on that field and costs no attempt against the backend.
  const confirm = form.getByLabel('Confirm password', {exact: true});
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('.rp-field', {hasText: 'Confirm password'})).toContainText('The passwords do not match.');
  expect(state.attempts).toHaveLength(0);
  await form.getByLabel('Confirm password', {exact: true}).fill('correct horse battery');
  await Promise.all([page.waitForEvent('load'), form.getByRole('button', {name: 'Create and sign in'}).click()]);
  expect(state.attempts).toEqual([{path: 'setup', body: {username: 'admin', password: 'correct horse battery'}, authorization: undefined}]);
  await expect(page.locator('.rp-login')).toHaveCount(0);
  await expect(page.locator('.rp-nav').first()).toBeVisible();
});

test('login reports wrong credentials, then signs in; a refused session asks again', async ({page}) => {
  const state = await passwordBackend(page, false);
  await page.goto('/#/activity');
  const form = page.locator('.rp-login');
  await expect(form.getByRole('heading')).toHaveText('Sign in');
  await expect(form.getByLabel('Confirm password', {exact: true})).toHaveCount(0);
  await form.getByLabel('Username', {exact: true}).fill('admin');
  await form.getByLabel('Password', {exact: true}).fill('wrong password here');
  await form.getByRole('button', {name: 'Sign in'}).click();
  // A refusal of the whole form shows once above it and takes focus.
  const refusal = form.locator('.rp-alert');
  await expect(refusal).toHaveText('The username or password is incorrect.');
  await expect(refusal).toBeFocused();
  await form.getByLabel('Password', {exact: true}).fill('correct horse battery');
  await Promise.all([page.waitForEvent('load'), form.getByRole('button', {name: 'Sign in'}).click()]);
  await expect(page.locator('.rp-nav').first()).toBeVisible();
  // The backend ends the session (restart, logout elsewhere): the next load asks to sign in and says why.
  state.token = 'hnk1_other';
  await page.reload();
  await expect(page.locator('.rp-login').getByRole('status')).toHaveText('The session has ended; sign in again.');
  expect(await page.evaluate(() => sessionStorage.getItem('doona-session'))).toBeNull();
});

test('signing out ends the session on the backend and in the tab', async ({page}) => {
  const state = await passwordBackend(page, false);
  const form = page.locator('.rp-login');
  await page.goto('/#/activity');
  await form.getByLabel('Username', {exact: true}).fill('admin');
  await form.getByLabel('Password', {exact: true}).fill('correct horse battery');
  await Promise.all([page.waitForEvent('load'), form.getByRole('button', {name: 'Sign in'}).click()]);
  await page.goto('/#/settings');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', {name: 'Sign out', exact: true}).click()]);
  expect(state.attempts.at(-1)).toMatchObject({path: 'logout', authorization: 'Bearer hnk1_session'});
  await page.goto('/#/activity');
  await expect(page.locator('.rp-login').getByRole('heading')).toHaveText('Sign in');
  // Signing out is not an ended session: no warning greets the next sign-in.
  await expect(page.locator('.rp-login .rp-alert')).toHaveCount(0);
});
