import {test as base, expect, type Page} from '@playwright/test';

// Route IDs from src/shell/registry.ts; importing it would load page components.
export const routes = ['activity', 'overview', 'connections', 'dns', 'policies', 'rules', 'nodes', 'config', 'events', 'logs', 'settings'] as const;

// DOONA_API and optional DOONA_TOKEN run read-only specs against a live backend; e2e has no Node globals.
// Example: DOONA_API=http://127.0.0.1:9527 DOONA_TOKEN=... pnpm e2e:live
const env = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env ?? {};
const live = env.DOONA_API ? {'doona-api': env.DOONA_API, 'doona-api-token': env.DOONA_TOKEN ?? ''} : {};

// A live backend hides the pages it has no capability for and may have nothing to list; the mock offers every page.
export const isLive = !!env.DOONA_API;
export const offered = async (page: Page, route: string) => {
  if (!isLive) return true;
  // The navigation marks nothing until the capabilities arrive.
  await expect(page.locator('nav.rp-side')).not.toHaveAttribute('aria-busy', 'true');
  return (await page.locator(`.rp-nav[href="#/${route}"]:not([data-unavailable])`).count()) > 0;
};

export const test = base.extend<{storage: Record<string, string>}>({
  storage: [{}, {option: true}],
  page: async ({page, storage}, use) => {
    const errors: string[] = [];
    page.on('console', message => {
      // The first-visit discovery request is expected to 404 on a static host.
      const discovery = /\/api$/.test(message.location().url) && message.text().includes('404');
      if (message.type() === 'error' && !discovery) errors.push(`console: ${message.text()}`);
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
