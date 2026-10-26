// Usage: node tools/perf.mjs [URL]; measures a built doona against the mock backend with a throttled CPU.
// Reports first paint, scripting and layout time per page, the cost of one polling minute on the activity
// page, the long connection and node tables, a log burst, hovering the routing tree, and side-nav page switches:
// click to ready, the longest task and scripting and layout time of opening a page, of going back to a kept page and
// of going back to one rebuilt after it was dropped. Numbers are medians
// of PERF_RUNS runs, three by default. PERF_ONLY=regex runs only the scenarios whose name matches.
import {chromium} from '@playwright/test';
import {signInDemo} from './demo-session.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4177';
// Every page with what marks it ready; a page missing here is neither measured nor waited for.
const content = {
  activity: '.rp-donut path',
  overview: '.rp-kv',
  connections: '.rp-scatter circle',
  dns: '[role=tabpanel]',
  policies: '.rp-node',
  flows: '.rp-tree-tile',
  nodes: '[role=rowheader]',
  rules: '[role=tabpanel]',
  config: '[role=tabpanel]',
  events: '[role=rowheader]',
  logs: '[role=rowheader]',
  settings: '.rp-form'
};
const pageQuery = {nodes: '?provider=harbor'};
const pages = Object.keys(content).map(route => `${route}${pageQuery[route] ?? ''}`);
const runs = Number(process.env.PERF_RUNS) || 3;
const only = process.env.PERF_ONLY ? new RegExp(process.env.PERF_ONLY) : null;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const ms = value => `${value.toFixed(0)} ms`;

async function metrics(session) {
  const {metrics} = await session.send('Performance.getMetrics');
  const get = name => metrics.find(metric => metric.name === name)?.value ?? 0;
  return {
    script: get('ScriptDuration') * 1000,
    layout: get('LayoutDuration') * 1000,
    style: get('RecalcStyleDuration') * 1000,
    heap: get('JSHeapUsedSize') / 1048576
  };
}
const delta = (a, b) => ({script: b.script - a.script, layout: b.layout - a.layout, style: b.style - a.style});

// A page counts as ready when the side navigation marks the address's page as shown, its content is on screen and
// nothing in it is still loading. The address changes before a switch commits; the mark changes with it.
async function ready(page) {
  const route = new URL(page.url()).hash.slice(2).split('?')[0];
  await page.locator(`.rp-side a[href="#/${route}"][aria-current=page]`).waitFor({state: 'attached'});
  await page.locator('.rp-content').locator(content[route]).filter({visible: true}).first().waitFor();
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll('.rp-content .rp-empty[role=status]')).some(element => element.checkVisibility()),
    null,
    {timeout: 60_000}
  );
}

// `big` loads the long-list fixture (3,000 nodes and their connections and flows). Ordinary page
// measurements use the default fixture, so they report what an ordinary backend costs. `busy` makes the mock
// move byte counters on every poll and log every 20 ms, as a loaded backend does; `storage` presets settings.
async function run(scenario, {big = false, busy = false, storage = {}} = {}) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const browser = await chromium.launch();
    const context = await browser.newContext({viewport: {width: 1280, height: 800}, reducedMotion: 'reduce', serviceWorkers: 'block'});
    await context.addInitScript(signInDemo);
    await context.addInitScript(
      ({big, busy, storage}) => {
        localStorage.setItem('doona-lang', 'en');
        if (big) localStorage.setItem('doona-mock-big', '3000');
        if (busy) localStorage.setItem('doona-mock-busy', '1');
        for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
      },
      {big, busy, storage}
    );
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Performance.enable');
    await session.send('Emulation.setCPUThrottlingRate', {rate: 4});
    samples.push(await scenario(page, session));
    await browser.close();
  }
  const keys = Object.keys(samples[0]);
  return Object.fromEntries(keys.map(key => [key, median(samples.map(sample => sample[key]))]));
}

// The nodes page shows one table of nodes; its rows carry `data-key`.
const nodeTable = page => page.locator('.rp-table', {has: page.locator('[role=row][data-key]')}).first();

const rows = [];
const wanted = name => !only || only.test(name);
async function measure(name, scenario, options) {
  if (wanted(name)) rows.push({scenario: name, ...(await run(scenario, options))});
}
for (const route of pages.filter(wanted)) {
  const result = await run(async (page, session) => {
    await page.goto(`${base}/#/${route}`);
    await ready(page);
    await page.waitForTimeout(1500);
    const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0);
    const after = await metrics(session);
    return {fcp: paint, script: after.script, layout: after.layout, heap: after.heap};
  });
  rows.push({scenario: route, ...result});
}
await measure('activity: one minute of polling', async (page, session) => {
  await page.goto(`${base}/#/activity`);
  await ready(page);
  await page.waitForTimeout(1000);
  const before = await metrics(session);
  await page.waitForTimeout(60_000);
  return delta(before, await metrics(session));
});
await measure(
  'nodes: scroll 3,000 rows',
  async (page, session) => {
    await page.goto(`${base}/#/nodes?provider=harbor`);
    const table = nodeTable(page);
    await table.locator('[role=row][data-key]').first().waitFor();
    const before = await metrics(session);
    for (let i = 0; i < 20; i++) {
      await table.evaluate(el => {
        const scroller = el.querySelector('[role=grid], [role=treegrid]') ?? el;
        scroller.scrollTop += 2000;
      });
      await page.waitForTimeout(50);
    }
    return delta(before, await metrics(session));
  },
  {big: true}
);
await measure(
  'nodes: type and clear a search',
  async (page, session) => {
    await page.goto(`${base}/#/nodes?provider=harbor`);
    await nodeTable(page).locator('[role=row][data-key]').first().waitFor();
    const field = page.getByRole('searchbox', {name: 'Search nodes'});
    await field.click();
    const before = await metrics(session);
    for (let i = 0; i < 2; i++) {
      await page.keyboard.type('香港 IPLC', {delay: 80});
      for (let j = 0; j < 7; j++) await page.keyboard.press('Backspace', {delay: 80});
    }
    await page.waitForTimeout(500);
    return delta(before, await metrics(session));
  },
  {big: true}
);
// Each probe disables every probe button while it runs and re-reads the node list when it ends.
await measure(
  'nodes: probe 5 nodes',
  async (page, session) => {
    await page.goto(`${base}/#/nodes?provider=harbor`);
    const table = nodeTable(page);
    await table.locator('[role=row][data-key]').first().waitFor();
    const buttons = table.getByRole('button', {name: /^Test /});
    const before = await metrics(session);
    for (let i = 0; i < 5; i++) {
      await buttons.nth(i).click();
      await table.locator('[data-pending]').first().waitFor({state: 'detached'});
      await page.waitForTimeout(200);
    }
    return delta(before, await metrics(session));
  },
  {big: true}
);
// 1,000 connections sorted by start time, with byte counters moving on every poll, as on a loaded router.
const sortedByStart = {'doona-connections-view': JSON.stringify({hidden: [], sort: {column: 'age', direction: 'descending'}, group: 'none'})};
await measure(
  'connections: 30 s of polling, 1,000 rows',
  async (page, session) => {
    await page.goto(`${base}/#/connections?tab=list`);
    await page.locator('.rp-table [role=row][data-key]').first().waitFor();
    await page.waitForTimeout(1000);
    const before = await metrics(session);
    await page.waitForTimeout(30_000);
    return delta(before, await metrics(session));
  },
  {big: true, busy: true, storage: sortedByStart}
);
await measure(
  'connections: sort 1,000 rows by four columns',
  async (page, session) => {
    await page.goto(`${base}/#/connections?tab=list`);
    await page.locator('.rp-table [role=row][data-key]').first().waitFor();
    await page.waitForTimeout(1000);
    const before = await metrics(session);
    for (const name of ['Started', 'Download', 'State', 'Target'])
      for (let i = 0; i < 2; i++) {
        await page.getByRole('columnheader', {name}).click();
        await page.waitForTimeout(150);
      }
    return delta(before, await metrics(session));
  },
  {big: true, storage: sortedByStart}
);
await measure(
  'connections: select 10 rows',
  async (page, session) => {
    await page.goto(`${base}/#/connections?tab=list`);
    const rowsShown = page.locator('.rp-table [role=row][data-key]');
    await rowsShown.first().waitFor();
    await page.waitForTimeout(1000);
    const before = await metrics(session);
    for (let i = 0; i < 10; i++) {
      await rowsShown.nth(i + 1).click();
      await page.waitForTimeout(150);
    }
    return delta(before, await metrics(session));
  },
  {big: true, storage: sortedByStart}
);
// Records arriving every 20 ms reach the page in batches, so the heatmap redraws on each published batch.
await measure(
  'logs: 20 s burst on the activity view',
  async (page, session) => {
    await page.goto(`${base}/#/logs`);
    await ready(page);
    await page.locator('.rp-heatmap').waitFor();
    const before = await metrics(session);
    await page.waitForTimeout(20_000);
    return delta(before, await metrics(session));
  },
  {busy: true}
);
await measure('flows: hover 20 tree tiles', async (page, session) => {
  await page.goto(`${base}/#/flows`);
  const tiles = page.locator('.rp-tree-tile');
  await tiles.first().waitFor();
  const count = Math.min(20, await tiles.count());
  const before = await metrics(session);
  for (let i = 0; i < count; i++) await tiles.nth(i).hover();
  return delta(before, await metrics(session));
});
// Every page but activity, which the tab opens on, is opened once from the side navigation. Five pages stay mounted
// (src/shell/kept.ts), so by then nodes, policies and activity are dropped: going back to each builds it again, and
// going back once more shows the kept page.
if (wanted('page switch')) {
  const heavy = ['nodes', 'policies', 'activity'];
  const switches = [
    ...Object.keys(content)
      .filter(route => route !== 'activity')
      .map(route => `first open: ${route}`),
    ...heavy.map(route => `rebuilt return: ${route}`),
    ...heavy.map(route => `kept return: ${route}`)
  ];
  const result = await run(async (page, session) => {
    await page.goto(`${base}/#/activity`);
    await ready(page);
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.longTasks = [];
      new PerformanceObserver(list => window.longTasks.push(...list.getEntries().map(entry => [entry.startTime, entry.duration]))).observe({type: 'longtask'});
    });
    const sample = {};
    for (const name of switches) {
      const route = name.split(': ')[1];
      const start = await page.evaluate(() => performance.now());
      const before = await metrics(session);
      const clicked = performance.now();
      await page.locator(`.rp-side a[href="#/${route}"]`).click();
      await ready(page);
      const shown = performance.now() - clicked;
      await page.waitForTimeout(1000);
      const {script, layout} = delta(before, await metrics(session));
      const longest = await page.evaluate(from => Math.max(0, ...window.longTasks.filter(([at]) => at >= from).map(([, duration]) => duration)), start);
      for (const [key, value] of Object.entries({ready: shown, longest, script, layout})) sample[`${name} ${key}`] = value;
    }
    return sample;
  });
  for (const name of switches)
    rows.push({scenario: `page switch, ${name}`, ...Object.fromEntries(['ready', 'longest', 'script', 'layout'].map(key => [key, result[`${name} ${key}`]]))});
}
const width = Math.max(...rows.map(row => row.scenario.length));
for (const row of rows) {
  const cells = Object.entries(row)
    .filter(([key]) => key !== 'scenario')
    .map(([key, value]) => `${key} ${key === 'heap' ? value.toFixed(1) + ' MB' : ms(value)}`);
  console.log(row.scenario.padEnd(width), ' ', cells.join('  '));
}
