// Captures the README screenshots from a running build: node tools/screenshots.mjs [URL] [DIR].
// One set per language, light and dark for the activity page; the mock backend supplies the data.
import {existsSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/scratch/ssd/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/scratch/ssd/pw-browsers';
}
const require = createRequire(import.meta.url);
let browserModule;
try {
  const playwright = require.resolve('playwright', {paths: [dirname(require.resolve('@playwright/test'))]});
  browserModule = require.resolve('playwright-core', {paths: [dirname(playwright)]});
} catch {
  browserModule = require.resolve('@playwright/test');
}
const {chromium} = require(browserModule);
const [baseURL = 'http://127.0.0.1:4184', dir = 'docs/screenshots'] = process.argv.slice(2);
const shots = [
  ['activity', 'light', '#/activity'],
  ['activity', 'dark', '#/activity'],
  ['policies', 'light', '#/policies'],
  ['rules', 'light', '#/rules?tab=list'],
  ['nodes', 'light', '#/nodes?provider=inline']
];
const browser = await chromium.launch();
try {
  for (const lang of ['en', 'zh-TW', 'zh-CN']) {
    mkdirSync(join(dir, lang), {recursive: true});
    for (const [name, scheme, route] of shots) {
      const context = await browser.newContext({viewport: {width: 1440, height: 920}, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block'});
      await context.addInitScript(
        ([lang, scheme]) => {
          localStorage.setItem('doona-lang', lang);
          localStorage.setItem('doona-scheme', scheme);
          localStorage.setItem('doona-palette', 'rose-pine/moon');
        },
        [lang, scheme]
      );
      const page = await context.newPage();
      await page.goto(`${baseURL}/${route}`);
      await page.waitForTimeout(1500);
      await page.screenshot({path: join(dir, lang, `${name}-${scheme}.png`)});
      await context.close();
    }
  }
} finally {
  await browser.close();
}
