import {expect, isLive, test} from './fixtures';
import {version} from '../src/api/mock/fixtures';

test.use({storage: {'doona-lang': 'en'}});
test.skip(isLive, 'The facts and the state are the demo backend’s');

const engine = `${version.engine.name} ${version.engine.version}`;

test('the backend indicator shows the facts, opens About doona and closes on Escape', async ({page}) => {
  await page.goto('/#/activity');
  const indicator = page.locator('.rp-side').getByRole('button', {name: `Backend: ${engine}, Connected`});
  await expect(indicator).toHaveText(engine);
  await expect(page.locator('.rp-side a[href*="github"]')).toHaveCount(0);
  await indicator.click();
  const popover = page.getByRole('dialog', {name: 'Backend'});
  for (const fact of ['Engine', engine, 'API', 'Built-in demo data', 'Status', 'Connected']) await expect(popover).toContainText(fact);
  await expect(popover.getByRole('link', {name: `${version.engine.name} project page`})).toHaveAttribute('href', new RegExp(`/${version.engine.name}$`));
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(indicator).toBeFocused();

  await indicator.click();
  await popover.getByRole('button', {name: 'About doona'}).click();
  const about = page.getByRole('dialog', {name: 'About doona'});
  await expect(about).toContainText('doona talks only to the backend you connect it to. It collects no data and sends nothing anywhere else.');
  await expect(popover).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(about).toBeHidden();
});

test('below the side navigation the overflow menu opens the same popover', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/activity');
  const more = page.getByRole('button', {name: 'More options'});
  await more.click();
  await page.getByRole('menuitem', {name: 'Backend'}).click();
  const popover = page.getByRole('dialog', {name: 'Backend'});
  await expect(popover).toContainText(engine);
  await expect(popover.getByRole('button', {name: 'About doona'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(more).toBeFocused();
});
