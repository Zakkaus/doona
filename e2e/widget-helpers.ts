import type {Page} from '@playwright/test';
import {expect, moreAction} from './fixtures';

export const panel = (page: Page) => page.locator('.rp-floating-panel');
export const editPanel = (page: Page) => moreAction(panel(page), 'Edit widgets', 'Panel options');
// The editor opens with nothing selected; a click on a preview row selects it and fills the inspector.
export async function pickWidget(page: Page, index = 0) {
  const row = page.locator('.rp-widget-preview .rp-sortable-row').nth(index);
  await row.click();
  await expect(row).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('.rp-widget-inspector button').first()).toBeVisible();
}
