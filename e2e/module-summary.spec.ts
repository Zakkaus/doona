import {translate, type Lang, type Translator} from '../src/i18n';
import {expect, loadCatalogues, mockBackend, test} from './fixtures';

const shots = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.DOONA_ERR_SHOTS === '1';

for (const {name, lang, viewport} of [
  {name: 'desktop-en-light', lang: 'en' as Lang, viewport: {width: 1440, height: 1000}},
  {name: 'phone-zh-CN-light', lang: 'zh-CN' as Lang, viewport: {width: 390, height: 844}}
]) {
  test.describe(name, () => {
    test.use({viewport, storage: {'doona-lang': lang, 'doona-scheme': 'light'}});
    test.beforeAll(loadCatalogues);
    const t: Translator = (key, params) => translate(lang, key, params);

    test('a locked module renders its note without an empty summary row', async ({page}) => {
      const {api} = await mockBackend(page);
      const config = await api.config();
      config.sources.push({
        ...config.sources[0],
        id: 'src-api',
        kind: 'include',
        path: '/etc/honk/api.dae',
        writable: false,
        content: 'experimental { native_api { secret: <redacted> } }'
      });
      await page.route('**/api/v1/config', route => route.fulfill({json: config}));
      await page.goto('/#/config');
      const card = page.getByRole('region', {name: 'experimental.native_api', exact: true}).filter({has: page.getByText('api.dae:1-1', {exact: true})});
      await expect(card).toBeVisible();
      await expect(card.locator('.rp-label:not(.rp-code)')).toHaveCount(1);
      await expect(card.locator('.rp-label:not(.rp-code)')).toHaveText(t('config.incomplete'));
      await expect(card.getByRole('button')).toHaveCount(0);
      await expect(page.getByRole('region', {name: 'global', exact: true}).locator('.rp-label:not(.rp-code)')).not.toBeEmpty();
      await card.scrollIntoViewIfNeeded();
      if (shots) await page.screenshot({path: `shots/card-${name}.png`});
    });
  });
}
