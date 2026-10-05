// Usage: node tools/screenshots.mjs [URL] [DIR]; captures README pages in each language plus light/dark activity views.
// Also builds a palette sheet, the English theme gallery, and per language the phone strip, the page tour stills, the
// routing animation and the docs stills of the dashboard, widgets and config views (cwebp and img2webp), all from
// mock-backed screenshots.
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {signInDemo} from './demo-session.mjs';
import {langs} from './languages.mjs';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    'Usage: node tools/screenshots.mjs [URL] [DIR]\nDefaults: URL=http://127.0.0.1:4177 DIR=docs/screenshots\nRequires a running mock-backed preview, Playwright Chromium, cwebp and img2webp.'
  );
  process.exit(0);
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
const [baseURL = 'http://127.0.0.1:4177', dir = 'docs/screenshots'] = process.argv.slice(2);
const shots = [
  ['activity', 'light', '#/activity', '.rp-donut path'],
  ['activity', 'dark', '#/activity', '.rp-donut path'],
  ['policies', 'light', '#/policies', '.rp-node'],
  ['rules', 'light', '#/rules', '.rp-radios'],
  ['config-source', 'light', '#/config?tab=source', '.cm-content[contenteditable=true]'],
  ['config-global', 'light', '#/config?tab=global', '#config-global-form input']
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
  ['Liquid Glass Light', 'glass/glass', 'light'],
  ['Liquid Glass Dark', 'glass/glass', 'dark'],
  ['Glass Light', 'glass/clear', 'light'],
  ['Glass Dark', 'glass/clear', 'dark'],
  ['Frosted Light', 'glass/frosted', 'light'],
  ['Frosted Dark', 'glass/frosted', 'dark'],
  ['Tinted Light', 'glass/tinted', 'light'],
  ['Tinted Dark', 'glass/tinted', 'dark'],
  ['China Day shift', 'qiangguo/qiangguo', 'light'],
  ['China Night shift', 'qiangguo/qiangguo', 'dark']
];
const gallery = new Map([
  ['Rosé Pine Dawn', 'rose-pine-light'],
  ['Rosé Pine Main', 'rose-pine-main-dark'],
  ['Rosé Pine Moon', 'rose-pine-dark'],
  ['Catppuccin Latte', 'catppuccin-light'],
  ['Catppuccin Frappé', 'catppuccin-frappe-dark'],
  ['Catppuccin Macchiato', 'catppuccin-macchiato-dark'],
  ['Catppuccin Mocha', 'catppuccin-dark'],
  ['Nord Light', 'nord-light'],
  ['Nord Dark', 'nord-dark'],
  ['Kary Pro Colors Light', 'kary-light'],
  ['Kary Pro Colors Dark', 'kary-dark'],
  ['Ant Design Light', 'antd-light'],
  ['Ant Design Dark', 'antd-dark'],
  ['Arco Design Light', 'arco-light'],
  ['Arco Design Dark', 'arco-dark'],
  ['Semi Design Light', 'semi-light'],
  ['Semi Design Dark', 'semi-dark'],
  ['Liquid Glass Light', 'glass-light'],
  ['Liquid Glass Dark', 'glass-dark'],
  ['Glass Light', 'glass-clear-light'],
  ['Glass Dark', 'glass-clear-dark'],
  ['Frosted Light', 'glass-frosted-light'],
  ['Frosted Dark', 'glass-frosted-dark'],
  ['Tinted Light', 'glass-tinted-light'],
  ['Tinted Dark', 'glass-tinted-dark'],
  ['China Day shift', 'qiangguo-light'],
  ['China Night shift', 'qiangguo-dark']
]);
// The page tour: the content panel without the side navigation, from its top down to the bottom of `until`.
const tour = [
  ['connections-traffic', '#/connections', '.rp-scatter', '.rp-content section.rp-titled >> nth=0'],
  ['connections-list', '#/connections?tab=list', '.rp-table [role=row] >> nth=4', '.rp-content .rp-table'],
  ['dns', '#/dns', '.rp-waffle', '.rp-content section.rp-titled >> nth=0'],
  ['logs', '#/logs', '.rp-heatmap', '.rp-content section.rp-titled'],
  ['latency', '#/nodes?tab=latency', '.rp-markerplot', '.rp-content section.rp-titled']
];
// Mock timestamps derive from the clock; a fixed one keeps the tour and phone images the same from run to run.
const fixedTime = new Date('2026-09-01T09:30:00Z');
execFileSync('cwebp', ['-version'], {stdio: 'ignore'});
execFileSync('img2webp', ['-version'], {stdio: 'ignore'});
async function screenshot(page, path, options = {}, lossy = false) {
  const png = await page.screenshot(options);
  execFileSync('cwebp', ['-quiet', ...(lossy ? ['-q', '78'] : ['-lossless', '-z', '9']), '-o', path + '.webp', '--', '-'], {input: png});
}
// `live` keeps the real clock, which the activity charts need to gather samples; `widgets` keeps the default panel;
// `storage` sets further localStorage keys after those.
async function openPage(browser, lang, route, ready, options = {}, {live = false, widgets = false, storage = {}} = {}) {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 900},
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    timezoneId: 'UTC',
    ...options
  });
  if (!live) await context.clock.setFixedTime(fixedTime);
  await context.addInitScript(signInDemo);
  await context.addInitScript(
    ([lang, widgets, storage]) => {
      localStorage.setItem('doona-lang', lang);
      localStorage.setItem('doona-scheme', 'light');
      localStorage.setItem('doona-palette', 'rose-pine/moon');
      if (!widgets) localStorage.setItem('doona-widgets', JSON.stringify({version: 3, items: [], visible: false}));
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    },
    [lang, widgets, storage]
  );
  const page = await context.newPage();
  await page.goto(`${baseURL}/${route}`);
  await page.locator(ready).first().waitFor();
  await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'));
  await page.evaluate(() => document.fonts.ready);
  return page;
}
// The CPU and latency tiles draw their trend only once the mock has given them a few samples.
async function samples(page) {
  await page.waitForFunction(() =>
    ['cpu', 'latency'].every(id =>
      /\d[LC]/.test(document.querySelector(`.rp-dashboard-cell[data-instance="${id}"] .rp-activity-surface path`)?.getAttribute('d') ?? '')
    )
  );
}
// The content panel from its top edge to 12px below the element `until`.
async function panelClip(page, until) {
  const panel = await page.locator('.rp-main').boundingBox();
  const end = await page.locator(until).boundingBox();
  return {x: panel.x, y: panel.y, width: panel.width, height: Math.ceil(end.y + end.height + 12 - panel.y)};
}
async function center(locator) {
  const box = await locator.boundingBox();
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}
// A drawn pointer, since screenshots leave out the system cursor and the browser's drag image; `label` shows a chip
// beside it for the item being dragged.
async function pointer(page, {x, y}, label = '') {
  await page.evaluate(
    ([x, y, label]) => {
      let el = document.getElementById('readme-pointer');
      if (!el) {
        el = document.createElement('div');
        el.id = 'readme-pointer';
        el.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;pointer-events:none;display:flex;align-items:flex-start;gap:4px';
        el.innerHTML =
          '<svg width="20" height="24" viewBox="0 0 20 24"><path d="M2 2v17l4.5-4.2 3 6.7 3-1.4-3-6.6H16z" fill="#1f1d2e" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
          '<span style="margin-top:14px;padding:4px 10px;border-radius:6px;background:var(--rp-surface);border:1px solid var(--rp-hl-high);box-shadow:0 4px 12px rgba(0,0,0,.16);font-size:14px;color:var(--rp-text)"></span>';
        document.body.append(el);
      }
      el.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
      const chip = el.querySelector('span');
      chip.textContent = label;
      chip.style.display = label ? '' : 'none';
    },
    [x, y, label]
  );
}
// Frames for img2webp, each shown for its own duration.
function recorder(page, clip) {
  const frames = [];
  return {
    async frame(ms) {
      frames.push([await page.screenshot({clip}), ms]);
    },
    // Moves the real mouse, which drives hover and drag, and the drawn pointer with it in eased steps.
    async glide(from, to, label = '', steps = 10) {
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const at = {x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e};
        await page.mouse.move(at.x, at.y);
        await pointer(page, at, label);
        await this.frame(40);
      }
    },
    encode(path) {
      const work = mkdtempSync(join(tmpdir(), 'doona-shots-'));
      try {
        const args = ['-loop', '0', '-min_size', '-lossless', '-q', '100', '-m', '6'];
        frames.forEach(([png, ms], i) => {
          writeFileSync(join(work, `${i}.png`), png);
          args.push('-d', String(ms), join(work, `${i}.png`));
        });
        execFileSync('img2webp', [...args, '-o', path + '.webp'], {stdio: 'ignore'});
      } finally {
        rmSync(work, {recursive: true, force: true});
      }
    }
  };
}
// Selects a rule, then a node, on the routing map, then clears the selection so the loop starts where it ends.
async function recordRouting(browser, lang, path) {
  const page = await openPage(browser, lang, '#/flows', '.rp-tree-tile');
  const tile = (stage, text) => page.locator(`.rp-tree-tile[data-stage=${stage}]`).filter({hasText: text}).first();
  const rule = tile('rule', 'fallback');
  const node = tile('node', 'hk-01');
  // A selection adds a row of path actions under the map; measure with it shown so no frame cuts it off.
  await rule.click();
  const clip = await panelClip(page, '.rp-tabpanel');
  await rule.click();
  const start = {x: clip.x + clip.width / 2, y: clip.y + 60};
  await page.mouse.move(start.x, start.y);
  await pointer(page, start);
  const anim = recorder(page, clip);
  await anim.frame(900);
  let at = start;
  for (const target of [rule, node]) {
    const to = await center(target);
    await anim.glide(at, to);
    await page.mouse.click(to.x, to.y);
    await anim.frame(1800);
    at = to;
  }
  await page.mouse.click(at.x, at.y);
  await anim.glide(at, start, '', 12);
  await anim.frame(300);
  anim.encode(path);
  await page.context().close();
}
// Three phones side by side: a table page, the top bar's overflow menu, and its palette submenu.
async function recordPhones(browser, lang, path) {
  const phone = {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true};
  const shots = [];
  for (const [route, ready, submenu] of [
    ['#/connections?tab=list', '.rp-table [role=row] >> nth=4'],
    ['#/activity', '.rp-donut path', false],
    ['#/policies', '.rp-node', true]
  ]) {
    const page = await openPage(browser, lang, route, ready, phone);
    if (submenu !== undefined) {
      await page.locator('header .rp-narrow-only button').click();
      await page.getByRole('menuitem').first().waitFor();
      if (submenu) {
        await page.getByRole('menuitem').nth(2).click();
        await page.getByRole('menuitemradio').first().waitFor();
        await page.getByRole('menuitem', {name: messages(lang)['ui.appearanceSettings'], exact: true}).scrollIntoViewIfNeeded();
      }
      await page.waitForTimeout(300);
    }
    shots.push(await page.screenshot());
    await page.context().close();
  }
  const sheet = await browser.newPage({viewport: {width: 1234, height: 868}, deviceScaleFactor: 2});
  await sheet.setContent(`<!doctype html><style>
    body { margin: 0; padding: 12px; background: transparent; }
    main { display: flex; gap: 20px; }
    img { display: block; width: 390px; height: 844px; border-radius: 24px; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.16); }
  </style><main>${shots.map(png => `<img src="data:image/png;base64,${png.toString('base64')}">`).join('')}</main>`);
  await sheet.waitForTimeout(500);
  const png = await sheet.screenshot({omitBackground: true});
  execFileSync('cwebp', ['-quiet', '-q', '84', '-alpha_q', '100', '-o', path + '.webp', '--', '-'], {input: png});
  await sheet.close();
}
// Desktop stills side by side with an arrow between them, each with its caption when given, laid out like the phones.
async function strip(browser, shots, captions, path) {
  const arrow =
    '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 14h18m-7-7 7 7-7 7" fill="none" stroke="#575279" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const sheet = await browser.newPage({viewport: {width: 600, height: 400}, deviceScaleFactor: 1.5});
  await sheet.setContent(`<!doctype html><style>
    body { margin: 0; padding: 12px; background: transparent; font: 500 16px/1.3 system-ui, sans-serif; color: #575279; }
    main { display: flex; align-items: center; gap: 12px; width: max-content; }
    figure { margin: 0; } figcaption { margin-top: 10px; text-align: center; }
    img { display: block; width: 720px; height: 460px; border-radius: 10px; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.16); }
    svg { flex: none; margin-bottom: ${captions ? 30 : 0}px; }
  </style><main>${shots
    .map((png, i) => `<figure><img src="data:image/png;base64,${png.toString('base64')}">${captions ? `<figcaption>${captions[i]}</figcaption>` : ''}</figure>`)
    .join(arrow)}</main>`);
  await sheet.waitForTimeout(500);
  const png = await sheet.locator('main').screenshot({omitBackground: true});
  execFileSync('cwebp', ['-quiet', '-q', '84', '-alpha_q', '100', '-o', path + '.webp', '--', '-'], {input: png});
  await sheet.close();
}
const desktop = {viewport: {width: 1440, height: 920}};
const messages = lang => JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
const captions = {
  'widgets-states': {
    en: ['Unpinned: open', 'Another page: collapsed', 'Pinned: unchanged on another page', 'Docked in the sidebar'],
    'zh-CN': ['未固定：展开', '切换页面后收起', '已固定：切换页面后保持原状', '嵌入侧边栏'],
    'zh-TW': ['未固定：展開', '切換頁面後收合', '已固定：切換頁面後保持原狀', '嵌入側邊欄']
  }
};
// The sign-in card, after `fill`, for a backend that answers discovery with `auth` and refuses every other read without
// a session.
async function signIn(browser, lang, auth, fill = async () => {}, palette = 'rose-pine/moon') {
  const context = await browser.newContext({...desktop, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block', timezoneId: 'UTC'});
  await context.addInitScript(
    ([lang, palette]) => {
      localStorage.setItem('doona-lang', lang);
      localStorage.setItem('doona-scheme', 'light');
      localStorage.setItem('doona-palette', palette);
      localStorage.setItem('doona-profiles', JSON.stringify([{id: 'home', name: 'Home', api: location.origin, token: ''}]));
      localStorage.setItem('doona-profile', 'home');
    },
    [lang, palette]
  );
  const password = auth.mode === 'password';
  const links = {auth_setup: password ? '/api/v1/auth/setup' : null, auth_login: password ? '/api/v1/auth/login' : null};
  await context.route(/\/api$/, route => route.fulfill({json: {name: 'daeuniverse/native', api_major: 1, links, auth}}));
  await context.route(/\/api\/v1\//, route =>
    route.fulfill({status: 401, json: {error: {code: 'authentication_required', message: 'Authentication required', details: null}, request_id: 'r'}})
  );
  const page = await context.newPage();
  await page.goto(`${baseURL}/#/activity`);
  await page.locator('.rp-login-page form input').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await fill(page);
  const png = await (palette.startsWith('glass/') ? page : page.locator('.rp-login-card')).screenshot();
  await context.close();
  return png;
}
// A choice in a dashboard card's settings: a segmented option when it fits the popover, otherwise its picker.
async function pick(page, label, option) {
  const dialog = page.getByRole('dialog').first();
  const radio = dialog.getByRole('radio', {name: option, exact: true});
  if (await radio.isVisible()) return radio.click();
  await dialog.getByRole('button', {name: new RegExp(`${label}$`)}).click();
  await page.getByRole('option', {name: option, exact: true}).click();
}
async function editDashboard(browser, lang, t) {
  const page = await openPage(browser, lang, '#/activity', '.rp-donut path', desktop, {live: true});
  await samples(page);
  await page.getByRole('button', {name: t['dashboard.edit'], exact: true}).click();
  return page;
}
async function openGallery(page, t) {
  await page.getByRole('button', {name: t['widgets.gallery'], exact: true}).click();
  await page.locator('.rp-widget-gallery-tile').first().waitFor();
}
async function widgetEditor(browser, lang, t) {
  const page = await openPage(browser, lang, '#/activity', '.rp-donut path', desktop, {live: true, widgets: true});
  await samples(page);
  await page.locator('.rp-floating-panel').getByRole('button', {name: t['widgets.panelOptions'], exact: true}).click();
  await page.getByRole('menuitem', {name: t['widgets.edit'], exact: true}).click();
  await page.locator('.rp-widget-preview .rp-sortable-row').first().waitFor();
  return page;
}
// An Activity dashboard of main's metric tiles, with `memory` among them when given, and the `extensions` cards
// under them, so the cards a still is about sit in the first view.
function dashboard(extensions, memory) {
  const tile = id => ({id, form: id === 'latency' ? 'kv' : 'sparkline', size: 'medium'});
  const metrics = ['download', 'upload', memory ? 'memory' : 'connections', 'latency', 'cpu'].map(tile);
  return {
    'doona-dashboard': JSON.stringify({
      version: 3,
      sections: [
        {id: 'metrics', items: metrics},
        {id: 'extensions', items: extensions}
      ]
    })
  };
}
async function dashboardPage(browser, lang, storage, ready) {
  const page = await openPage(browser, lang, '#/activity', '.rp-dashboard-cell[data-instance="cpu"]', desktop, {live: true, storage});
  await samples(page);
  await page.locator(ready).first().waitFor();
  await page.waitForTimeout(600);
  return page;
}
// The floating panel as a fresh profile has it, with `layout` over it, over the Activity page.
async function panelPage(browser, lang, layout, options = desktop, palette = 'rose-pine/moon') {
  const items = [
    {id: 'speed', form: 'sparkline', size: 'medium'},
    {id: 'memory', form: 'kv', size: 'medium'},
    {id: 'mode', form: 'kv', size: 'medium'}
  ];
  const storage = {'doona-palette': palette, 'doona-widgets': JSON.stringify({version: 4, items, collapsed: false, pinned: false, visible: true, ...layout})};
  const page = await openPage(browser, lang, '#/activity', '.rp-donut path', options, {live: true, storage});
  await samples(page);
  return page;
}
// Each capture returns its stills; one is saved as it is, more become a strip.
const captures = [
  ['login-wallpaper', async (browser, lang) => [await signIn(browser, lang, {mode: 'password', setup_required: false}, undefined, 'glass/clear')]],
  ['login-setup', async (browser, lang) => [await signIn(browser, lang, {mode: 'password', setup_required: true})]],
  [
    'login-token',
    async (browser, lang, t) => [
      await signIn(browser, lang, {mode: 'token'}, page => page.getByLabel(t['login.token'], {exact: true}).fill('demo-token-0000-0000'))
    ]
  ],
  [
    'search-settings',
    async (browser, lang, t) => {
      const page = await openPage(browser, lang, '#/activity', '.rp-donut path', desktop, {live: true});
      await samples(page);
      await page.keyboard.press('Control+K');
      const dialog = page.locator('.rp-dialog');
      await dialog.locator('input').fill(t['ui.palette']);
      const hit = dialog.getByRole('option', {name: new RegExp(`^${t['ui.palette']}`)}).first();
      await hit.waitFor();
      const first = await page.screenshot();
      await hit.click();
      await page.locator('[data-setting="palette"] [role=option][aria-selected=true]:focus').waitFor();
      return [first, page];
    }
  ],
  [
    'dashboard-settings',
    async (browser, lang, t) => {
      const page = await editDashboard(browser, lang, t);
      await page.locator('.rp-dashboard-cell[data-instance="download"]').getByRole('button', {name: t['widgets.inspector'], exact: true}).click();
      await pick(page, t['dashboard.width'], '1/3');
      await pick(page, t['dashboard.height'], t['dashboard.height.tall']);
      await page.waitForTimeout(300);
      return [page];
    }
  ],
  [
    'dashboard-gallery',
    async (browser, lang, t) => {
      const page = await editDashboard(browser, lang, t);
      await openGallery(page, t);
      return [page];
    }
  ],
  [
    'dashboard-speed-area',
    async (browser, lang, t) => {
      const page = await editDashboard(browser, lang, t);
      await openGallery(page, t);
      await page.locator(".rp-widget-gallery-tile[data-module='speed'] button").first().click();
      await page.getByRole('dialog', {name: t['widgets.gallery']}).getByRole('button', {name: t['ui.close'], exact: true}).click();
      const card = page.locator(".rp-dashboard-cell[data-module='speed']").first();
      // The card ends the page; at the bottom of the view its settings open above it and leave its chart in sight.
      await card.evaluate(node => node.scrollIntoView({block: 'end'}));
      await card.getByRole('button', {name: t['widgets.inspector'], exact: true}).click();
      await pick(page, t['widgets.form'], t['dashboard.form.area']);
      await card.evaluate(node => node.scrollIntoView({block: 'end'}));
      await page.waitForTimeout(300);
      return [page];
    }
  ],
  ['widgets-editor', async (browser, lang, t) => [await widgetEditor(browser, lang, t)]],
  [
    'widgets-speed-settings',
    async (browser, lang, t) => {
      const page = await widgetEditor(browser, lang, t);
      await page.locator('.rp-widget-preview .rp-sortable-row').first().click();
      await page.locator('.rp-widget-inspector button').first().waitFor();
      return [page];
    }
  ],
  [
    'widgets-states',
    async (browser, lang, t) => {
      const page = await openPage(browser, lang, '#/activity', '.rp-donut path', desktop, {live: true, widgets: true});
      await samples(page);
      const panel = page.locator('.rp-floating-panel');
      const button = name => panel.getByRole('button', {name: t[name], exact: true});
      const visit = async (route, ready) => {
        await page.evaluate(route => (location.hash = route), route);
        await page.locator(ready).first().waitFor();
        await page.waitForTimeout(400);
      };
      if (await button('widgets.unpin').isVisible()) await button('widgets.unpin').click();
      await page.mouse.move(720, 460);
      const shots = [await page.screenshot()];
      await visit('#/dns', '.rp-waffle');
      await button('widgets.expand').waitFor();
      shots.push(await page.screenshot());
      await button('widgets.expand').click();
      await button('widgets.pin').click();
      await visit('#/activity', '.rp-donut path');
      await visit('#/dns', '.rp-waffle');
      await button('widgets.collapse').waitFor();
      await page.mouse.move(720, 460);
      shots.push(await page.screenshot());
      await button('widgets.panelOptions').click();
      await page.getByRole('menuitem', {name: t['widgets.dock'], exact: true}).click();
      await page.locator('.rp-side-dock .rp-widget').first().waitFor();
      await page.waitForTimeout(400);
      shots.push(await page.screenshot());
      await page.context().close();
      return shots;
    }
  ],
  [
    'config-diagnostics',
    async (browser, lang, t) => {
      const page = await openPage(browser, lang, '#/config?tab=source&source=src-rules', '.cm-content[contenteditable=true]', desktop);
      await page.locator('.cm-content[contenteditable=true]').click();
      await page.keyboard.press('ControlOrMeta+End');
      for (const line of ['domain(example.com) -> missing_group', 'example.org -> direct', 'not a rule']) {
        await page.keyboard.press('Enter');
        await page.keyboard.insertText(line);
      }
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name: t['config.validate'], exact: true}).click();
      await page.getByRole('list', {name: t['config.diagnostics']}).getByRole('listitem').first().waitFor();
      // The toast that repeats the count would cover the marked lines.
      await page.locator('.rp-toast button').first().click();
      await page.locator('.rp-toast').waitFor({state: 'detached'});
      return [page];
    }
  ],
  [
    'settings-geodata',
    async (browser, lang, t) => {
      const page = await openPage(browser, lang, '#/settings?card=geodata', '.rp-main', desktop);
      const region = page.getByRole('region', {name: t['settings.geodata'], exact: true});
      await region.getByRole('button', {name: t['settings.geodataDetails']}).click();
      await region.locator('.rp-table').last().waitFor();
      await region.scrollIntoViewIfNeeded();
      return [page];
    }
  ],
  [
    'settings-general',
    async (browser, lang, t) => {
      const page = await openPage(browser, lang, '#/settings', '[role=tabpanel]', desktop);
      await page.getByRole('tab', {name: t['settings.general'], exact: true}).waitFor();
      return [page];
    }
  ],
  [
    'settings-appearance',
    async (browser, lang) => {
      const page = await openPage(browser, lang, '#/settings?tab=appearance', '[data-setting="palette"]', desktop);
      await page.waitForTimeout(400);
      const png = await page.screenshot({fullPage: true});
      await page.context().close();
      return [png];
    }
  ],
  ['rules-advanced', async (browser, lang) => [await openPage(browser, lang, '#/rules?tab=list&view=advanced', '.rp-table [role=row] >> nth=2', desktop)]],
  ['rules-dns', async (browser, lang) => [await openPage(browser, lang, '#/rules?tab=dns', '.rp-table [role=row] >> nth=2', desktop)]],
  [
    'node-actions',
    async (browser, lang, t) => {
      const page = await openPage(browser, lang, '#/nodes?provider=inline', '.rp-table [role=row] >> nth=2', desktop);
      const row = page.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'hk-01', exact: true})});
      await page.getByRole('rowheader', {name: 'hk-01', exact: true}).click();
      // The selected node's probe results sit under the table; the view grows just enough to show them.
      const details = page.getByRole('region', {name: t['nodes.details'], exact: true});
      await details.getByText(t['nodes.probeKinds'], {exact: true}).waitFor();
      const box = await details.boundingBox();
      await page.setViewportSize({width: 1440, height: Math.max(920, Math.ceil(box.y + box.height + 24))});
      await row.getByRole('button', {name: t['nodes.actions'], exact: true}).click();
      await page.getByRole('menuitem', {name: t['nodes.addToGroup'], exact: true}).click();
      await page.getByRole('menu', {name: t['nodes.addToGroup'], exact: true}).waitFor();
      await page.waitForTimeout(300);
      return [page];
    }
  ],
  [
    'dns-cache-expired',
    async (browser, lang, t) => {
      const page = await openPage(browser, lang, '#/dns?tab=cache', '.rp-table [role=row] >> nth=2', desktop);
      await page.getByText(t['dns.includeExpired'], {exact: true}).click();
      const expired = page.getByRole('rowheader', {name: 'github.com.', exact: true});
      await expired.waitFor();
      await expired.scrollIntoViewIfNeeded();
      // The cache tab lists entries; the statistics tab's cache card holds the capacity meter beside them.
      const stats = await openPage(browser, lang, '#/dns?tab=stats', '.rp-waffle', desktop);
      await stats.getByRole('heading', {name: t['dns.chart.cache'], exact: true}).evaluate(node => node.scrollIntoView({block: 'center'}));
      await stats.locator('.rp-main .track').first().waitFor();
      await stats.waitForTimeout(300);
      return [page, stats];
    }
  ],
  [
    'widgets-quota',
    async (browser, lang) => [
      await dashboardPage(
        browser,
        lang,
        dashboard([
          {id: 'providerBudget', form: 'kv', size: 'medium'},
          {id: 'sourceHealth', form: 'kv', size: 'medium'}
        ]),
        '.rp-dashboard-cell[data-module="providerBudget"] .track'
      )
    ]
  ],
  [
    'widgets-health',
    async (browser, lang) => [
      await dashboardPage(
        browser,
        lang,
        dashboard([
          {id: 'outboundErrors', form: 'ranked', size: 'medium'},
          {id: 'nodeAvailability', form: 'kv', size: 'medium'},
          {id: 'dnsLatency', form: 'dots', size: 'medium'}
        ]),
        '.rp-dashboard-cell[data-module="dnsLatency"] svg'
      )
    ]
  ],
  [
    'widgets-edge',
    async (browser, lang) => {
      const page = await panelPage(browser, lang, {edge: true});
      await page.mouse.move(760, 110);
      const handle = page.locator('.rp-edge-handle');
      await handle.waitFor();
      await page.waitForFunction(() => document.querySelector('.rp-floating-panel')?.dataset.edge !== undefined);
      await page.waitForTimeout(1500);
      return [page];
    }
  ],
  [
    'widgets-glass',
    async (browser, lang) => {
      const page = await panelPage(browser, lang, {}, desktop, 'glass/glass');
      await page.mouse.move(760, 110);
      await page.waitForTimeout(400);
      return [page];
    }
  ],
  [
    'settings-formats',
    async (browser, lang) => {
      const storage = {'doona-time-format': '12h'};
      const settings = await openPage(browser, lang, '#/settings?card=appearance', '[data-setting="timeFormat"]', desktop, {storage});
      await settings.waitForTimeout(400);
      const logs = await openPage(browser, lang, '#/logs', '.rp-table [role=row] >> nth=2', desktop, {storage});
      return [settings, logs];
    }
  ],
  [
    'system-status-meters',
    async (browser, lang) => {
      const page = await openPage(browser, lang, '#/overview', '.rp-main .track .fill', desktop);
      await page.waitForTimeout(300);
      return [page];
    }
  ],
  [
    'widgets-memory-wide',
    async (browser, lang) => [
      await dashboardPage(
        browser,
        lang,
        dashboard([{id: 'memory', instance: 'memory-wide', form: 'kv', size: 'wide', width: 'full'}], true),
        '.rp-dashboard-cell[data-instance="memory-wide"] .rp-kv'
      )
    ]
  ],
  [
    'notices-light',
    async (browser, lang) => {
      // A read-only source refuses typing with an info toast; held under the pointer, it stays on the Activity page.
      const page = await openPage(browser, lang, '#/config?tab=source&source=src-harbor', '.cm-content', desktop, {live: true});
      await page.locator('.cm-content').click();
      await page.keyboard.type('x');
      const toast = page.locator('.rp-toast').first();
      await toast.waitFor();
      await page.mouse.move(...Object.values(await center(toast)));
      await page.evaluate(() => (location.hash = '#/activity'));
      await page.locator('.rp-donut path').first().waitFor();
      await samples(page);
      await page.locator('.rp-dashboard-cell[data-instance="notices"]').scrollIntoViewIfNeeded();
      await page.mouse.move(...Object.values(await center(toast)));
      await page.waitForTimeout(400);
      return [page];
    }
  ]
];
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
    await context.addInitScript(signInDemo);
    await context.addInitScript(
      ([palette, scheme]) => {
        localStorage.setItem('doona-lang', 'en');
        localStorage.setItem('doona-scheme', scheme);
        localStorage.setItem('doona-palette', palette);
        localStorage.setItem('doona-widgets', JSON.stringify({version: 3, items: [], visible: false}));
      },
      [palette, scheme]
    );
    const page = await context.newPage();
    await page.goto(`${baseURL}/#/activity`);
    await page.locator('.rp-donut path').first().waitFor();
    await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'));
    await page.evaluate(() => document.fonts.ready);
    await samples(page);
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
  for (const lang of langs) {
    mkdirSync(join(dir, lang), {recursive: true});
    for (const [name, scheme, route, ready] of shots) {
      const context = await browser.newContext({viewport: {width: 1440, height: 920}, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block'});
      await context.addInitScript(signInDemo);
      await context.addInitScript(
        ([lang, scheme]) => {
          localStorage.setItem('doona-lang', lang);
          localStorage.setItem('doona-scheme', scheme);
          localStorage.setItem('doona-palette', 'rose-pine/moon');
          localStorage.setItem('doona-widgets', JSON.stringify({version: 3, items: [], visible: false}));
        },
        [lang, scheme]
      );
      const page = await context.newPage();
      await page.goto(`${baseURL}/${route}`);
      await page.locator(ready).first().waitFor();
      await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'));
      await page.evaluate(() => document.fonts.ready);
      if (name === 'activity') await samples(page);
      await screenshot(page, join(dir, lang, `${name}-${scheme}`));
      await context.close();
    }
    for (const [name, route, ready, until] of tour) {
      const page = await openPage(browser, lang, route, ready);
      await screenshot(page, join(dir, lang, name), {clip: await panelClip(page, until), fullPage: true});
      await page.context().close();
    }
    await recordPhones(browser, lang, join(dir, lang, 'phone'));
    await recordRouting(browser, lang, join(dir, lang, 'routing'));
    const t = messages(lang);
    for (const [name, capture] of captures) {
      const stills = await capture(browser, lang, t);
      const pngs = [];
      for (const still of stills) pngs.push(Buffer.isBuffer(still) ? still : await still.screenshot());
      for (const still of new Set(stills.filter(still => !Buffer.isBuffer(still)))) await still.context().close();
      const path = join(dir, lang, name);
      if (pngs.length > 1) await strip(browser, pngs, captions[name]?.[lang], path);
      else execFileSync('cwebp', ['-quiet', '-lossless', '-z', '9', '-o', path + '.webp', '--', '-'], {input: pngs[0]});
    }
  }
} finally {
  await browser.close();
}
