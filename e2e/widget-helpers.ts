import type {Page} from '@playwright/test';
import {moreAction} from './fixtures';

export const panel = (page: Page) => page.locator('.rp-floating-panel');
export const editPanel = (page: Page) => moreAction(panel(page), 'Edit widgets', 'Panel options');
