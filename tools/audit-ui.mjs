// Usage: node tools/audit-ui.mjs [--md] [--axe] [--width=N] [--dark] [--screenshots=DIR] [URL]; defaults to Dawn/en at 1440px.
// Uses the shared browser cache when available; PLAYWRIGHT_BROWSERS_PATH overrides it.
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
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
const args = process.argv.slice(2);
const baseURL = args.find(arg => !arg.startsWith('--')) ?? 'http://127.0.0.1:4184';
const width = Number(args.find(arg => arg.startsWith('--width='))?.split('=')[1] ?? 1440);
const scheme = args.includes('--dark') ? 'dark' : 'light';
const screenshots = args.find(arg => arg.startsWith('--screenshots='))?.slice('--screenshots='.length);
if (screenshots) mkdirSync(screenshots, {recursive: true});
const fixture = readFileSync(new URL('../e2e/fixtures.ts', import.meta.url), 'utf8');
const routeList = fixture.match(/export const routes = \[([\s\S]*?)\] as const;/);
if (!routeList) throw new Error('Cannot read the route list from e2e/fixtures.ts');
const routes = [...routeList[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const browser = await chromium.launch();
const pages = [];
try {
  const context = await browser.newContext({viewport: {width, height: 1400}, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block'});
  await context.addInitScript(scheme => {
    localStorage.setItem('doona-lang', 'en');
    localStorage.setItem('doona-scheme', scheme);
    localStorage.setItem('doona-palette', 'rose-pine/moon');
  }, scheme);
  for (const route of routes) {
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('doona-api', 'mock'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`${baseURL}/#/${route}`);
    await page.locator('.rp-content > :not(.rp-head):not([role="status"])').first().waitFor();
    await page.locator('.rp-content').waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.rp-content [role="status"]')].every(element => !element.checkVisibility({visibilityProperty: true}))
    );
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForFunction(() =>
      document.getAnimations().every(animation => animation.effect?.getComputedTiming().iterations === Infinity || animation.playState === 'finished')
    );
    const measurements = await page.evaluate(() => {
      const round = n => Math.round(n * 1000) / 1000;
      const describe = element => ({
        tag: element.tagName.toLowerCase(),
        class: element.getAttribute('class') ?? '',
        label: element.getAttribute('aria-label') ?? element.getAttribute('name') ?? element.textContent.trim().replace(/\s+/g, ' ').slice(0, 80),
        scope: element.closest('.rp-content') ? 'page' : 'shell',
        visible: element.getClientRects().length > 0 && element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden'
      });
      const controls = selector =>
        Array.from(document.querySelectorAll(selector))
          .filter(element => element.namespaceURI === 'http://www.w3.org/1999/xhtml')
          .map(element => {
            const style = getComputedStyle(element);
            return {
              ...describe(element),
              height: round(element.getBoundingClientRect().height),
              padding: style.padding,
              'border-radius': style.borderRadius,
              'font-size': style.fontSize
            };
          });
      const cardElements = [...document.querySelectorAll('.rp-card')];
      const cards = cardElements.map(element => {
        const style = getComputedStyle(element);
        return {...describe(element), padding: style.padding, gap: style.gap};
      });
      // Compare adjacent cards in each vertical lane, not side-by-side cards in DOM order.
      const rhythm = [];
      for (let i = 0; i < cardElements.length; i++) {
        const current = cardElements[i].getBoundingClientRect();
        let previous = -1;
        let bottom = -Infinity;
        for (let j = 0; j < i; j++) {
          const candidate = cardElements[j].getBoundingClientRect();
          if (candidate.bottom <= current.top && candidate.right > current.left && candidate.left < current.right && candidate.bottom > bottom) {
            previous = j;
            bottom = candidate.bottom;
          }
        }
        if (previous >= 0) rhythm.push({from: previous, to: i, distance: round(current.top - bottom)});
      }
      const root = getComputedStyle(document.documentElement);
      const tokens = Object.fromEntries([...root].filter(name => name.startsWith('--rp-')).map(name => [name, root.getPropertyValue(name).trim()]));
      return {
        buttons: controls('button, [role="button"]'),
        inputs: controls('input, [role="combobox"], [role="textbox"], textarea'),
        cards,
        rows: Array.from(document.querySelectorAll('.rp-table [role="row"], .rp-table tr'), element => ({
          ...describe(element),
          kind: element.querySelector('[role="columnheader"], th') ? 'header' : 'body',
          height: round(element.getBoundingClientRect().height)
        })),
        headings: Array.from(document.querySelectorAll('h1, h2, h3, .rp-title, .rp-qlabel'), element => {
          const style = getComputedStyle(element);
          return {...describe(element), 'font-size': style.fontSize, 'font-weight': style.fontWeight};
        }),
        alignment: Array.from(document.querySelectorAll('.rp-row, .rp-toolbar, .rp-cluster, .rp-between, .rp-kv, .rp-bar .top, .rp-node .top'), element => {
          const style = getComputedStyle(element);
          return {
            ...describe(element),
            align: style.alignItems,
            gap: style.gap,
            children: Array.from(element.children, child => {
              const control = child.matches('.rp-field') ? (child.querySelector('.rp-input, button, .rp-seg') ?? child) : child;
              const rect = control.getBoundingClientRect();
              return {...describe(control), top: round(rect.top), bottom: round(rect.bottom), center: round(rect.top + rect.height / 2)};
            })
          };
        }),
        rhythm,
        tokens
      };
    });
    if (args.includes('--axe')) {
      const {default: AxeBuilder} = await import('@axe-core/playwright');
      // Include best-practice findings as well as the accessibility gate's WCAG rules.
      const result = await new AxeBuilder({page}).analyze();
      measurements.axe = result.violations.map(rule => ({
        rule: rule.id,
        count: rule.nodes.length,
        nodes: rule.nodes.map(node => ({target: node.target, html: node.html, summary: node.failureSummary, checks: [...node.any, ...node.all, ...node.none]}))
      }));
    }
    if (errors.length) throw new Error(`${route}: ${errors.join('; ')}`);
    if (screenshots) await page.screenshot({path: join(screenshots, `${route}-${scheme}-${width}.png`), fullPage: true});
    pages.push({route, ...measurements});
    await page.close();
  }
} finally {
  await browser.close();
}

const inventory = new Map();
function record(property, value, route, location) {
  const key = JSON.stringify([property, value]);
  if (!inventory.has(key)) inventory.set(key, {property, value, pages: new Set(), locations: new Set()});
  const entry = inventory.get(key);
  entry.pages.add(route);
  entry.locations.add(`${route}: ${location}`);
}
for (const page of pages) {
  for (const group of ['buttons', 'inputs', 'cards', 'rows', 'headings']) {
    for (const [index, element] of page[group].entries()) {
      if (!element.visible) continue;
      for (const property of ['height', 'padding', 'border-radius', 'font-size', 'gap', 'font-weight']) {
        if (element[property] !== undefined) {
          record(
            `${group}.${property}`,
            element[property],
            page.route,
            `${element.scope} ${element.class || element.tag} #${index}${element.kind ? ` (${element.kind})` : ''}`
          );
        }
      }
    }
  }
  for (const gap of page.rhythm) record('rhythm.distance', gap.distance, page.route, `cards ${gap.from} → ${gap.to}`);
}
const values = [...inventory.values()].map(entry => {
  const numeric = entry.property.endsWith('font-weight') ? [] : (String(entry.value).match(/\d+(?:\.\d+)?/g) ?? []);
  return {
    ...entry,
    pages: [...entry.pages],
    locations: [...entry.locations],
    flags: [
      entry.pages.size === 1 ? 'one page' : '',
      numeric.some(n => Math.abs(Number(n) / 4 - Math.round(Number(n) / 4)) > 0.001) ? 'off 4px scale' : ''
    ].filter(Boolean)
  };
});
const result = {baseURL, viewport: {width, height: 1400}, scheme, locale: 'en', pages, values};
if (args.includes('--md')) {
  const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  console.log('| Property | Value | Pages | Locations (zero-based element index) | Flags |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const entry of values) {
    console.log(
      `| ${[entry.property, entry.value, entry.pages.join(', '), entry.locations.join('; '), entry.flags.join(', ') || '—'].map(escape).join(' | ')} |`
    );
  }
  console.log(`\nDistinct property/value pairs: ${values.length}; flagged pairs: ${values.filter(entry => entry.flags.length).length}.`);
  if (args.includes('--axe')) {
    console.log('\n| Page | Axe rule | Nodes |\n| --- | --- | --- |');
    for (const page of pages) for (const rule of page.axe) console.log(`| ${page.route} | ${rule.rule} | ${rule.count} |`);
  }
} else {
  console.log(JSON.stringify(result, null, 2));
}
