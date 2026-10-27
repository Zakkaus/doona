const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
// Screenshots are written only when LITE_SHOTS names a directory.
const output = process.env.LITE_SHOTS;
if (output) fs.mkdirSync(output, {recursive: true});
const link = 'vless://b831381d-6324-4d53-ad4f-8cda48b30811@jp.example.org:443?security=tls#Japan-one';
(async () => {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({viewport: {width: 1440, height: 900}, locale: 'zh-CN', colorScheme: 'light'});
    p.setDefaultTimeout(10000);
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(base);
    await waitForDemo(p);
    await p.getByRole('link', {name: '节点', exact: true}).click();
    await p.locator('[data-node-id]').first().waitFor();
    await p.waitForTimeout(600);
    const shot = async name => output && p.screenshot({path: path.join(output, `${name}.png`)});
    await shot('nodes-light');
    const rows = p.locator('tbody tr:has([data-node-id])');
    const heights = await rows.evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.5);
    await expect(p.locator('tbody')).toContainText('手动添加（5）');
    await expect(p.locator('tbody')).toContainText('订阅节点随订阅更新，不能单独编辑或删除。');
    await expect(p.getByRole('button', {name: '导入', exact: true})).toHaveCount(0);
    await p.getByRole('button', {name: '添加节点', exact: true}).click();
    await expect(p.getByRole('tab', {name: '粘贴链接', exact: true})).toHaveAttribute('aria-selected', 'true');
    const dialog = p.getByRole('dialog', {name: '添加节点', exact: true});
    await expect(dialog.getByRole('button', {name: '添加', exact: true})).toBeDisabled();
    await expect(dialog.getByText('请粘贴至少一个分享链接', {exact: true}).filter({visible: true})).toHaveCount(1);
    const status = dialog.locator('.astryx-layout-footer .astryx-text[role="status"]');
    await expect(status).toHaveText('请粘贴至少一个分享链接');
    expect((await dialog.getByRole('button', {name: '添加', exact: true}).getAttribute('aria-describedby')).split(/\s+/)).toContain(
      await status.getAttribute('id')
    );
    const input = dialog.getByRole('textbox', {name: '分享链接', exact: true});
    await input.fill(link);
    await expect(dialog).toContainText('已识别：VLESS，jp.example.org:443');
    await shot('add-recognized');
    await input.fill(`${link}\nnot-a-link`);
    await expect(dialog).toContainText('第 2 行无法识别');
    await expect(dialog.getByRole('button', {name: '添加', exact: true})).toBeDisabled();
    await shot('add-invalid');
    await p.getByRole('tab', {name: '手动填写', exact: true}).click();
    await expect(dialog.getByRole('textbox', {name: '名称', exact: true})).toBeVisible();
    await expect(input).toBeHidden();
    await expect(dialog.getByRole('button', {name: '撤销修改', exact: true})).toHaveCount(0);
    await dialog.getByRole('textbox', {name: '名称', exact: true}).fill('Manual draft');
    await shot('add-manual');
    await p.getByRole('tab', {name: '粘贴链接', exact: true}).click();
    await expect(dialog.getByRole('textbox', {name: '名称', exact: true})).toBeHidden();
    await p.getByRole('tab', {name: '手动填写', exact: true}).click();
    await expect(dialog.getByRole('textbox', {name: '名称', exact: true})).toHaveValue('Manual draft');
    await p.getByRole('tab', {name: '粘贴链接', exact: true}).click();
    await input.fill(link);
    await expect(dialog.getByRole('button', {name: '添加', exact: true})).toBeEnabled();
    await dialog.getByRole('button', {name: '添加', exact: true}).click();
    await expect(p.locator('.astryx-toast').filter({hasText: '已添加 Japan-one'})).toBeVisible();
    await expect(p.locator('[data-node-id]').filter({hasText: 'Japan-one'})).toBeVisible();
    const highlighted = await p.evaluate(() => document.getAnimations().some(a => a.id === 'row-highlight'));
    expect(highlighted).toBe(true);
    await p.evaluate(() => {
      const highlight = document.getAnimations().find(a => a.id === 'row-highlight');
      highlight.pause();
      highlight.currentTime = 0;
    });
    await shot('nodes-added');
    await p.evaluate(() =>
      document
        .getAnimations()
        .find(a => a.id === 'row-highlight')
        ?.play()
    );
    await p.locator('.astryx-toast').filter({hasText: '已添加 Japan-one'}).getByRole('button', {name: '分享', exact: true}).click();
    await expect(p.getByRole('dialog')).toContainText('Japan-one');
    await p.keyboard.press('Escape');
    await p.getByRole('button', {name: '添加节点', exact: true}).click();
    await input.fill(`${link.replace('Japan-one', 'Pair-one')}\n${link.replace('Japan-one', 'Pair-two')}`);
    await expect(dialog.getByText(/^已识别：/)).toHaveCount(2);
    await dialog.getByRole('button', {name: '添加 2 个节点', exact: true}).click();
    await expect(p.locator('dialog[open]')).toHaveCount(0);
    await expect(p.locator('tbody')).toContainText('手动添加（8）');
    for (const name of ['Pair-one', 'Pair-two']) await expect(rows.filter({hasText: name})).toBeVisible();
    await rows.filter({hasText: 'Pair-one'}).getByText('Pair-one', {exact: true}).click();
    await expect(p.getByRole('dialog', {name: '编辑节点', exact: true})).toBeVisible();
    await expect(p.getByRole('button', {name: '撤销修改', exact: true})).toBeVisible();
    await p.keyboard.press('Escape');
    const sub = rows.filter({hasText: 'harbor'}).first();
    await expect(sub.getByRole('checkbox')).toHaveCount(0);
    const background = await sub.evaluate(row => getComputedStyle(row).backgroundColor);
    await sub.hover();
    expect(await sub.evaluate(row => getComputedStyle(row).backgroundColor)).toBe(background);
    await expect(sub.locator('td').nth(3)).toHaveText('');
    await expect(sub.locator('td').last()).toHaveText('');
    await sub.click({force: true});
    await expect(p.locator('dialog[open]')).toHaveCount(0);
    await p.emulateMedia({colorScheme: 'dark'});
    await p.waitForTimeout(300);
    await shot('nodes-dark');
    await p.setViewportSize({width: 390, height: 844});
    await p.emulateMedia({colorScheme: 'light'});
    await p.waitForTimeout(300);
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await shot('nodes-mobile');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({errors}, null, 2));
    await p.close();
    const tw = await browser.newPage({viewport: {width: 390, height: 844}, locale: 'zh-TW', reducedMotion: 'reduce'});
    await tw.addInitScript(() => {
      window.__rowMotion = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        if (['row-enter', 'row-highlight'].includes(options?.id)) window.__rowMotion.push(options.id);
        return animate.call(this, frames, options);
      };
    });
    await tw.goto(base);
    await waitForDemo(tw);
    await tw.evaluate(() => {
      location.hash = 'nodes';
    });
    await tw.getByRole('button', {name: '新增節點', exact: true}).click();
    const twDialog = tw.getByRole('dialog', {name: '新增節點', exact: true});
    await expect(twDialog.getByRole('tab', {name: '貼上連結', exact: true})).toHaveAttribute('aria-selected', 'true');
    await twDialog.getByRole('textbox', {name: '分享連結', exact: true}).fill(link);
    await expect(twDialog).toContainText('已辨識：VLESS，jp.example.org:443');
    await twDialog.getByRole('button', {name: '新增', exact: true}).click();
    await expect(tw.locator('.astryx-toast')).toContainText('已新增 Japan-one');
    await expect(tw.locator('tbody')).toContainText('手動新增（6）');
    const newRow = tw.locator('tr').filter({has: tw.getByText('Japan-one', {exact: true})});
    await newRow.focus();
    await tw.keyboard.press('Enter');
    await expect(tw.getByRole('dialog', {name: '編輯節點', exact: true})).toBeVisible();
    await tw.keyboard.press('Escape');
    await expect(newRow).toBeFocused();
    expect(await tw.evaluate(() => window.__rowMotion)).toEqual([]);
    expect(await tw.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await tw.close();
    console.log('PASS zh-TW, keyboard row editing and static added rows with reduced motion');

    const failed = await browser.newPage({locale: 'zh-CN', reducedMotion: 'reduce'});
    const content = 'node {\n}\n';
    let validations = 0;
    await failed.addInitScript(() => {
      localStorage.setItem('doona-lite.connection', JSON.stringify({address: 'http://nodes.test', token: 'test'}));
    });
    await failed.route('http://nodes.test/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
      if (request.method() === 'OPTIONS') return json({});
      if (pathname === '/api/v1/capabilities')
        return json({
          profiles: ['base'],
          limits: {},
          resources: {
            nodes: {available: true},
            config: {available: true, writable: true},
            config_validate: {available: true, modes: ['syntax', 'full']},
            operations: {available: true},
            runtime: {available: false},
            providers: {available: false}
          }
        });
      if (pathname === '/api/v1/nodes') return json({nodes: [], next_cursor: null});
      if (pathname === '/api/v1/config')
        return json({sources: [{id: 'main', kind: 'main', writable: true, content, content_sha256: createHash('sha256').update(content).digest('hex')}]});
      if (pathname === '/api/v1/config/validate') {
        expect(request.postDataJSON().mode).toBe('syntax');
        validations++;
        return json({code: 'invalid_request', message: 'Validation failed'}, 422);
      }
      throw new Error(`Unexpected backend request: ${request.method()} ${pathname}`);
    });
    // A saved backend connection needs the production build; the demo build always opens the demo.
    await failed.goto(process.env.LITE_PRODUCTION_URL.replace(/\/$/, '') + '/#nodes');
    await failed.getByRole('link', {name: '节点', exact: true}).click();
    await failed.getByRole('button', {name: '添加节点', exact: true}).click();
    const failedDialog = failed.getByRole('dialog', {name: '添加节点', exact: true});
    await failedDialog.getByRole('textbox', {name: '分享链接', exact: true}).fill(link);
    const failureStatus = failedDialog.locator('.astryx-layout-footer .astryx-text[role="status"]');
    await expect(failureStatus).toHaveText('后端拒绝了配置更改，未写入任何内容。');
    await expect(failureStatus).toBeVisible();
    await expect(failureStatus).toHaveAttribute('aria-live', 'polite');
    expect(validations).toBe(1);
    await expect(failedDialog.locator('#node-paste-panel ul')).toHaveCount(0);
    const add = failedDialog.getByRole('button', {name: '添加', exact: true});
    await expect(add).toBeDisabled();
    expect((await add.getAttribute('aria-describedby')).split(/\s+/)).toContain(await failureStatus.getAttribute('id'));
    await failed.close();
    console.log('PASS validation request failure is announced in the footer and describes the disabled action');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
