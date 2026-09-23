// Usage: node tools/screenshots.mjs [URL] [DIR]; captures README pages in each language plus light/dark activity views.
// Also builds a palette sheet and English theme gallery from mock-backed screenshots.
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';

const require = createRequire(import.meta.url);
let browserModule;
try {
  const playwright = require.resolve('playwright', {paths: [dirname(require.resolve('@playwright/test'))]});
  browserModule = require.resolve('playwright-core', {paths: [dirname(playwright)]});
} catch {
  browserModule = require.resolve('@playwright/test');
}
const {chromium} = require(browserModule);
const [baseURL = 'http://127.0.0.1:4177', dir = 'docs/screenshots'] = process.argv.slice(2);
const shots = [
  ['activity', 'light', '#/activity'],
  ['activity', 'dark', '#/activity'],
  ['policies', 'light', '#/policies'],
  ['rules', 'light', '#/rules?tab=map']
];
// The palettes with the looks that differ: a family's light side is one look however many dark flavours it has.
const looks = [
  ['Rosé Pine Dawn', 'rose-pine/main', 'light'],
  ['Rosé Pine Main', 'rose-pine/main', 'dark'],
  ['Rosé Pine Moon', 'rose-pine/moon', 'dark'],
  ['Catppuccin Latte', 'catppuccin/mocha', 'light'],
  ['Catppuccin Frappé', 'catppuccin/frappe', 'dark'],
  ['Catppuccin Macchiato', 'catppuccin/macchiato', 'dark'],
  ['Catppuccin Mocha', 'catppuccin/mocha', 'dark'],
  ['Nord Light', 'nord/nord', 'light'],
  ['Nord Dark', 'nord/nord', 'dark'],
  ['Kary Pro Colors Light', 'kary/kary', 'light'],
  ['Kary Pro Colors Dark', 'kary/kary', 'dark'],
  ['Ant Design Light', 'antd/antd', 'light'],
  ['Ant Design Dark', 'antd/antd', 'dark'],
  ['Arco Design Light', 'arco/arco', 'light'],
  ['Arco Design Dark', 'arco/arco', 'dark'],
  ['Semi Design Light', 'semi/semi', 'light'],
  ['Semi Design Dark', 'semi/semi', 'dark'],
  ['Glass Light', 'glass/glass', 'light'],
  ['Glass Dark', 'glass/glass', 'dark']
];
const gallery = new Map([
  ['Rosé Pine Dawn', 'rose-pine-light'],
  ['Rosé Pine Moon', 'rose-pine-dark'],
  ['Catppuccin Latte', 'catppuccin-light'],
  ['Catppuccin Mocha', 'catppuccin-dark'],
  ['Nord Light', 'nord-light'],
  ['Nord Dark', 'nord-dark'],
  ['Glass Light', 'glass-light'],
  ['Glass Dark', 'glass-dark']
]);
execFileSync('cwebp', ['-version'], {stdio: 'ignore'});
async function screenshot(page, path, options = {}, lossy = false) {
  const png = await page.screenshot(options);
  execFileSync('cwebp', ['-quiet', ...(lossy ? ['-q', '78'] : ['-lossless', '-z', '9']), '-o', path + '.webp', '--', '-'], {input: png});
}
const browser = await chromium.launch();
try {
  const tiles = [];
  mkdirSync(join(dir, 'en'), {recursive: true});
  for (const [label, palette, scheme] of looks) {
    const context = await browser.newContext({
      viewport: {width: 1440, height: 920},
      deviceScaleFactor: 0.5,
      colorScheme: scheme,
      reducedMotion: 'reduce',
      serviceWorkers: 'block'
    });
    await context.addInitScript(
      ([palette, scheme]) => {
        localStorage.setItem('doona-api', 'mock');
        localStorage.setItem('doona-lang', 'en');
        localStorage.setItem('doona-scheme', scheme);
        localStorage.setItem('doona-palette', palette);
      },
      [palette, scheme]
    );
    const page = await context.newPage();
    await page.goto(`${baseURL}/#/activity`);
    await page.locator('.rp-donut .recharts-sector').first().waitFor();
    await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'));
    await page.evaluate(() => document.fonts.ready);
    tiles.push(await page.screenshot());
    if (gallery.has(label)) await screenshot(page, join(dir, 'en', `theme-${gallery.get(label)}`), {}, true);
    await context.close();
  }
  // Embed tiles as data URLs because the blank sheet page may not load local files.
  const sheet = await browser.newPage({viewport: {width: 1488, height: 800}});
  await sheet.setContent(`<!doctype html><style>
    body { margin: 0; padding: 16px; background: #fff; font: 500 15px/1 system-ui, sans-serif; color: #333; }
    main { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 16px; }
    img { display: block; width: 720px; height: 460px; border-radius: 8px; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12); }
    figure { margin: 0; } figcaption { margin-top: 8px; }
  </style><main>${looks.map(([label], i) => `<figure><img src="data:image/png;base64,${tiles[i].toString('base64')}"><figcaption>${label}</figcaption></figure>`).join('')}</main>`);
  await sheet.waitForTimeout(500);
  mkdirSync(dir, {recursive: true});
  await screenshot(sheet, join(dir, 'palettes'), {fullPage: true});
  await sheet.close();
  for (const lang of ['en', 'zh-TW', 'zh-CN']) {
    mkdirSync(join(dir, lang), {recursive: true});
    for (const [name, scheme, route] of shots) {
      const context = await browser.newContext({viewport: {width: 1440, height: 920}, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block'});
      await context.addInitScript(
        ([lang, scheme]) => {
          localStorage.setItem('doona-api', 'mock');
          localStorage.setItem('doona-lang', lang);
          localStorage.setItem('doona-scheme', scheme);
          localStorage.setItem('doona-palette', 'rose-pine/moon');
        },
        [lang, scheme]
      );
      const page = await context.newPage();
      await page.goto(`${baseURL}/${route}`);
      await page
        .locator(name === 'policies' ? '.rp-nodes' : name === 'rules' ? '.rp-tree-tile' : '.rp-donut .recharts-sector')
        .first()
        .waitFor();
      await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'));
      await page.evaluate(() => document.fonts.ready);
      await screenshot(page, join(dir, lang, `${name}-${scheme}`));
      await context.close();
    }
  }
} finally {
  await browser.close();
}
