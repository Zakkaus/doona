const {chromium} = require('@playwright/test');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const rate = 4;
const routes = [
  ['subscriptions', '订阅'],
  ['nodes', '节点'],
  ['routing', '路由'],
  ['dns', 'DNS'],
  ['groups', '策略组']
];
const rows = {groups: '[data-group-row]', subscriptions: '[data-provider-id]', nodes: 'tbody tr', routing: '[data-rule-index]', dns: '[data-upstream]'};
(async () => {
  const browser = await chromium.launch({args: ['--disable-features=OverlayScrollbar']});
  const results = [];
  const overBudget = [];
  try {
    const p = await browser.newPage({viewport: {width: 1440, height: 900}, locale: 'zh-CN'});
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate});
    await p.addInitScript(() => {
      window.__perf = {tasks: [], shifts: []};
      new PerformanceObserver(list => window.__perf.tasks.push(...list.getEntries().map(e => ({start: e.startTime, duration: e.duration})))).observe({
        type: 'longtask',
        buffered: true
      });
      new PerformanceObserver(list => window.__perf.shifts.push(...list.getEntries().map(e => ({start: e.startTime, value: e.value})))).observe({
        type: 'layout-shift',
        buffered: true
      });
    });
    async function measure(label, action, fromNavigation = false) {
      const start = fromNavigation ? 0 : await p.evaluate(() => performance.now());
      await action();
      await p.waitForTimeout(2000);
      const tasks = await p.evaluate(start => window.__perf.tasks.filter(e => e.start >= start).map(e => e.duration), start);
      const max = Math.max(0, ...tasks);
      results.push({switch: label, longTasks: tasks.map(n => +n.toFixed(1)), maxMs: +max.toFixed(1)});
      if (max > 50) overBudget.push(`${label}: ${max.toFixed(1)} ms > 50 ms`);
    }
    // Navigation starts the demo, so include boot tasks rather than timing an already loaded page.
    await measure(
      'demo → 策略组',
      async () => {
        await p.goto(base);
        await waitForDemo(p);
      },
      true
    );
    for (const visit of [1, 2]) {
      for (const [route, name] of routes) {
        await measure(`${name} (${visit})`, async () => {
          await p.locator(`a.astryx-side-nav-item[href="#${route}"]`).click();
          await p.locator(`${rows[route]}:visible`).first().waitFor();
        });
      }
    }
    await p.close();
    // A delayed response isolates the collection swap from navigation and boot.
    for (const [route] of [['groups'], ...routes.filter(([route]) => route !== 'groups')]) {
      const slow = await browser.newPage({viewport: {width: 1440, height: 900}, locale: 'zh-CN', reducedMotion: 'reduce'});
      const session = await slow.context().newCDPSession(slow);
      await session.send('Emulation.setCPUThrottlingRate', {rate});
      await slow.addInitScript(() => {
        window.__shifts = [];
        new PerformanceObserver(list => window.__shifts.push(...list.getEntries().map(e => ({start: e.startTime, value: e.value})))).observe({
          type: 'layout-shift',
          buffered: true
        });
      });
      await slow.goto(`${base}?slow=1200`, {waitUntil: 'domcontentloaded'});
      if (route !== 'groups') {
        await waitForDemo(slow);
        await slow.evaluate(route => {
          location.hash = route;
        }, route);
      }
      const skeleton = slow.locator(`[data-loading-shape="${route}"]:visible`).first();
      await skeleton.waitFor();
      const start = await slow.evaluate(() => performance.now());
      if (route === 'groups') await waitForDemo(slow);
      else await slow.locator(`${rows[route]}:visible`).first().waitFor();
      await skeleton.waitFor({state: 'hidden'});
      await slow.waitForTimeout(500);
      const cls = await slow.evaluate(start => window.__shifts.filter(e => e.start >= start).reduce((sum, e) => sum + e.value, 0), start);
      results.push({switch: `${route} skeleton → content`, cls});
      if (cls > 0) overBudget.push(`${route}: swap CLS ${cls} > 0`);
      await slow.close();
    }
    console.log(JSON.stringify({rate, results, overBudget}, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
