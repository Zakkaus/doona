const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const base = require('./preview.cjs');
const shots = process.env.LITE_FEATURE_SHOTS;
const backend = 'http://routing.test';
const content =
  '# Keep this exact source, including its final newline.\nglobal {\n  log_level: info\n}\nrouting {\n  domain(suffix: example.com) -> direct\n  fallback: block\n}\n';
const source = {id: 'main', kind: 'main', path: '/config.dae', writable: true, content, content_sha256: createHash('sha256').update(content).digest('hex')};
const rules = [
  {
    rule_id: 'domain-example',
    index: 0,
    expression: 'domain(suffix: example.com)',
    outbound: 'direct',
    must: false,
    source: {source_id: 'main', line: 6, file: 'config.dae', column: 3},
    kind: 'rule'
  },
  {
    rule_id: 'default',
    index: 1,
    expression: 'fallback: block',
    outbound: 'block',
    must: false,
    source: {source_id: 'main', line: 7, file: 'config.dae', column: 3},
    kind: 'fallback'
  }
];
const labels = {
  'zh-CN': {
    test: '测试规则',
    input: '网址或 IP',
    run: '测试',
    headline: '会走 直连',
    matched: '命中第 1 条规则：',
    view: '在列表中查看',
    noMatch: '没有命中任何规则，使用默认出口',
    more: '更多条件',
    port: '端口',
    protocol: '协议',
    export: '导出配置',
    confirm: '导出',
    active: '导出已生效的配置',
    draft: '导出含未应用更改的版本',
    warning: '测试结果基于已生效的配置，未应用的更改不计入。',
    add: '添加规则',
    save: '添加',
    cancel: '取消'
  },
  'zh-TW': {
    test: '測試規則',
    input: '網址或 IP',
    run: '測試',
    headline: '會走 直連',
    matched: '符合第 1 條規則：',
    view: '在清單中檢視',
    more: '更多條件',
    port: '連接埠',
    protocol: '通訊協定',
    export: '匯出設定',
    cancel: '取消'
  },
  en: {
    test: 'Test rules',
    input: 'URL or IP',
    run: 'Test',
    headline: 'Will use Direct',
    matched: 'Matched rule 1:',
    view: 'View in list',
    more: 'More conditions',
    port: 'Port',
    protocol: 'Protocol',
    export: 'Export configuration',
    cancel: 'Cancel'
  }
};
async function fixture(browser, locale = 'zh-CN', width = 1440, theme = 'light') {
  const p = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 900}, locale, colorScheme: theme, hasTouch: width === 390});
  p.setDefaultTimeout(10000);
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const state = {requests: [], traceAvailable: true, fail: false, generation: 'one', resolveModes: ['none', 'live'], dns: false, queries: []};
  await p.addInitScript(
    ({locale, theme, backend}) => {
      localStorage.setItem('doona-lite.locale', locale);
      localStorage.setItem('doona-lite.theme', theme);
      localStorage.setItem('doona-lite.connection', JSON.stringify({address: backend, token: 'test'}));
    },
    {locale, theme, backend}
  );
  await p.route(`${backend}/**`, async route => {
    const request = route.request(),
      pathname = new URL(request.url()).pathname;
    const json = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (request.method() === 'OPTIONS') return json({});
    if (pathname.endsWith('/capabilities'))
      return json({
        profiles: ['base'],
        observed_at: new Date().toISOString(),
        limits: {},
        resources: {
          groups: {available: true},
          config: {available: true, writable: true},
          config_validate: {available: true, modes: ['full']},
          operations: {available: true},
          runtime: {available: true},
          reload: {available: true},
          rules: {available: true},
          routing_trace: {available: state.traceAvailable, resolve_modes: state.resolveModes},
          dns_query: {available: state.dns, record_types: ['A', 'AAAA'], limits: {max_types_per_request: 1}}
        }
      });
    if (pathname.endsWith('/runtime')) return json({lifecycle: {state: 'running'}, last_reload: null});
    if (pathname.endsWith('/groups')) return json([]);
    if (pathname.endsWith('/config')) return json({generation_id: 'one', sources: [{...source, content: state.sourceContent ?? content}]});
    if (pathname.endsWith('/rules')) return json({generation_id: 'one', rules, fallback: {outbound: 'block', source: rules[1].source}});
    if (pathname.endsWith('/dns/query')) {
      const body = request.postDataJSON();
      state.queries.push(body);
      return json({results: body.type.map(type => ({type, answers: [{type, data: type === 'A' ? '192.0.2.1' : '2001:db8::1'}]}))});
    }
    if (pathname.endsWith('/routing/trace')) {
      const body = request.postDataJSON();
      state.requests.push(body);
      if (state.fail) return json({code: 'invalid_request', message: 'fixture failure'}, 422);
      const match = body.input.domain === 'example.com';
      return json({
        mode: 'simulation',
        instance_id: 'fixture',
        generation_id: state.generation,
        observed_at: new Date().toISOString(),
        dns: [],
        evaluations: [
          {
            dst_ip: body.input.dst_ip ?? '192.0.2.1',
            decision: 'determinate',
            outbound: match ? 'direct' : 'block',
            missing_inputs: [],
            rules: rules.map((rule, i) => ({
              rule_id: rule.rule_id,
              expression: rule.expression,
              result: (match ? i === 0 : i === 1) ? 'matched' : 'not_matched',
              missing_inputs: [],
              conditions: []
            }))
          }
        ]
      });
    }
    throw new Error(`Unexpected backend request: ${request.method()} ${pathname}`);
  });
  await p.goto(base.replace(/\/$/, '') + '/#routing');
  await p.locator('.lite-shell').waitFor();
  await p.evaluate(() => {
    location.hash = 'routing';
  });
  await p
    .locator('[data-rule-index="0"]:visible')
    .waitFor()
    .catch(async error => {
      console.log(await p.locator('body').innerText(), errors);
      throw error;
    });
  return {p, state, errors, l: labels[locale]};
}
async function test(p, l, address) {
  await p.getByRole('button', {name: l.test, exact: true}).click();
  await p.getByRole('textbox', {name: l.input, exact: true}).fill(address);
  await p.getByRole('button', {name: l.run, exact: true}).click();
  await expect(p.locator('[data-routing-test-result]')).toBeVisible();
}
async function shot(p, name) {
  if (!shots) return;
  fs.mkdirSync(shots, {recursive: true});
  await p.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {}))
    );
  });
  await p.screenshot({path: `${shots}/${name}.png`});
}
async function download(p, action) {
  const promise = p.waitForEvent('download');
  await action();
  const file = await promise;
  expect(file.suggestedFilename()).toMatch(/^doona-config-\d{8}-\d{4}\.dae$/);
  return fs.readFileSync(await file.path(), 'utf8');
}
(async () => {
  const browser = await chromium.launch();
  try {
    const {p, state, errors, l} = await fixture(browser);
    await p.getByRole('radio', {name: '全局代理', exact: true}).click();
    await p.getByRole('button', {name: '打开策略组', exact: true}).click();
    const leave = p.getByRole('dialog', {name: '放弃未保存的更改？', exact: true});
    await expect(leave).toBeVisible();
    await leave.getByRole('button', {name: l.cancel, exact: true}).click();
    await expect(p.getByRole('radio', {name: '全局代理', exact: true})).toHaveAttribute('aria-checked', 'true');
    await expect(p.getByRole('button', {name: '查看并应用', exact: true})).toBeDisabled();
    await p.getByRole('radio', {name: '规则分流', exact: true}).click();
    await test(p, l, 'https://example.com/a');
    await expect(p.getByRole('heading', {name: l.headline, exact: true})).toBeVisible();
    await expect(p.locator('[data-routing-test-result]')).toContainText(l.matched);
    expect(state.requests.at(-1)).toEqual({input: {network: 'tcp', dst_port: 443, pname: '', domain: 'example.com'}, resolve: 'live'});
    await shot(p, 'tester-matched');
    await p.evaluate(() => {
      const row = document.querySelector('[data-rule-index="0"]');
      const animate = row.animate.bind(row);
      row.animate = (...args) => {
        if (args[1]?.id === 'row-highlight') window.highlightedRule = true;
        return animate(...args);
      };
    });
    await p.getByRole('link', {name: l.view}).click();
    await expect(p.locator('dialog[open]')).toHaveCount(0);
    await expect(p.locator('[data-rule-index="0"]')).toBeFocused();
    expect(await p.evaluate(() => window.highlightedRule)).toBe(true);
    await test(p, l, 'https://unmatched.example/a');
    await expect(p.locator('[data-routing-test-result]')).toContainText(l.noMatch);
    await shot(p, 'tester-no-match');
    await p.keyboard.press('Escape');
    for (const [address, ip, port] of [
      ['1.2.3.4', '1.2.3.4', 443],
      ['[2001:db8::1]:443', '2001:db8::1', 443],
      ['https://example.com:8443/a', null, 8443],
      ['http://example.com/a', null, 80],
      ['ftp://example.com:21/a', null, 21]
    ]) {
      await test(p, l, address);
      expect(state.requests.at(-1).input.dst_port).toBe(port);
      if (ip) {
        expect(state.requests.at(-1).input.dst_ip).toBe(ip);
        expect(state.requests.at(-1).resolve).toBe('none');
      }
      await p.keyboard.press('Escape');
    }
    await p.locator('[data-backend-status]').click();
    await shot(p, 'status-export');
    // Export is the last backend action; About lives in Settings, not this menu.
    const items = (await p.getByRole('menuitem').allTextContents()).map(text => text.trim());
    expect(items.at(-1)).toBe(l.export);
    expect(items.filter(text => /^(About|关于|關於)/.test(text))).toEqual([]);
    expect(await download(p, () => p.getByRole('menuitem', {name: l.export, exact: true}).click())).toBe(content);
    await p.getByRole('button', {name: l.add, exact: true}).click();
    const form = p.getByRole('dialog');
    await form.getByRole('combobox').first().waitFor();
    // The existing add-rule dialog accepts a domain token followed by Enter.
    await form.getByRole('combobox', {name: '值 1', exact: true}).fill('draft.example');
    await form.getByRole('combobox', {name: '值 1', exact: true}).press('Enter');
    await form.getByRole('button', {name: '走向', exact: true}).click();
    await p.getByRole('option', {name: '直连', exact: true}).click();
    await form.getByRole('button', {name: l.save, exact: true}).click();
    await expect(p.locator('dialog[open]')).toHaveCount(0);
    await test(p, l, 'example.com');
    await expect(p.locator('[data-routing-test-result]')).toContainText(l.warning);
    await p.keyboard.press('Escape');
    await p.locator('[data-backend-status]').click();
    await p.getByRole('menuitem', {name: l.export, exact: true}).click();
    await expect(p.getByRole('radio', {name: l.active, exact: true})).toBeChecked();
    expect(await download(p, () => p.getByRole('button', {name: l.confirm, exact: true}).click())).toBe(content);
    await p.locator('[data-backend-status]').click();
    await p.getByRole('menuitem', {name: l.export, exact: true}).click();
    await p.getByRole('radio', {name: l.draft, exact: true}).click();
    const draft = await download(p, () => p.getByRole('button', {name: l.confirm, exact: true}).click());
    expect(draft).toContain('draft.example');
    expect(draft).toContain('example.com');
    expect(draft).not.toBe(content);
    state.fail = true;
    await p.getByRole('button', {name: l.test, exact: true}).click();
    await p.getByRole('button', {name: l.run, exact: true}).click();
    await expect(p.getByRole('dialog')).toContainText('无法测试规则，请重试。');
    await p.keyboard.press('Escape');
    state.fail = false;
    state.generation = 'changed';
    await p.getByRole('button', {name: l.test, exact: true}).click();
    await p.getByRole('button', {name: l.run, exact: true}).click();
    await expect(p.getByRole('dialog')).toContainText('已生效的配置发生变化');
    await p.keyboard.press('Escape');
    state.generation = 'one';
    state.resolveModes = ['none'];
    state.dns = true;
    await p.reload();
    await p.locator('.lite-shell').waitFor();
    await p.evaluate(() => {
      location.hash = 'routing';
    });
    await p.locator('[data-rule-index="0"]:visible').waitFor();
    await test(p, l, 'example.com');
    expect(state.queries.map(query => query.type)).toEqual([['A'], ['AAAA']]);
    expect(state.requests.slice(-2).map(request => request.input.dst_ip)).toEqual(['192.0.2.1', '2001:db8::1']);
    await p.keyboard.press('Escape');
    state.traceAvailable = false;
    await p.reload();
    await p.locator('.lite-shell').waitFor();
    await p.evaluate(() => {
      location.hash = 'routing';
    });
    await p.locator('[data-rule-index="0"]').waitFor();
    await expect(p.getByRole('button', {name: l.test, exact: true})).toHaveCount(0);
    state.sourceContent = content + '# <redacted>\n';
    await p.locator('[data-backend-status]').click();
    expect(await download(p, () => p.getByRole('menuitem', {name: l.export, exact: true}).click())).toBe(state.sourceContent);
    expect(errors).toEqual([]);
    await p.close();
    for (const [locale, width, theme] of [
      ['zh-TW', 1440, 'light'],
      ['en', 1440, 'light'],
      ['zh-CN', 1440, 'dark'],
      ['zh-CN', 390, 'light']
    ]) {
      const {p, l, errors} = await fixture(browser, locale, width, theme);
      await test(p, l, 'https://example.com/a');
      await expect(p.getByRole('heading', {name: l.headline, exact: true})).toBeVisible();
      await p.getByText(l.more, {exact: true}).click();
      await expect(p.getByRole('spinbutton', {name: l.port, exact: true})).toBeVisible();
      await expect(p.getByRole('combobox', {name: l.protocol, exact: true})).toBeVisible();
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await shot(p, `tester-${locale}-${width}-${theme}`);
      await p.keyboard.press('Escape');
      if (width === 390) await p.getByTestId('mobile-nav-toggle').click();
      await p.locator('[data-backend-status]:visible').click();
      await expect(p.getByRole('menuitem', {name: l.export, exact: true})).toBeVisible();
      if (width === 390) expect(await download(p, () => p.getByRole('menuitem', {name: l.export, exact: true}).click())).toBe(content);
      expect(errors).toEqual([]);
      await p.close();
    }
    console.log('PASS routing trace, reveal, fallback, drafts, export bytes, input normalization, capability gating, errors, locales and layouts');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
