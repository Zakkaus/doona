// Usage: node tools/perf.mjs [URL]; measures a built doona against the mock backend with a throttled CPU.
// Reports first paint, scripting and layout time per page, the cost of one polling minute on the activity
// page, scrolling a 3,000-row node table, and hovering the routing tree. Numbers are medians of three runs.
import {chromium} from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4177';
const pages = ['activity', 'overview', 'connections', 'dns', 'policies', 'rules?tab=map', 'nodes?provider=sub-c', 'config', 'events', 'logs', 'settings'];
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

// A page counts as ready when its heading is on screen and nothing in it is still loading.
async function ready(page) {
  await page.locator('.rp-content').getByRole('heading').first().waitFor();
  const route = new URL(page.url()).hash.slice(2).split('?')[0];
  const content = {
    activity: '.rp-donut .recharts-sector',
    overview: '.rp-kv',
    connections: '[role=rowheader]',
    dns: '[role=tabpanel]',
    policies: '.rp-node',
    rules: '.rp-tree-tile',
    nodes: '[role=rowheader]',
    config: '[role=tabpanel]',
    events: '[role=rowheader]',
    logs: '[role=rowheader]',
    settings: '.rp-form'
  };
  await page.locator('.rp-content').locator(content[route]).first().waitFor();
  await page.waitForFunction(() => !document.querySelector('.rp-content .rp-empty[role=status]'), null, {timeout: 60_000});
}

// `big` loads the long-list fixture (3,000 nodes and their connections and flows). Ordinary page
// measurements use the default fixture, so they report what an ordinary backend costs.
async function run(scenario, {big = false} = {}) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const browser = await chromium.launch();
    const context = await browser.newContext({viewport: {width: 1280, height: 800}, reducedMotion: 'reduce', serviceWorkers: 'block'});
    await context.addInitScript(big => {
      localStorage.setItem('doona-api', 'mock');
      localStorage.setItem('doona-lang', 'en');
      if (big) localStorage.setItem('doona-mock-big', '3000');
    }, big);
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

const rows = [];
for (const route of pages) {
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
rows.push({
  scenario: 'activity: one minute of polling',
  ...(await run(async (page, session) => {
    await page.goto(`${base}/#/activity`);
    await ready(page);
    await page.waitForTimeout(1000);
    const before = await metrics(session);
    await page.waitForTimeout(60_000);
    return delta(before, await metrics(session));
  }))
});
rows.push({
  scenario: 'nodes: scroll 3,000 rows',
  ...(await run(
    async (page, session) => {
      await page.goto(`${base}/#/nodes?provider=sub-c`);
      const table = page.locator('.rp-table').nth(1);
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
  ))
});
rows.push({
  scenario: 'rules: hover 20 tree tiles',
  ...(await run(async (page, session) => {
    await page.goto(`${base}/#/rules?tab=map`);
    const tiles = page.locator('.rp-tree-tile');
    await tiles.first().waitFor();
    const count = Math.min(20, await tiles.count());
    const before = await metrics(session);
    for (let i = 0; i < count; i++) await tiles.nth(i).hover();
    return delta(before, await metrics(session));
  }))
});
const width = Math.max(...rows.map(row => row.scenario.length));
for (const row of rows) {
  const cells = Object.entries(row)
    .filter(([key]) => key !== 'scenario')
    .map(([key, value]) => `${key} ${key === 'heap' ? value.toFixed(1) + ' MB' : ms(value)}`);
  console.log(row.scenario.padEnd(width), ' ', cells.join('  '));
}
