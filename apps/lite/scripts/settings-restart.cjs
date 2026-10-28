const {chromium, expect} = require('@playwright/test');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const shots = process.env.LITE_RESTART_SHOTS;
const command = 'systemctl restart honk-core';
const content = 'global {\n  log_level: debug\n  tproxy_port: 12345\n}\n';
const labels = {
  'zh-CN': {
    settings: '设置',
    title: '这些设置要在运行代理服务的机器上修改',
    open: '1. 打开配置文件',
    hidden: '1. 打开主配置文件 config.dae',
    edit: '2. 在 global 段改好对应的行（可用每行的复制按钮）',
    restart: '3. 重启服务：',
    docs: '其他系统的重启方式',
    copy: '复制',
    tooltip: '复制配置行',
    log: '日志级别',
    port: '性能分析端口',
    default: '后端默认值',
    copied: '已复制 日志级别',
    failed: '复制失败'
  },
  'zh-TW': {
    settings: '設定',
    title: '這些設定要在執行代理服務的電腦上修改',
    open: '1. 開啟設定檔',
    hidden: '1. 開啟主要設定檔 config.dae',
    edit: '2. 在 global 區段修改對應的行（可用每行的複製按鈕）',
    restart: '3. 重新啟動服務：',
    docs: '其他系統的重新啟動方式',
    copy: '複製',
    tooltip: '複製設定行',
    log: '日誌等級',
    port: '效能分析連接埠',
    default: '後端預設值',
    copied: '已複製 日誌等級',
    failed: '複製失敗'
  },
  en: {
    settings: 'Settings',
    title: 'Change these settings on the machine running the proxy service',
    open: '1. Open the configuration file',
    hidden: '1. Open the main configuration file config.dae',
    edit: '2. Edit the corresponding lines in the global section (use each row’s copy button)',
    restart: '3. Restart the service:',
    docs: 'Restart instructions for other systems',
    copy: 'Copy',
    tooltip: 'Copy configuration line',
    log: 'Log level',
    port: 'Profiling port',
    default: 'Backend default',
    copied: 'Copied Log level',
    failed: 'Copy failed'
  }
};
(async () => {
  const browser = await chromium.launch();
  try {
    for (const locale of ['zh-CN', 'zh-TW', 'en']) {
      const l = labels[locale];
      const context = await browser.newContext({viewport: {width: 1440, height: 900}, locale, reducedMotion: 'reduce'});
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(base).origin});
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      const writes = [];
      let sourcePath = '/etc/proxy/custom.dae';
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(locale => {
        localStorage.setItem('doona-lite.locale', locale);
        localStorage.setItem('doona-lite.theme', 'light');
        localStorage.setItem('doona-lite.connection', JSON.stringify({address: 'http://settings.test', token: 'test'}));
      }, locale);
      await page.route('http://settings.test/**', async route => {
        const request = route.request();
        if (request.method() !== 'GET') writes.push(request.url());
        const url = new URL(request.url());
        const json = body => route.fulfill({contentType: 'application/json', body: JSON.stringify(body)});
        if (url.pathname === '/api') return json({name: 'honk-native', auth: {mode: 'token'}});
        if (url.pathname === '/api/v1/capabilities')
          return json({
            profiles: ['base'],
            limits: {},
            resources: {
              groups: {available: true},
              config: {available: true, writable: true},
              config_validate: {available: true, modes: ['full']},
              operations: {available: true},
              runtime: {available: false}
            }
          });
        if (url.pathname === '/api/v1/groups') return json({groups: []});
        if (url.pathname === '/api/v1/config')
          return json({
            sources: [{id: 'main', kind: 'main', path: sourcePath, content, content_sha256: createHash('sha256').update(content).digest('hex'), writable: true}]
          });
        return route.fulfill({status: 404, body: '{}'});
      });
      const open = async () => {
        await page.goto(base);
        if (page.viewportSize().width < 768)
          await page.getByRole('button', {name: locale === 'en' ? 'Open navigation' : locale === 'zh-TW' ? '開啟導覽' : '打开导航', exact: true}).click();
        await page.getByRole('button', {name: l.settings, exact: true}).click();
        await expect(page.getByText(l.title, {exact: true})).toBeVisible();
      };
      await open();
      const dialog = page.locator('dialog[open]');
      await expect(dialog.getByText(`${l.open} ${sourcePath}`, {exact: true})).toBeVisible();
      await expect(dialog.getByText(l.edit, {exact: true})).toBeVisible();
      await expect(dialog.getByText(l.restart, {exact: true})).toBeVisible();
      await expect(dialog.getByRole('link', {name: l.docs})).toHaveAttribute('href', `https://doona.daeuniverse.org/${locale}/install.html#reload-and-restart`);
      const logRow = dialog.getByRole('listitem').filter({has: page.getByText(l.log, {exact: true})});
      await expect(logRow.getByText('debug', {exact: true})).toBeVisible();
      await expect(logRow.locator('input, select, [role="combobox"]')).toHaveCount(0);
      const copyRow = logRow.getByRole('button', {name: l.copy, exact: true});
      await copyRow.hover();
      await expect(page.getByRole('tooltip')).toHaveText(l.tooltip);
      await copyRow.click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('log_level: debug');
      await expect(page.locator('.astryx-toast').filter({hasText: l.copied})).toBeVisible();
      const defaultRow = dialog.getByRole('listitem').filter({has: page.getByText(l.port, {exact: true})});
      await defaultRow.getByRole('button', {name: l.copy, exact: true}).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('pprof_port: ');
      await dialog.getByRole('button', {name: l.copy, exact: true}).first().click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command);
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => {
          throw new Error('denied');
        };
      });
      await copyRow.click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('log_level: debug');
      await expect(copyRow).toBeFocused();
      await expect(dialog.locator('textarea[readonly]')).toHaveCount(0);
      await page.evaluate(() => {
        document.execCommand = () => false;
      });
      await copyRow.click();
      await expect(page.locator('.astryx-toast').filter({hasText: l.failed})).toBeVisible();
      if (shots && locale === 'zh-CN') {
        fs.mkdirSync(shots, {recursive: true});
        for (const [width, height, theme] of [
          [1440, 900, 'light'],
          [1440, 900, 'dark'],
          [390, 844, 'light'],
          [390, 844, 'dark']
        ]) {
          await page.setViewportSize({width, height});
          await page.addInitScript(theme => localStorage.setItem('doona-lite.theme', theme), theme);
          await open();
          await expect(dialog.getByText(`${l.open} ${sourcePath}`, {exact: true})).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({path: path.join(shots, `settings-restart-${width}-${theme}.png`)});
        }
      }
      for (const hidden of ['<redacted>', '']) {
        sourcePath = hidden;
        await open();
        await expect(dialog.getByText(l.hidden, {exact: true})).toBeVisible();
        await expect(dialog).not.toContainText('<redacted>');
      }
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
      await context.close();
      console.log(`PASS restart settings: ${locale}, current/default clipboard, command, rejected-API fallback, failure, docs, hidden paths, no writes`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
