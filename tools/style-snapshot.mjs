// Computed-style snapshot of every element on every page, palette and scheme, to diff a CSS restructuring
// against: node tools/style-snapshot.mjs <baseURL> <out.json>, then python3 tools/style-diff.py before.json after.json.
import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const [base, out] = process.argv.slice(2);
const palettes = [
  'rose-pine/main',
  'rose-pine/moon',
  'catppuccin/frappe',
  'catppuccin/mocha',
  'nord/nord',
  'kary/kary',
  'glass/glass',
  'antd/antd',
  'arco/arco',
  'semi/semi'
];
const routes = [
  'activity',
  'overview',
  'connections',
  'connections?id=2',
  'dns',
  'dns?tab=cache',
  'policies',
  'rules',
  'rules?tab=list',
  'rules?tab=trace',
  'nodes',
  'config',
  'config?tab=setup',
  'config?tab=validate',
  'events',
  'logs',
  'settings'
];
const props = [
  'display',
  'position',
  'width',
  'height',
  'padding',
  'margin',
  'border',
  'border-radius',
  'background-color',
  'background-image',
  'color',
  'font-size',
  'font-weight',
  'line-height',
  'gap',
  'align-self',
  'align-items',
  'justify-content',
  'flex',
  'overflow',
  'box-shadow',
  'outline',
  'opacity',
  'translate',
  'scale',
  'z-index',
  'min-height',
  'max-height',
  'white-space',
  'text-overflow',
  'cursor',
  'fill',
  'stroke'
];
const browser = await chromium.launch();
const result = {};
for (const palette of palettes) {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
    await context.addInitScript(
      ([p, s]) => {
        localStorage.setItem('doona-lang', 'zh-TW');
        localStorage.setItem('doona-scheme', s);
        localStorage.setItem('doona-api', 'mock');
        localStorage.setItem('doona-palette', p);
      },
      [palette, scheme]
    );
    for (const route of routes) {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-09-16T00:00:00Z'));
      await page.goto(base + '/#/' + route);
      await page.locator('.rp-content > :not(.rp-head):not([role="status"])').first().waitFor();
      await page.locator('.rp-content').waitFor({state: 'visible'});
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.rp-content [role="status"]')].every(element => !element.checkVisibility({visibilityProperty: true}))
      );
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.waitForFunction(() =>
        document.getAnimations().every(animation => animation.effect?.getComputedTiming().iterations === Infinity || animation.playState === 'finished')
      );
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const rows = await page.evaluate(props => {
        const out = [];
        const path = el => {
          const parts = [];
          for (let e = el; e && e !== document.body; e = e.parentElement) {
            const cls = [...e.classList].sort().join('.');
            parts.unshift(e.tagName.toLowerCase() + (cls ? '.' + cls : ''));
          }
          return parts.join('>');
        };
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('.cm-editor') || el.tagName === 'svg' || el.closest('svg') || el.closest('.recharts-wrapper')) continue;
          const cs = getComputedStyle(el);
          out.push(path(el) + '|' + props.map(p => cs.getPropertyValue(p)).join(';'));
        }
        return out;
      }, props);
      const key = `${palette}/${scheme}/${route}`;
      result[key] = {hash: createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16), count: rows.length, rows};
      await page.close();
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(out, JSON.stringify(result));
console.log(Object.keys(result).length, 'snapshots');
