import {test as base, expect, type Page} from '@playwright/test';

// Route IDs from src/shell/registry.ts; importing it would load page components.
export const routes = ['activity', 'overview', 'connections', 'dns', 'policies', 'rules', 'nodes', 'config', 'events', 'logs', 'settings'] as const;

// `DOONA_API` (and `DOONA_TOKEN`) point the read-only specs at a live backend instead of the mock:
// DOONA_API=http://127.0.0.1:9527 DOONA_TOKEN=... pnpm e2e:live
// The e2e tsconfig has no Node types; the environment is read through globalThis.
const env = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env ?? {};
const live = env.DOONA_API ? {'doona-api': env.DOONA_API, 'doona-api-token': env.DOONA_TOKEN ?? ''} : {};

export const test = base.extend<{storage: Record<string, string>}>({
  storage: [{}, {option: true}],
  page: async ({page, storage}, use) => {
    const errors: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    // Seeds run on every navigation, so they only fill keys the page has not written itself:
    // a preference changed in the page must survive a reload the way it does for a user.
    await page.addInitScript(
      values => {
        for (const [key, value] of Object.entries(values)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      },
      {'doona-scheme': 'light', 'doona-lang': 'en', ...live, ...storage}
    );
    await use(page);
    expect(errors, 'Browser errors').toEqual([]);
  }
});

// The selected item's detail: an aside beside the list on wide screens, a drawer below 1200px.
export const detail = (page: Page) => page.locator('.rp-panel, .rp-drawer');

export {expect};
