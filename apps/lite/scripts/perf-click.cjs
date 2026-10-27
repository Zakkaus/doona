const {chromium} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const rate = 4;
(async () => {
  const browser = await chromium.launch({args: ['--disable-features=OverlayScrollbar']});
  const results = [];
  const overBudget = [];
  try {
    const p = await browser.newPage({viewport: {width: 1440, height: 900}, locale: 'zh-CN'});
    p.setDefaultTimeout(10000);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate});
    await p.addInitScript(() => {
      localStorage.setItem('doona-lite.locale', 'zh-CN');
      window.__clickPerf = {tasks: []};
      new PerformanceObserver(list => window.__clickPerf.tasks.push(...list.getEntries().map(e => ({start: e.startTime, duration: e.duration})))).observe({
        type: 'longtask',
        buffered: true
      });
    });
    if (process.env.PROFILE_DIR) {
      fs.mkdirSync(process.env.PROFILE_DIR, {recursive: true});
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', {interval: 200});
    }
    async function measure(label, action, visible, reportOnly = false) {
      if (process.env.PROFILE_DIR) await cdp.send('Profiler.start');
      const start =
        label === 'cold load'
          ? 0
          : await p.evaluate(visible => {
              const state = window.__clickPerf;
              state.start = performance.now();
              state.visible = undefined;
              state.started = false;
              const mark = () => {
                if (!state.started) {
                  state.start = performance.now();
                  state.started = true;
                }
              };
              document.addEventListener('pointerdown', mark, {once: true, capture: true});
              document.addEventListener('keydown', mark, {once: true, capture: true});
              state.clean = () => {
                document.removeEventListener('pointerdown', mark, true);
                document.removeEventListener('keydown', mark, true);
              };
              const frame = () => {
                if (
                  state.started &&
                  Array.from(document.querySelectorAll(visible)).some(element => element.checkVisibility({visibilityProperty: true, opacityProperty: true}))
                )
                  state.visible = performance.now();
                else state.frame = requestAnimationFrame(frame);
              };
              state.frame = requestAnimationFrame(frame);
              return state.start;
            }, visible);
      await action();
      await p.locator(visible).filter({visible: true}).first().waitFor({state: 'visible'});
      await p.waitForTimeout(1500);
      const metrics = await p.evaluate(start => {
        const state = window.__clickPerf;
        state.clean?.();
        cancelAnimationFrame(state.frame);
        return {
          tasks: state.tasks.filter(e => e.start >= start).map(e => e.duration),
          visibleMs: state.visible === undefined ? null : Math.round(state.visible - state.start)
        };
      }, start);
      if (process.env.PROFILE_DIR) {
        const {profile} = await cdp.send('Profiler.stop');
        fs.writeFileSync(path.join(process.env.PROFILE_DIR, `${label.replace(/[^a-z0-9]+/gi, '-')}.cpuprofile`), JSON.stringify(profile));
      }
      const maxMs = Math.max(0, ...metrics.tasks);
      results.push({action: label, longTasks: metrics.tasks, maxMs, visibleMs: metrics.visibleMs, reportOnly});
      console.log(JSON.stringify(results.at(-1)));
      if (!reportOnly && maxMs > 50) overBudget.push(`${label}: ${maxMs} ms > 50 ms`);
    }
    const mode = name =>
      p
        .getByRole('radio', {name, exact: true})
        .or(p.getByRole('button', {name, exact: true}))
        .first();
    const dialog = 'dialog[open]';
    await measure(
      'cold load',
      async () => {
        await p.goto(base);
        await waitForDemo(p);
      },
      '[data-group-row]',
      true
    );
    await p.locator('[data-member-row]').nth(9).waitFor();
    await p.waitForTimeout(2000);
    const member = p.locator('[data-member-row]').nth(9);
    const memberId = await member.getAttribute('data-member-row');
    await measure('pick member', () => member.click(), `[data-member-row="${memberId}"][aria-current="true"]`);
    await measure('groups edit', () => mode('编辑组').click(), '[data-group-editor]');
    await measure('groups select', () => mode('选择节点').click(), '[data-group-inspector]');
    await measure('create group', () => p.getByRole('button', {name: '创建组', exact: true}).click(), dialog);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    await measure('search palette', () => p.keyboard.press('Control+k'), 'dialog[open] input');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    await measure('settings', () => p.getByRole('button', {name: '设置', exact: true}).click(), dialog);
    await p.keyboard.press('Escape');
    for (const route of ['routing', 'dns']) {
      await p.locator(`a.astryx-side-nav-item[href="#${route}"]`).click();
      await p.locator('[data-rule-index]:visible').first().waitFor();
      await p.waitForTimeout(1500);
      await measure(`${route} text`, () => mode('文本').click(), '.cm-editor');
      await measure(`${route} visual`, () => mode('可视化').click(), '[data-rule-index]');
      if (route === 'routing') {
        await measure('test rules', () => p.getByRole('button', {name: '测试规则', exact: true}).click(), dialog);
        await p.keyboard.press('Escape');
        await p.waitForTimeout(400);
        await measure('add rule', () => p.getByRole('button', {name: '添加规则', exact: true}).click(), dialog);
        await p.keyboard.press('Escape');
      }
    }
    await p.locator('a.astryx-side-nav-item[href="#nodes"]').click();
    await p.locator('[data-node-id]').first().waitFor();
    await p.waitForTimeout(1500);
    await measure('test node latency', () => p.getByRole('button', {name: '测试延迟', exact: true}).click(), '[data-node-latency]');
    await measure('add node', () => p.getByRole('button', {name: '添加节点', exact: true}).click(), dialog);
    console.log(JSON.stringify({rate, results, overBudget}, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
