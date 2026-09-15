import {test as base, expect} from '@playwright/test';

// Route IDs from src/shell/registry.ts; importing it would load page components.
export const routes = [
  'activity',
  'overview',
  'connections',
  'flows',
  'clients',
  'policies',
  'rules',
  'dns',
  'resources',
  'config',
  'validate',
  'events',
  'settings'
] as const;
export const compatRoutes: readonly string[] = ['resources', 'config', 'validate'];

export const test = base.extend<{storage: Record<string, string>}>({
  storage: [{}, {option: true}],
  page: async ({page, storage}, use) => {
    const errors: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    await page.addInitScript(
      values => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      },
      {'doona-scheme': 'light', 'doona-lang': 'en', ...storage}
    );
    await use(page);
    expect(errors, 'Browser errors').toEqual([]);
  }
});

export {expect};
