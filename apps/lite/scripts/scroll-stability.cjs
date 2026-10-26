const {chromium, expect} = require('@playwright/test');
const base = process.env.LITE_PREVIEW_URL ?? 'http://127.0.0.1:5198';
const fs = require('node:fs');
async function inspect(p) {
  return p.evaluate(() => {
    const owners = start => {
      const result = [];
      for (let e = start?.parentElement; e; e = e.parentElement) {
        if (/^(auto|scroll)$/.test(getComputedStyle(e).overflowY)) result.push(e.id || e.classList[0]);
      }
      return result;
    };
    const content = Array.from(document.querySelectorAll('.lite-page-content')).find(e => e.checkVisibility());
    return {
      headingOwners: owners(Array.from(document.querySelectorAll('[role="main"] h1')).find(e => e.checkVisibility())),
      bodyOwners: owners(Array.from(document.querySelectorAll('[data-page-body]')).find(e => e.checkVisibility())),
      width: content.clientWidth,
      gutter: content.offsetWidth - content.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth
    };
  });
}
async function stable(p, act) {
  const sampling = p.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const content = Array.from(document.querySelectorAll('.lite-page-content')).find(e => e.checkVisibility());
      const heading = Array.from(document.querySelectorAll('h1')).find(e => e.checkVisibility());
      samples.push({width: content.clientWidth, x: heading.getBoundingClientRect().x});
      await new Promise(r => setTimeout(r, 40));
    }
    return samples;
  });
  await act();
  const samples = await sampling;
  for (const key of ['width', 'x']) expect(Math.max(...samples.map(s => s[key])) - Math.min(...samples.map(s => s[key]))).toBeLessThanOrEqual(0.5);
  const state = await inspect(p);
  expect(state.headingOwners.length).toBeLessThanOrEqual(1);
  expect(state.bodyOwners).toHaveLength(1);
  expect(state.pageOverflow).toBeLessThanOrEqual(0);
  expect(state.contentOverflow).toBeLessThanOrEqual(0);
  return state;
}
(async () => {
  const b = await chromium.launch({args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars']});
  const records = [];
  for (const [width, height] of [
    [1700, 700],
    [1700, 1000],
    [1240, 1000],
    [1280, 1000]
  ]) {
    const p = await b.newPage({locale: 'en-US', viewport: {width, height}});
    await p.goto(base);
    await p.getByRole('button', {name: 'Try the demo', exact: true}).click();
    await p.locator('[data-group-row]').first().waitFor();
    await p.locator('[data-page-body]:visible').waitFor();
    for (const route of ['nodes', 'subscriptions', 'groups', 'routing', 'dns']) {
      await p.evaluate(r => (location.hash = r), route);
      await expect(p.locator('h1:visible')).toHaveText(route === 'dns' ? 'DNS' : route[0].toUpperCase() + route.slice(1));
      await p.locator('[data-page-body]:visible').waitFor();
      const state = await inspect(p);
      expect(state.headingOwners.length).toBeLessThanOrEqual(1);
      expect(state.bodyOwners).toHaveLength(1);
      expect(state.pageOverflow).toBeLessThanOrEqual(0);
      expect(state.contentOverflow).toBeLessThanOrEqual(0);
      records.push({width, height, route, ...state});
    }
    await p.evaluate(() => (location.hash = 'routing'));
    await p.locator('[data-mode]').first().waitFor();
    for (const mode of ['All direct', 'Global proxy', 'Rule-based']) await stable(p, () => p.getByRole('radio', {name: new RegExp('^' + mode)}).click());
    await stable(p, () => p.getByRole('radio', {name: 'Text', exact: true}).click());
    await p.locator('.cm-editor').waitFor();
    const editor = p.locator('.cm-scroller');
    expect(await editor.evaluate(e => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
    await stable(p, () => p.getByRole('radio', {name: 'Visual', exact: true}).click());
    const regression = await p.addStyleTag({content: '#astryx-app-shell-main {overflow:auto!important}'});
    expect((await inspect(p)).bodyOwners).toHaveLength(2);
    await regression.evaluate(e => e.remove());
    await p.evaluate(() => (location.hash = 'groups'));
    await p.getByRole('radio', {name: 'Edit group', exact: true}).waitFor();
    await stable(p, () => p.getByRole('radio', {name: 'Edit group', exact: true}).click());
    await stable(p, () => p.getByRole('radio', {name: 'Select nodes', exact: true}).click());
    console.log('PASS one scroll owner, classic gutter, mode/text/tab width, negative control', width, height);
    await p.close();
  }
  const p = await b.newPage({locale: 'en-US', viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce'});
  await p.goto(base);
  await p.getByRole('button', {name: 'Try the demo', exact: true}).click();
  await p.locator('[data-group-row]').first().waitFor();
  await p.evaluate(() => (location.hash = 'nodes'));
  await p.getByRole('button', {name: 'Add node', exact: true}).click();
  await p.getByRole('tab', {name: 'Enter manually', exact: true}).click();
  const port = p.getByRole('spinbutton', {name: 'Server port', exact: true});
  await port.fill('443');
  await port.press('ArrowUp');
  await expect(port).toHaveValue('444');
  await port.press('PageUp');
  await expect(port).toHaveValue('454');
  await port.press('PageDown');
  await expect(port).toHaveValue('444');
  await port.fill('65535');
  await port.press('PageUp');
  await expect(port).toHaveValue('65535');
  await expect(p.locator('.astryx-number-input button')).toHaveCount(0);
  console.log('PASS number fields: no buttons, arrows/Page Up/Page Down, integer bounds');
  await p.getByRole('button', {name: 'Cancel', exact: true}).click();
  await p.getByRole('button', {name: 'Settings', exact: true}).click();
  await p.getByRole('button', {name: 'Health check', exact: true}).click();
  const tolerance = p.getByRole('spinbutton', {name: 'Switch tolerance', exact: true});
  await tolerance.fill('42');
  await tolerance.press('Tab');
  await expect(tolerance).toHaveValue('42');
  await tolerance.fill('');
  await tolerance.press('Tab');
  await expect(tolerance).toHaveValue('');
  await expect(p.getByRole('button', {name: 'Review and apply', exact: true})).toBeEnabled();
  console.log('PASS optional numeric settings clear to backend default without a clear button');
  await b.close();
  if (process.env.LITE_SCROLL_OUTPUT) fs.writeFileSync(process.env.LITE_SCROLL_OUTPUT, JSON.stringify(records, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
