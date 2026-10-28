// Scans every page and the shared dialogs for dae syntax that a newcomer should never see.
// Text mode, code editors and the 「查看配置文本」 Collapsible are exempt. Groups, the shell and the shared
// review dialogs and every page must be clean.
const {chromium} = require('@playwright/test');

const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const tokens = ['group(', 'name(', 'subtag(', 'dip', 'dport', 'l4proto', 'pname', 'qname', 'fallback', 'must_', '(must)', '->'];

function scan(page, tokensToFind, root = 'body') {
  return page.evaluate(
    ([found, rootSelector]) => {
      const exempt = '[data-config-text],[data-text-mode],[data-code-editor],.cm-editor,script,style,[aria-hidden="true"]';
      const hits = [];
      const roots = [...document.querySelectorAll(rootSelector)];
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const element = node.parentElement;
          if (!element || element.closest(exempt)) continue;
          if (!element.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) continue;
          const text = node.textContent ?? '';
          for (const token of found) if (text.includes(token)) hits.push(`${token} in "${text.trim().slice(0, 80)}"`);
        }
      }
      return [...new Set(hits)];
    },
    [tokensToFind, root]
  );
}

(async () => {
  const browser = await chromium.launch({args: ['--disable-features=OverlayScrollbar']});
  const page = await browser.newPage({locale: 'zh-CN', viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  page.setDefaultTimeout(10000);
  const results = new Map();
  const record = async (area, root) => {
    const hits = await scan(page, tokens, root);
    results.set(area, [...(results.get(area) ?? []), ...hits]);
  };
  const go = async hash => {
    // Leave the document so unsaved route guards cannot turn this reset into a hash-only navigation.
    await page.goto('about:blank');
    await page.goto(base);
    await waitForDemo(page);
    const labels = {routing: '路由', subscriptions: '订阅', nodes: '节点', dns: 'DNS'};
    await page.getByRole('navigation').getByRole('link', {name: labels[hash], exact: true}).click();
    await page.waitForTimeout(1200);
    console.log(`page ${hash}: ${await page.locator('h1').first().innerText()}`);
  };
  await page.goto(base);
  await waitForDemo(page);
  await page.waitForTimeout(700);

  // Groups, both modes, every group.
  const rows = await page.locator('[data-group-row]').evaluateAll(list => list.map(row => row.getAttribute('data-group-row')));
  for (const mode of ['选择节点', '编辑组']) {
    await page.getByRole('radio', {name: mode, exact: true}).click();
    for (const name of rows) {
      await page.locator(`[data-group-row="${name}"]`).click();
      await page.waitForTimeout(150);
      await record(`groups ${mode}`);
    }
  }
  // Group dialogs and the subscription popover, then the shared review dialog.
  await page.locator(`[data-group-row="${rows[0]}"]`).click();
  await page.getByRole('button', {name: `操作: ${rows[0]}`, exact: true}).click();
  await page.getByRole('menuitem', {name: '复制成员到…', exact: true}).click();
  await page.getByRole('dialog').getByRole('combobox').first().click();
  await page.getByRole('option').last().click();
  await page.waitForTimeout(300);
  await record('groups dialogs');
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', {name: '创建组', exact: true}).click();
  await record('groups dialogs');
  await page.getByRole('dialog').getByRole('textbox', {name: '名称', exact: true}).fill('scan-group');
  await page.getByRole('dialog').getByRole('button', {name: '创建', exact: true}).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', {name: '添加: harbor', exact: true}).click();
  await page.waitForTimeout(300);
  await record('groups popover');
  await page.locator('[data-bind-popover="harbor"]').getByRole('button', {name: '添加', exact: true}).click();
  await page.waitForTimeout(300);
  await record('groups 编辑组');
  await page.getByRole('button', {name: '查看并应用', exact: true}).click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(300);
  await record('review groups');
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await page.getByRole('button', {name: '放弃更改', exact: true}).click();
  await page.waitForTimeout(300);

  // Shell: footer status menu, search palette, settings.
  await page.getByRole('button', {name: '代理服务操作', exact: true}).click();
  await page.waitForTimeout(300);
  await record('shell menu');
  await page.keyboard.press('Escape');
  await page.locator('nav').getByRole('button', {name: /搜索/}).first().click();
  await page.keyboard.type('日本');
  await page.waitForTimeout(600);
  await record('shell search');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('nav').getByRole('button', {name: '设置', exact: true}).first().click();
  await page.waitForTimeout(500);
  const sections = await page.getByRole('dialog').locator('nav button, [aria-label="设置分类"] button').allInnerTexts();
  for (const section of [...new Set(sections)].filter(Boolean)) {
    await page.getByRole('dialog').getByRole('button', {name: section, exact: true}).first().click();
    await page.waitForTimeout(200);
    await record('shell settings');
  }
  await page.keyboard.press('Escape');

  // Routing mode change through the shared review dialog.
  await go('routing');
  await record('routing');
  await page.getByRole('button', {name: '测试规则', exact: true}).click();
  await page.getByRole('textbox', {name: '网址或 IP', exact: true}).fill('example.com');
  await page.getByRole('button', {name: '测试', exact: true}).click();
  await page.locator('[data-routing-test-result]').waitFor();
  await record('routing tester', 'dialog[open]');
  await page.keyboard.press('Escape');
  await page
    .locator('dialog[open]')
    .waitFor({state: 'detached'})
    .catch(() => {});
  await page.getByRole('button', {name: '添加规则', exact: true}).click();
  await record('routing rule dialog', 'dialog[open]');
  await page.getByRole('combobox', {name: '条件类型 1', exact: true}).click();
  await record('routing condition selector');
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: '取消', exact: true}).click();
  await page.getByRole('button', {name: '用模板重建规则', exact: true}).click();
  await page.getByRole('dialog').waitFor();
  await record('routing template', 'dialog[open]');
  await page.getByRole('button', {name: '取消', exact: true}).click();
  const direct = page.locator('[data-mode="direct"]');
  if (await direct.count()) {
    await direct.first().click();
    await page.getByRole('button', {name: '查看并应用', exact: true}).click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(300);
    await record('review routing', 'dialog[open]');
    await page.getByRole('button', {name: '取消', exact: true}).click();
  }
  for (const hash of ['subscriptions', 'nodes', 'dns']) {
    await go(hash);
    await record(hash);
    if (hash === 'dns') {
      await page.getByRole('button', {name: '高级', exact: true}).click();
      await record('dns response rules');
      await page.getByRole('button', {name: '添加 DNS 服务器', exact: true}).click();
      await record('dns server dialog', 'dialog[open]');
      await page.getByRole('combobox', {name: '服务商', exact: true}).click();
      await record('dns presets');
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name: '取消', exact: true}).click();
    }
  }
  await browser.close();

  let failed = false;
  for (const [area, hits] of results) {
    const unique = [...new Set(hits)];
    if (unique.length) failed = true;
    console.log(`${unique.length ? 'FAIL' : 'PASS'} ${area}: ${unique.length} hits`);
    for (const hit of unique.slice(0, 50)) console.log(`  ${hit}`);
  }
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
