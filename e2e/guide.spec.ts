import {expect, mockBackend, test} from './fixtures';
import {ApiError} from '../src/api/error';
import {LANGS, loadLanguage, translate} from '../src/i18n';
import {guideContent} from '../src/features/guide/content';
import {guideSections, guideSectionId} from '../src/features/shared/guide';

test.beforeAll(() => Promise.all(LANGS.map(([lang]) => loadLanguage(lang))));

for (const [lang] of LANGS) {
  test.describe(lang, () => {
    test.use({storage: {'doona-lang': lang, 'doona-api': 'mock'}});
    test('the setup guide renders every section', async ({page}) => {
      const content = await guideContent[lang]();
      await page.goto('/#/guide');
      await expect(page.locator('.rp-h1')).toHaveText(translate(lang, 'guide.title'));
      for (const [index, id] of guideSections.entries()) await expect(page.locator(`#${guideSectionId(id)}`)).toHaveText(content.sections[index].title);
      await expect(page.getByRole('navigation', {name: translate(lang, 'guide.contents')}).getByRole('link')).toHaveCount(guideSections.length);
      // The example configuration is highlighted as dae.
      await expect(page.locator('#guide-config ~ pre .rp-dae-comment').first()).toBeVisible();
    });
  });
}

test.describe('links', () => {
  test.use({storage: {'doona-lang': 'en'}});

  test('an anchor scrolls to its section', async ({page}) => {
    await mockBackend(page);
    await page.goto('/#/guide?section=state-db');
    await expect(page.locator('#guide-state-db')).toBeInViewport();
  });

  test('the locked sign-in dialog opens the guide without a backend', async ({page}) => {
    const backend = await mockBackend(page);
    const refused = async () => {
      throw new ApiError(401, 'authentication_required', 'Authentication required');
    };
    backend.handlers['GET capabilities'] = refused;
    backend.handlers['GET version'] = refused;
    await page.goto('/#/activity');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('link', {name: 'Setup guide'}).click();
    await expect(page).toHaveURL(/#\/guide$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#guide-requirements')).toBeVisible();
  });

  test('settings links to the guide', async ({page}) => {
    await mockBackend(page);
    await page.goto('/#/settings');
    await page.getByRole('link', {name: 'Setup guide'}).click();
    await expect(page.locator('.rp-h1')).toHaveText('Setup guide');
  });
});
