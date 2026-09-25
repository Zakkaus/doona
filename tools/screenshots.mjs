// Usage: node tools/screenshots.mjs [URL] [DIR]; captures README pages in each language plus light/dark activity views.
// Also builds a palette sheet, the English theme gallery, and per language the phone strip, the page tour stills and
// its two animations (cwebp and img2webp), all from mock-backed screenshots.
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
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
async function openPage(browser, lang, route, ready, options = {}) {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 900},
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    timezoneId: 'UTC',
    ...options
  });
  await context.clock.setFixedTime(fixedTime);
  await context.addInitScript(lang => {
    localStorage.setItem('doona-api', 'mock');
    localStorage.setItem('doona-lang', lang);
    localStorage.setItem('doona-scheme', 'light');
    localStorage.setItem('doona-palette', 'rose-pine/moon');
  }, lang);
  const page = await context.newPage();
  await page.goto(`${baseURL}/${route}`);
  await page.locator(ready).first().waitFor();
  await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'));
  await page.evaluate(() => document.fonts.ready);
  return page;
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
// Drags a node from the tray onto a group on the arrange tab. The viewport is tall enough that the bar for pending
// changes sits below the clip.
async function recordArrange(browser, lang, path) {
  const page = await openPage(browser, lang, '#/policies?tab=arrange', '.rp-drop', {viewport: {width: 1280, height: 1100}});
  const group = page.locator('.rp-drop').filter({has: page.getByRole('heading', {name: 'gaming', exact: true})});
  const clip = await panelClip(page, '.rp-drop >> nth=-1');
  const row = await page.getByRole('row').filter({hasText: 'us-01'}).boundingBox();
  const handle = {x: row.x + 16, y: row.y + row.height / 2};
  const anim = recorder(page, clip);
  const start = {x: clip.x + clip.width - 120, y: clip.y + 160};
  await page.mouse.move(start.x, start.y);
  await pointer(page, start);
  await anim.frame(900);
  await anim.glide(start, handle);
  await page.mouse.down();
  await anim.frame(250);
  await anim.glide(handle, await center(group), 'us-01', 16);
  await anim.frame(700);
  await page.mouse.up();
  await pointer(page, await center(group));
  await group.getByText('us-01').waitFor();
  await anim.frame(2400);
  anim.encode(path);
  await page.context().close();
}
// Selects a rule, then a node, on the routing map, then clears the selection so the loop starts where it ends.
async function recordRouting(browser, lang, path) {
  const page = await openPage(browser, lang, '#/rules?tab=map', '.rp-tree-tile');
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
    ['#/policies', '.rp-nodes', true]
  ]) {
    const page = await openPage(browser, lang, route, ready, phone);
    if (submenu !== undefined) {
      await page.locator('header .rp-narrow-only button').click();
      await page.getByRole('menuitem').first().waitFor();
      if (submenu) {
        await page.getByRole('menuitem').nth(2).click();
        await page.getByRole('menuitemradio').first().waitFor();
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
    await page.locator('.rp-donut path').first().waitFor();
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
        .locator(name === 'policies' ? '.rp-nodes' : name === 'rules' ? '.rp-tree-tile' : '.rp-donut path')
        .first()
        .waitFor();
      await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'));
      await page.evaluate(() => document.fonts.ready);
      await screenshot(page, join(dir, lang, `${name}-${scheme}`));
      await context.close();
    }
    for (const [name, route, ready, until] of tour) {
      const page = await openPage(browser, lang, route, ready);
      await screenshot(page, join(dir, lang, name), {clip: await panelClip(page, until), fullPage: true});
      await page.context().close();
    }
    await recordPhones(browser, lang, join(dir, lang, 'phone'));
    await recordArrange(browser, lang, join(dir, lang, 'arrange'));
    await recordRouting(browser, lang, join(dir, lang, 'routing'));
  }
} finally {
  await browser.close();
}
