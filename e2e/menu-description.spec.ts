import {expect, mockBackend, scrollIntoList, test} from './fixtures';

const phase = (globalThis as {process?: {env: Record<string, string | undefined>}}).process?.env.DOONA_OWNER_SHOTS;

for (const width of [390, 768, 1440]) {
  for (const scheme of ['light', 'dark']) {
    test.describe(`${width}px ${scheme}`, () => {
      test.use({viewport: {width, height: 1000}, storage: {'doona-lang': 'zh-TW', 'doona-scheme': scheme}});
      test('long insert-position descriptions stay inside separate items', async ({page}) => {
        const {api} = await mockBackend(page);
        const config = await api.config();
        const source = config.sources.find(source => source.id === 'src-main')!;
        const long = 'domain(geosite:google-cn, geosite:category-games@cn)';
        const content = source
          .content!.replace('domain(geosite: telegram)', long)
          .replace('domain(suffix: doubleclick.net)', `domain(full: ${'a'.repeat(200)}.example)`);
        await api.pollOperation(await api.replaceConfigSource(source.id, content, `"${source.content_sha256}"`));
        await page.goto('/#/rules?tab=list&view=advanced');
        await page.getByRole('button', {name: '新增規則', exact: true}).first().click();
        await page.getByRole('dialog').getByRole('button', {name: /插入/}).click();
        const options = page.getByRole('listbox').getByRole('option');
        const ownerItem = options.filter({hasText: long});
        await scrollIntoList(ownerItem);
        await expect(ownerItem).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        if (phase) await page.screenshot({path: `test-results/owner-shots/${phase}/menu-description.${width}.${scheme}.zh-TW.png`});
        const geometry = await options.evaluateAll(items =>
          items.map(item => {
            const box = item.getBoundingClientRect();
            const desc = item.querySelector('.desc')?.getBoundingClientRect();
            return {
              top: box.top,
              bottom: box.bottom,
              left: box.left,
              right: box.right,
              desc: desc && {top: desc.top, bottom: desc.bottom, left: desc.left, right: desc.right}
            };
          })
        );
        expect(geometry.filter(item => item.desc).length).toBeGreaterThan(2);
        for (let i = 0; i < geometry.length; i++) {
          const item = geometry[i];
          if (i) expect(item.top).toBeGreaterThanOrEqual(geometry[i - 1].bottom - 1);
          if (!item.desc) continue;
          expect(item.desc.top).toBeGreaterThanOrEqual(item.top);
          expect(item.desc.bottom).toBeLessThanOrEqual(item.bottom);
          expect(item.desc.left).toBeGreaterThanOrEqual(item.left);
          expect(item.desc.right).toBeLessThanOrEqual(item.right);
        }
        await expect(ownerItem).toHaveAccessibleDescription((await ownerItem.locator('.desc').innerText()).trim());
      });
    });
  }
}
