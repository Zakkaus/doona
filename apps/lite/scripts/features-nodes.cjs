const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const shots = process.env.LITE_FEATURE_SHOTS;
const tokens = ['group(', 'name(', 'subtag(', 'dip', 'dport', 'l4proto', 'pname', 'qname', 'fallback', 'must_', '(must)', '->'];
async function settled(p) {
  await p.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {}))
    );
  });
}
async function shot(p, name) {
  await settled(p);
  if (shots) {
    fs.mkdirSync(shots, {recursive: true});
    await p.screenshot({path: path.join(shots, `${name}.png`)});
  }
}
async function cleanDialog(p) {
  const text = await p.getByRole('dialog').innerText();
  expect(tokens.filter(token => text.includes(token))).toEqual([]);
}
async function review(p) {
  await p.getByRole('button', {name: '查看并应用', exact: true}).click();
  const d = p.getByRole('dialog', {name: '应用这些更改？', exact: true});
  await expect(d).toBeVisible();
  return d;
}
async function apply(p, d) {
  await d.getByRole('button', {name: '应用', exact: true}).click();
  await expect(d).toBeHidden({timeout: 20000});
  await expect(p.getByRole('button', {name: '查看并应用', exact: true})).toHaveCount(0);
}
(async () => {
  const b = await chromium.launch();
  try {
    const p = await b.newPage({viewport: {width: 1440, height: 900}, locale: 'zh-CN', colorScheme: 'light'});
    p.setDefaultTimeout(12000);
    const errors = [];
    p.on('pageerror', error => errors.push(error.message));
    await p.addInitScript(() => localStorage.setItem('doona-lite.locale', 'zh-CN'));
    await p.goto(base);
    await waitForDemo(p);
    await p.getByRole('link', {name: '节点', exact: true}).click();
    await p.locator('[data-node-id]').first().waitFor();
    const search = p.getByRole('textbox', {name: '搜索节点', exact: true});
    await search.fill('-01');
    await p.getByRole('combobox', {name: '协议', exact: true}).click();
    await p.getByRole('option', {name: 'vless', exact: true}).click();
    await settled(p);
    const geometry = () =>
      p.locator('tbody tr:has([data-node-id])').evaluateAll(rows =>
        rows.map(row => {
          const r = row.getBoundingClientRect();
          return {id: row.querySelector('[data-node-id]').dataset.nodeId, x: r.x, y: r.y, width: r.width, height: r.height};
        })
      );
    const before = await geometry();
    expect(before.map(row => row.id)).toEqual(['hk-01', 'jp-01']);
    await p.getByRole('button', {name: '测试延迟', exact: true}).click();
    expect(await geometry()).toEqual(before);
    await expect(p.locator('[data-node-latency="hk-01"]')).toHaveText('84 ms', {timeout: 20000});
    await expect(p.getByRole('button', {name: '测试延迟', exact: true})).toBeEnabled({timeout: 20000});
    expect(await geometry()).toEqual(before);
    expect((await p.locator('[data-node-latency]').allTextContents()).every(text => /ms|超时|不支持测试/.test(text))).toBe(true);
    await search.fill('');
    await p.getByRole('combobox', {name: '协议', exact: true}).click();
    await p.getByRole('option', {name: '全部协议', exact: true}).click();
    await expect(p.locator('[data-node-latency="hk-02"]')).toHaveText('—');
    await shot(p, 'nodes-latency-light');
    console.log('PASS filtered node probes preserve row geometry and leave other nodes untested');

    await p.getByRole('button', {name: '添加节点', exact: true}).click();
    const add = p.getByRole('dialog', {name: '添加节点', exact: true});
    await add
      .getByRole('textbox', {name: '分享链接', exact: true})
      .fill('vless://00000000-0000-4000-8000-000000000001@new.example:443?security=tls#Feature-node');
    await expect(add.getByRole('button', {name: '添加', exact: true})).toBeEnabled();
    await add.getByRole('button', {name: '添加', exact: true}).click();
    await expect(add).toBeHidden();
    await p.locator('tbody tr:has([data-node-id="Feature-node"]) button[aria-haspopup="menu"]').click();
    await p.getByRole('menuitem', {name: '加入策略组…', exact: true}).click();
    let d = p.getByRole('dialog', {name: '加入策略组', exact: true});
    await expect(d.getByRole('radio', {name: /proxy/})).toBeDisabled();
    await expect(d).toContainText('已在组内');
    await cleanDialog(p);
    await shot(p, 'add-node-to-group');
    await d.getByRole('textbox', {name: '搜索策略组', exact: true}).fill('jp');
    await d.getByRole('radio', {name: 'jp', exact: true}).check();
    await d.getByRole('button', {name: '添加', exact: true}).click();
    await expect(p.locator('.astryx-toast').filter({hasText: '已将 Feature-node 加入 jp'})).toBeVisible();
    d = await review(p);
    await expect(d).toContainText('Feature-node');
    await apply(p, d);
    await p.getByRole('link', {name: '策略组', exact: true}).click();
    await p.locator('[data-group-row="jp"] button').first().click();
    await p.getByRole('textbox', {name: '搜索成员：jp', exact: true}).fill('Feature-node');
    await expect(p.locator('[data-group-inspector="jp"] [data-member-row="Feature-node"]')).toBeVisible();
    console.log('PASS node group draft, review, apply and member read-back');

    await p.getByRole('link', {name: '订阅', exact: true}).click();
    const harbor = p.locator('[data-provider-id]').filter({has: p.getByRole('button', {name: '操作: harbor', exact: true})});
    await harbor.getByRole('button', {name: '操作: harbor', exact: true}).click();
    await p.getByRole('menuitem', {name: '测试延迟', exact: true}).click();
    await expect(harbor.locator('[data-probe-summary]')).toHaveText(/^\d+ \/ 40 个可用/, {timeout: 90000});
    console.log('PASS subscription latency summary', await harbor.locator('[data-probe-summary]').innerText());
    await harbor.getByRole('button', {name: '操作: harbor', exact: true}).click();
    await p.getByRole('menuitem', {name: '编辑', exact: true}).click();
    d = p.getByRole('dialog', {name: '编辑订阅', exact: true});
    await d.getByRole('combobox', {name: '自动更新', exact: true}).click();
    await shot(p, 'subscription-auto-update');
    await p.getByRole('option', {name: '每 6 小时', exact: true}).click();
    await cleanDialog(p);
    await d.getByRole('button', {name: '保存', exact: true}).click();
    await expect(harbor).toContainText('每 6 小时更新');
    d = await review(p);
    await d.getByRole('button', {name: '查看配置文本', exact: true}).click();
    await expect(d.locator('pre')).toContainText('interval: 6h');
    const changes = (await d.locator('pre').innerText()).split('\n').filter(line => /^[+−]/.test(line));
    expect(changes.some(line => /pacific|atlas/.test(line))).toBe(false);
    await apply(p, d);
    await expect(harbor).toContainText('每 6 小时更新');
    console.log('PASS subscription interval staged and reviewed; other subscription entries absent from changed lines');

    await harbor.getByRole('button', {name: '操作: harbor', exact: true}).click();
    await p.getByRole('menuitem', {name: '编辑', exact: true}).click();
    d = p.getByRole('dialog', {name: '编辑订阅', exact: true});
    await d.getByRole('combobox', {name: '自动更新', exact: true}).click();
    await p.getByRole('option', {name: '自定义', exact: true}).click();
    await d.getByRole('spinbutton', {name: '更新间隔', exact: true}).fill('7');
    await d.getByRole('button', {name: '保存', exact: true}).click();
    d = await review(p);
    await d.getByRole('button', {name: '查看配置文本', exact: true}).click();
    await expect(d.locator('pre')).toContainText('interval: 7h');
    await d.getByRole('button', {name: '取消', exact: true}).click();
    await p.getByRole('button', {name: '放弃更改', exact: true}).click();
    await expect(harbor).toContainText('每 6 小时更新');
    await harbor.locator('.astryx-collapsible-trigger').click();
    await harbor.locator('[data-subscription-nodes] button[aria-haspopup="menu"]').first().click();
    await expect(p.getByRole('menuitem', {name: '编辑', exact: true})).toHaveCount(0);
    await p.getByRole('menuitem', {name: '加入策略组…', exact: true}).click();
    d = p.getByRole('dialog', {name: '加入策略组', exact: true});
    await d.getByRole('textbox', {name: '搜索策略组', exact: true}).fill('us');
    await d.getByRole('radio', {name: 'us', exact: true}).check();
    await d.getByRole('button', {name: '添加', exact: true}).click();
    d = await review(p);
    await d.getByRole('button', {name: '查看配置文本', exact: true}).click();
    await expect(d.locator('pre')).toContainText("subtag('harbor')");
    await apply(p, d);
    console.log('PASS custom interval and subscription node group action');
    await p.getByRole('button', {name: '添加订阅', exact: true}).click();
    d = p.getByRole('dialog', {name: '添加订阅', exact: true});
    await d.getByRole('textbox', {name: '订阅链接', exact: true}).fill('https://feature.example/feed');
    await d.getByRole('combobox', {name: '自动更新', exact: true}).click();
    await p.getByRole('option', {name: '每 6 小时', exact: true}).click();
    await d.getByRole('button', {name: '保存', exact: true}).click();
    const created = p.locator('[data-provider-id="draft:feature.example"]');
    await expect(created).toContainText('每 6 小时更新');
    await created.getByRole('button', {name: '操作: feature.example', exact: true}).click();
    await p.getByRole('menuitem', {name: '编辑', exact: true}).click();
    d = p.getByRole('dialog', {name: '编辑订阅', exact: true});
    await d.getByRole('combobox', {name: '自动更新', exact: true}).click();
    await p.getByRole('option', {name: '每天', exact: true}).click();
    await d.getByRole('button', {name: '保存', exact: true}).click();
    d = await review(p);
    await d.getByRole('button', {name: '查看配置文本', exact: true}).click();
    await expect(d.locator('pre')).toContainText('interval: 24h');
    await apply(p, d);
    await expect(p.locator('[data-provider-id="feature.example"]')).toContainText('每 24 小时更新');
    console.log('PASS add subscription with interval, edit pending subscription and apply');

    await p.getByRole('link', {name: '节点', exact: true}).click();
    await p.locator('[data-node-id]').first().waitFor();
    await p.emulateMedia({colorScheme: 'dark'});
    await shot(p, 'nodes-dark');
    await p.setViewportSize({width: 390, height: 844});
    await p.emulateMedia({colorScheme: 'light'});
    await search.fill('hk-01');
    await settled(p);
    const mobileBefore = await geometry();
    await p.getByRole('button', {name: '测试延迟', exact: true}).click();
    await expect(p.locator('[data-node-latency="hk-01"]')).toHaveText('84 ms', {timeout: 20000});
    await expect(p.getByRole('button', {name: '测试延迟', exact: true})).toBeEnabled();
    expect(await geometry()).toEqual(mobileBefore);
    await search.fill('');
    await shot(p, 'nodes-mobile');
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await p.close();

    const tw = await b.newPage({viewport: {width: 1440, height: 900}, locale: 'zh-TW'});
    tw.setDefaultTimeout(12000);
    await tw.addInitScript(() => localStorage.setItem('doona-lite.locale', 'zh-TW'));
    await tw.goto(base);
    await waitForDemo(tw);
    await tw.getByRole('link', {name: '節點', exact: true}).click();
    await expect(tw.getByRole('button', {name: '測試延遲', exact: true})).toBeVisible();
    await tw.locator('tbody button[aria-haspopup="menu"]').first().click();
    await tw.getByRole('menuitem', {name: '加入策略群組…', exact: true}).click();
    await expect(tw.getByRole('dialog')).toContainText('已在群組內');
    await tw.keyboard.press('Escape');
    await tw.getByRole('link', {name: '訂閱', exact: true}).click();
    await tw.getByRole('button', {name: '新增訂閱', exact: true}).click();
    await tw.getByRole('dialog').getByRole('combobox', {name: '自動更新', exact: true}).click();
    await expect(tw.getByRole('option', {name: '每 6 小時', exact: true})).toBeVisible();
    await expect(tw.getByRole('option', {name: '自訂', exact: true})).toBeVisible();
    console.log('PASS zh-TW feature labels');
  } finally {
    await b.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
