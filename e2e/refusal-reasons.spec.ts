import {translate, type Lang, type Translator} from '../src/i18n';
import {expect, expectLoadFailures, loadCatalogues, mockBackend, moreAction, test} from './fixtures';

const shots = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.DOONA_ERR_SHOTS === '1';

for (const {name, lang, viewport} of [
  {name: 'desktop-en-light', lang: 'en' as Lang, viewport: {width: 1440, height: 1000}},
  {name: 'phone-zh-CN-light', lang: 'zh-CN' as Lang, viewport: {width: 390, height: 844}}
]) {
  test.describe(name, () => {
    test.use({viewport, storage: {'doona-lang': lang, 'doona-scheme': 'light'}});
    test.beforeAll(loadCatalogues);
    const t: Translator = (key, params) => translate(lang, key, params);

    test('the demo listener source reports its secret reason and remains read-only', async ({page}) => {
      await mockBackend(page);
      await page.goto('/#/config?tab=source&source=src-auth');
      await expect(page.getByText(t('config.secretSource'), {exact: true})).toBeVisible();
      await expect(page.getByText(t('ui.refusal.listenerSecretSource'), {exact: true})).toBeVisible();
      await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
    });

    test('a source shows the reported store refusal instead of guessing from its contents', async ({page}) => {
      const {api} = await mockBackend(page);
      const config = await api.config();
      config.sources = config.sources.map(source => (source.kind === 'main' ? {...source, writable: false, read_only_reason: 'store_blocked'} : source));
      await page.route('**/api/v1/config', route => route.fulfill({json: config}));
      await page.goto('/#/config?tab=source&source=src-main');
      await expect(page.getByText(t('ui.refusal.storeBlocked'), {exact: true})).toBeVisible();
    });

    for (const {status, code, reason} of [
      {status: 403, code: 'permission_denied', reason: 'listener_secret_in_content'},
      ...[
        {status: 403, code: 'permission_denied'},
        {status: 404, code: 'capability_not_supported'},
        {status: 503, code: 'temporarily_unavailable'},
        {status: 400, code: 'invalid_request'}
      ].flatMap(refusal => [refusal, {...refusal, reason: 'future_reason'}])
    ] as Array<{status: number; code: string; reason?: string}>) {
      test(`a group PATCH ${code} refusal (${reason ?? 'no reason'}) shows one message and keeps the edit`, async ({page}) => {
        await mockBackend(page);
        expectLoadFailures(page, /\/groups\/auto\/config$/);
        let patches = 0;
        await page.route('**/api/v1/groups/auto/config', route => {
          if (route.request().method() !== 'PATCH') return route.fallback();
          patches += 1;
          return route.fulfill({
            status,
            json: {request_id: 'refusal-e2e', error: {code, message: 'A specific configuration refusal', details: reason ? {reason} : {}}}
          });
        });
        await page.goto('/#/policies');
        await moreAction(page.getByRole('region', {name: 'auto', exact: true}), t('policy.checkEdit'), t('ui.moreActions'));
        const dialog = page.getByRole('dialog', {name: t('policy.checkEditTitle', {name: 'auto'})});
        const url = dialog.getByRole('textbox', {name: t('policy.cfg.checkUrl')});
        await url.fill('https://cp.cloudflare.com/generate_204');
        const refused = page.waitForResponse(response => response.request().method() === 'PATCH' && response.status() === status);
        await dialog.getByRole('button', {name: t('policy.save'), exact: true}).click();
        await refused;
        const toast = page.locator('.rp-toast.negative');
        await expect(toast).toHaveCount(1);
        expect(patches).toBe(1);
        const message = reason === 'listener_secret_in_content' ? t('ui.refusal.listenerSecretInContent') : 'A specific configuration refusal';
        await expect(toast.locator('.msg')).toHaveText(t('policy.actionFailed', {name: 'auto', error: message}));
        await expect(url).toHaveValue('https://cp.cloudflare.com/generate_204');
        if (shots && reason === 'listener_secret_in_content') await page.screenshot({path: `shots/toast-${name}.png`});
      });
    }
  });
}
