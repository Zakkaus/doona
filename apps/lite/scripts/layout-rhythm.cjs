const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');
const {waitForDemo} = require('./demo.cjs');
const shots = process.env.LITE_RHYTHM_SHOTS;
const records = [];
const routes = ['groups', 'subscriptions', 'nodes', 'routing', 'dns'];
const first = {
  groups: '[data-group-row]',
  subscriptions: '[data-provider-id]',
  nodes: 'tbody tr',
  routing: '[data-rule-index]',
  dns: '[data-rule-list="request"] [data-rule-index]'
};
const titles = {en: ['Groups', 'Subscriptions', 'Nodes', 'Routing', 'DNS'], 'zh-CN': ['策略组', '订阅', '节点', '路由', 'DNS']};
async function settle(p) {
  await p.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(a => a.effect.getTiming().iterations !== Infinity)
        .map(a => a.finished.catch(() => {}))
    );
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
async function screenshot(p, name) {
  if (shots) {
    fs.mkdirSync(shots, {recursive: true});
    await p.screenshot({path: path.join(shots, `${name}.png`), fullPage: true});
  }
}
async function controls(p) {
  const toolbars = p.locator('[data-collection-toolbar]:visible');
  expect(await toolbars.count()).toBeGreaterThan(0);
  for (const toolbar of await toolbars.all()) {
    const result = await toolbar.evaluate(root => {
      const selector = '.astryx-text-input,.astryx-selector,.astryx-segmented-control,.astryx-button';
      const controls = [...root.querySelectorAll(selector)].filter(e => e.checkVisibility() && !e.parentElement.closest(selector));
      return controls.map(e => {
        const rect = e.getBoundingClientRect();
        const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        const labels = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim() || !node.parentElement.checkVisibility() || node.parentElement.closest('[role="tooltip"],.astryx-popover')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const lines = new Set([...range.getClientRects()].filter(r => r.width && r.height).map(r => Math.round(r.y)));
          labels.push({text: node.textContent, lines: lines.size});
        }
        return {
          tag: e.tagName,
          className: [...e.classList].filter(c => c.startsWith('astryx-')).join(' '),
          name: e.getAttribute('aria-label'),
          y: rect.y,
          height: rect.height,
          labels
        };
      });
    });
    expect(result.length).toBeGreaterThan(0);
    for (const control of result) {
      expect(control.height, JSON.stringify(control)).toBeCloseTo(36, 0);
      for (const label of control.labels) expect(label.lines, label.text).toBeLessThanOrEqual(1);
      const peers = result.filter(other => Math.abs(other.y - control.y) <= 1);
      for (const peer of peers) expect(Math.abs(peer.height - control.height), JSON.stringify(peers)).toBeLessThanOrEqual(1);
      if (/latency:|延迟|延遲/.test(control.name ?? '') && control.className.includes('astryx-button')) expect(peers.length).toBeGreaterThan(1);
    }
  }
}
async function aboutPanel(p, locale) {
  await p.getByRole('button', {name: locale === 'en' ? 'Settings' : '设置', exact: true}).click();
  const dialog = p.getByRole('dialog');
  await dialog.getByRole('button', {name: locale === 'en' ? 'About' : '关于', exact: true}).click();
  const panel = dialog.locator('.lite-dialog-content');
  await expect(panel.getByRole('heading', {name: 'doona lite', exact: true})).toBeVisible();
  // Selecting the section keeps focus on its navigation item, never a link inside the panel.
  await expect.poll(() => p.evaluate(() => document.activeElement?.tagName)).not.toBe('A');
  // The report button lives in the sidebar footer, not here.
  await expect(panel.getByRole('link')).toHaveCount(3);
  const hrefs = [`https://doona.daeuniverse.org/${locale}/`, 'https://github.com/Zakkaus/doona', 'https://github.com/Zakkaus/doona/releases'];
  for (const [index, href] of hrefs.entries()) {
    const link = panel.getByRole('link').nth(index);
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener noreferrer/);
  }
  await p.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}
async function footer(p, width, locale) {
  if (width === 390) {
    await p.getByRole('button', {name: locale === 'en' ? 'Open navigation' : '打开导航', exact: true}).click();
  }
  const nav = width === 390 ? p.locator('dialog.astryx-mobile-nav[open]') : p.locator('nav').first();
  const theme = nav.locator('[data-theme-toggle]');
  const language = nav.locator('[data-language-menu]');
  await expect(theme).toBeVisible();
  await expect(language).toBeVisible();
  const a = await theme.boundingBox(),
    b = await language.boundingBox();
  expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
  const report = nav.getByRole('link', {name: locale === 'en' ? 'Report a problem' : '报告问题', exact: true});
  await expect(report).toHaveCount(1);
  await expect(report).toBeVisible();
  await expect(report).toHaveAttribute('href', 'https://github.com/Zakkaus/doona/issues');
  await expect(report).toHaveAttribute('target', '_blank');
  await expect(report).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(report).toHaveText('');
  await expect(report.locator('svg')).toBeVisible();
  const c = await report.boundingBox();
  expect(Math.abs(a.height - c.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(a.y - c.y)).toBeLessThanOrEqual(1);
  expect(c.x).toBeGreaterThan(b.x);
  if (width === 1440) {
    const collapse = await nav.getByRole('button', {name: locale === 'en' ? 'Collapse sidebar' : '折叠侧边栏', exact: true}).boundingBox();
    expect(Math.abs(a.height - collapse.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.y - collapse.y)).toBeLessThanOrEqual(1);
  } else {
    await nav.getByRole('button', {name: locale === 'en' ? 'Close navigation' : '关闭导航', exact: true}).click();
    await expect(nav).not.toBeVisible();
  }
}
async function ruleLabels(p) {
  const clipped = await p.locator('.rule-chip:visible').evaluateAll(tokens =>
    tokens.flatMap(token => {
      const bounds = token.getBoundingClientRect();
      const walker = document.createTreeWalker(token, NodeFilter.SHOW_TEXT);
      const failures = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        if (
          [...range.getClientRects()].some(
            r => r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1
          )
        )
          failures.push(walker.currentNode.textContent);
      }
      return failures;
    })
  );
  expect(clipped).toEqual([]);
}
async function searchInsets(p) {
  for (const toolbar of await p.locator('[data-collection-toolbar]:visible').all()) {
    const delta = await toolbar.evaluate(root => {
      const search = root.querySelector('.astryx-text-input');
      if (!search) return null;
      let scope = root.parentElement;
      while (scope) {
        const row = scope.querySelector('[data-member-row], [data-rule-index], [data-subscription-nodes] > li, [data-group-row], [data-provider-id], tbody tr');
        if (row) return Math.abs(search.getBoundingClientRect().x - row.getBoundingClientRect().x);
        scope = scope.parentElement;
      }
      throw new Error('Search toolbar has no collection row');
    });
    if (delta !== null) expect(delta).toBeLessThanOrEqual(1);
  }
}
async function groupWidths(browser) {
  for (const width of [1180, 1470, 1920, 2560])
    for (const locale of ['en', 'zh-TW']) {
      const p = await browser.newPage({viewport: {width, height: 900}, locale, reducedMotion: 'reduce', colorScheme: 'dark'});
      p.setDefaultTimeout(15000);
      await p.addInitScript(locale => {
        localStorage.setItem('doona-lite.locale', locale);
        localStorage.setItem('doona-lite.theme', 'dark');
      }, locale);
      await p.goto(base);
      await waitForDemo(p);
      await p.locator('[data-group-row]').first().waitFor();
      await settle(p);
      const rows = await p.locator('[data-group-row]:visible').evaluateAll(rows =>
        rows.map(row => {
          const box = row.getBoundingClientRect();
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          const texts = [];
          while (walker.nextNode()) if (walker.currentNode.textContent.trim()) texts.push(walker.currentNode);
          const nameElement = texts.find(node => node.textContent === row.dataset.groupRow).parentElement;
          const name = nameElement.getBoundingClientRect();
          const latency = texts.at(-1).parentElement;
          return {
            row: row.dataset.groupRow,
            name: name.width,
            fontSize: parseFloat(getComputedStyle(nameElement).fontSize),
            nameInside: name.left >= box.left && name.right <= box.right,
            latency: latency.textContent,
            latencyInside: latency.getBoundingClientRect().right <= box.right + 0.5 && latency.scrollWidth <= latency.clientWidth
          };
        })
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.name, JSON.stringify(row)).toBeGreaterThanOrEqual(4 * row.fontSize);
        expect(row.nameInside && row.latencyInside, JSON.stringify(row)).toBe(true);
      }
      const insets = await p
        .locator('nav')
        .first()
        .evaluate(nav => {
          const box = nav.getBoundingClientRect();
          const scrolled = [nav, ...nav.querySelectorAll('*')].filter(e => e.scrollLeft !== 0).length;
          const items = [...nav.querySelectorAll('.astryx-side-nav-item')]
            .filter(e => e.checkVisibility() && !e.parentElement.closest('.astryx-side-nav-item'))
            .map(e => e.getBoundingClientRect());
          return {scrolled, items: items.map(r => ({start: r.left - box.left, end: box.right - r.right}))};
        });
      expect(insets.scrolled).toBe(0);
      expect(insets.items.length).toBeGreaterThan(0);
      for (const item of insets.items) expect(Math.abs(item.start - item.end), JSON.stringify(insets)).toBeLessThanOrEqual(1);
      await screenshot(p, `groups-${width}-${locale}-dark`);
      if (width >= 1470) {
        const inspector = p.getByLabel(locale === 'en' ? 'Group details' : '策略群組詳細資料', {exact: true});
        const handle = p.getByRole('separator', {name: locale === 'en' ? 'Resize group details' : '調整策略群組詳細資料寬度', exact: true});
        for (const [key, chosen] of [
          [null, 640],
          ['Home', 480],
          ['End', 880]
        ]) {
          if (key) await handle.press(key);
          await expect(handle).toHaveAttribute('aria-valuenow', String(chosen));
          expect((await inspector.boundingBox()).width).toBeCloseTo(chosen, 1);
        }
        console.log(`PASS inspector default and chosen widths: ${width} ${locale}`);
      }
      console.log(`PASS group names and sidebar inset: ${width} ${locale}`);
      await p.close();
    }
}
async function nodeLayout(p, compact, latencyLabel) {
  const table = p.locator('table:visible');
  const scroller = p.locator('.astryx-table-scroll-wrapper:visible');
  await expect(table.locator('[data-node-id]').first()).toBeVisible();
  const help = table.locator('td[colspan] .astryx-text').last();
  const description = await help.evaluate(element => {
    const viewport = element.closest('.astryx-table-scroll-wrapper').getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()];
    return {
      count: rects.length,
      fits: rects.every(rect => Math.floor(rect.left) >= Math.floor(viewport.left) && Math.ceil(rect.right) <= Math.ceil(viewport.right))
    };
  });
  expect(description.count, 'Subscription help has rendered text').toBeGreaterThan(0);
  expect(description.fits, 'Subscription help fits the visible table width').toBe(true);
  if (compact) {
    await expect(table.getByRole('columnheader').filter({hasText: latencyLabel})).toHaveCount(1);
    const details = await table.locator('[data-node-id]').evaluateAll(names =>
      names.map(name => {
        const detail = name.nextElementSibling.querySelector('.astryx-text');
        const style = getComputedStyle(detail);
        return {
          text: detail.textContent,
          height: detail.getBoundingClientRect().height,
          lineHeight: parseFloat(style.lineHeight),
          whiteSpace: style.whiteSpace,
          overflow: style.textOverflow
        };
      })
    );
    expect(details.some(detail => detail.text.includes('shadowsocks / harbor'))).toBe(true);
    for (const detail of details) {
      expect(detail.whiteSpace, detail.text).toBe('nowrap');
      expect(detail.overflow, detail.text).toBe('ellipsis');
      expect(Math.round(detail.height), detail.text).toBeLessThanOrEqual(Math.round(detail.lineHeight));
    }
    return;
  }
  expect(await scroller.evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true);
  const end = table.locator('thead th').last();
  await expect(end).toHaveCSS('position', 'sticky');
  await scroller.evaluate(e => (e.scrollLeft = (e.scrollWidth - e.clientWidth) / 2));
  await settle(p);
  expect(await scroller.evaluate(e => e.scrollLeft)).toBeGreaterThan(0);
  const pinned = await table.locator('th, td').evaluateAll(cells =>
    cells
      .filter(cell => getComputedStyle(cell).position === 'sticky')
      .map(cell => ({
        edge: getComputedStyle(cell).insetInlineStart === 'auto' ? 'end' : 'start',
        opacity: getComputedStyle(cell, '::after').opacity
      }))
  );
  for (const cell of pinned) expect(cell.opacity, `${cell.edge}-pinned cell has no edge strip while scrolling`).toBe('0');
  // Each data column must fit between the pinned selection and actions.
  const headers = table.locator('thead th');
  for (let index = 1; index < (await headers.count()) - 1; index++) {
    await headers.nth(index).evaluate(e => {
      const scroller = e.closest('.astryx-table-scroll-wrapper');
      scroller.scrollLeft +=
        e.getBoundingClientRect().left - scroller.getBoundingClientRect().left - e.parentElement.firstElementChild.getBoundingClientRect().width;
    });
    await settle(p);
    const visible = await headers.nth(index).evaluate(e => {
      const rect = e.getBoundingClientRect();
      const first = e.parentElement.firstElementChild.getBoundingClientRect();
      const last = e.parentElement.lastElementChild.getBoundingClientRect();
      return Math.floor(rect.left) >= Math.floor(first.right) && Math.ceil(rect.right) <= Math.ceil(last.left);
    });
    expect(visible, `Column ${index} is reachable between pinned columns`).toBe(true);
  }
}

async function nodeMenu(p) {
  const pager = p.locator('.astryx-pagination:visible');
  await pager.scrollIntoViewIfNeeded();
  const trigger = p.locator('tbody tr:has([data-node-id])').last().locator('button[aria-haspopup="menu"]');
  await trigger.click();
  const menu = p.getByRole('menu');
  await expect(menu).toBeVisible();
  await settle(p);
  const a = await menu.boundingBox(),
    b = await pager.boundingBox();
  const viewport = p.viewportSize();
  expect(a.x).toBeGreaterThanOrEqual(0);
  expect(a.y).toBeGreaterThanOrEqual(0);
  expect(Math.ceil(a.x + a.width)).toBeLessThanOrEqual(viewport.width);
  expect(Math.ceil(a.y + a.height)).toBeLessThanOrEqual(viewport.height);
  expect(a.y + a.height <= b.y || a.y >= b.y + b.height || a.x + a.width <= b.x || a.x >= b.x + b.width, 'Row menu leaves pagination uncovered').toBe(true);
  await p.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
}
async function subscriptionActionInset(p) {
  const inset = await p.locator('[data-page-frame]:visible [data-collection-toolbar]').evaluate(toolbar => {
    const action = toolbar.querySelector('button.astryx-button');
    const walker = document.createTreeWalker(action, NodeFilter.SHOW_TEXT, {
      acceptNode: node => (node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
    });
    const label = document.createRange();
    label.selectNodeContents(walker.nextNode());
    return {label: label.getBoundingClientRect().left, search: toolbar.querySelector('.astryx-text-input').getBoundingClientRect().left};
  });
  expect(inset.label).toBeCloseTo(inset.search, 0);
}
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390])
      for (const locale of ['en', 'zh-CN']) {
        const p = await browser.newPage({viewport: {width, height: 1000}, locale, reducedMotion: 'reduce', colorScheme: 'light'});
        p.setDefaultTimeout(15000);
        await p.addInitScript(
          ({locale}) => {
            localStorage.setItem('doona-lite.locale', locale);
            localStorage.setItem('doona-lite.theme', 'light');
          },
          {locale}
        );
        await p.goto(base);
        await waitForDemo(p);
        if (width === 1440) await aboutPanel(p, locale);
        const rhythm = [];
        for (const route of routes) {
          await p.evaluate(route => (location.hash = route), route);
          await expect(p.locator('h1:visible')).toHaveText(titles[locale][routes.indexOf(route)]);
          await p.locator('[data-page-frame]:visible [data-collection]').first().waitFor();
          await p.locator(`${first[route]}:visible`).first().waitFor();
          await settle(p);
          const measurement = await p.evaluate(first => {
            const box = e => e.getBoundingClientRect();
            const frame = Array.from(document.querySelectorAll('[data-page-frame]')).find(e => e.checkVisibility());
            const toolbar = frame.querySelector('[data-collection-toolbar]');
            const collection = toolbar.parentElement.querySelector('[data-collection]') ?? frame.querySelector('[data-collection]');
            const header = Array.from(document.querySelectorAll('[data-page-header]')).find(e => e.checkVisibility());
            // Rules and DNS toolbars now follow their section headings.
            const headings = [...frame.querySelectorAll('h2')].filter(e => box(e).top < box(toolbar).top);
            const heading = headings.at(-1)?.parentElement;
            const search = toolbar.querySelector('.astryx-text-input');
            const row = frame.querySelector(first);
            return {
              headerGap: box(frame.querySelector('h2')?.parentElement ?? toolbar).top - box(header).bottom,
              headerGapToken: parseFloat(getComputedStyle(frame).getPropertyValue('--spacing-6')),
              headingToolbarGap: heading ? box(toolbar).top - box(heading).bottom : null,
              collectionGap: box(collection).top - box(toolbar).bottom,
              searchX: search ? box(search).x : null,
              rowX: box(row).x,
              overflow: document.documentElement.scrollWidth - innerWidth
            };
          }, first[route]);
          expect(measurement.headerGap).toBeCloseTo(measurement.headerGapToken, 0);
          if (measurement.headingToolbarGap !== null) expect(measurement.headingToolbarGap).toBeCloseTo(16, 0);
          expect(measurement.collectionGap).toBeCloseTo(16, 0);
          if (measurement.searchX !== null) expect(Math.abs(measurement.searchX - measurement.rowX)).toBeLessThanOrEqual(1);
          expect(measurement.overflow).toBeLessThanOrEqual(0);
          rhythm.push(measurement);
          await controls(p);
          await expect(p.locator('[data-theme-toggle]:visible')).toHaveCount(1);
          await expect(p.locator('[data-language-menu]:visible')).toHaveCount(1);
          await searchInsets(p);
          await ruleLabels(p);
          await footer(p, width, locale);
          records.push({width, locale, route, ...measurement});
          await screenshot(p, `${route}-${width}-${locale}-light`);
          if (route === 'groups') {
            await p.locator('[data-group-row="auto"] button').click();
            const inspector = p.locator('[data-group-inspector="auto"]:visible');
            await expect(inspector.getByRole('radio').first()).toBeVisible();
            await expect(inspector.locator('button[aria-label="' + (locale === 'en' ? 'Sort' : '排序') + '"]')).toHaveText(
              locale === 'en' ? 'By latency' : '按延迟'
            );
            await controls(p);
            await searchInsets(p);
            await screenshot(p, `inspector-${width}-${locale}-light`);
            if (width === 390) await p.keyboard.press('Escape');
          }
          if (route === 'nodes') {
            await p.locator('tbody input[type="checkbox"]').first().check();
            const toolbar = p.locator('[data-page-frame]:visible [data-collection-toolbar]').first();
            await expect(toolbar).toContainText(locale === 'en' ? '1 selected' : '已选择 1 项');
            await controls(p);
            expect(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
            const a = await toolbar.boundingBox(),
              b = await p.locator('[data-page-frame]:visible [data-collection]').first().boundingBox();
            expect(b.y - a.y - a.height).toBeCloseTo(16, 0);
            await screenshot(p, `nodes-selected-${width}-${locale}-light`);
            await toolbar.getByRole('button', {name: locale === 'en' ? 'Clear selection' : '清除选择', exact: true}).click();
            await expect(p.locator('tbody input[type="checkbox"]').first()).not.toBeChecked();
          }
          if (route === 'dns') {
            const advanced = p.getByRole('button', {name: locale === 'en' ? 'Advanced' : '高级', exact: true});
            await advanced.click();
            const response = p.locator('[data-rule-list="response"]');
            await expect(response.locator('[data-rule-index]').first()).toBeVisible();
            await expect(response.locator('table')).toHaveCount(0);
            await controls(p);
            await searchInsets(p);
            await ruleLabels(p);
            await screenshot(p, `dns-response-${width}-${locale}-light`);
            await advanced.click();
            await p.locator('.lite-page-content:visible').evaluate(e => (e.scrollTop = 0));
          }
          if (route === 'subscriptions') {
            if (width === 390) await subscriptionActionInset(p);
            const sub = p.locator('[data-provider-id="harbor"]');
            const trigger = sub.locator('.astryx-collapsible-trigger');
            await trigger.click();
            await expect(trigger).toHaveAttribute('aria-expanded', 'true');
            await expect(sub.locator('[data-subscription-nodes] > li').first()).toBeVisible();
            await expect(sub.locator('table')).toHaveCount(0);
            await controls(p);
            await searchInsets(p);
            await screenshot(p, `subscription-expanded-${width}-${locale}-light`);
            await trigger.click();
          }
        }
        for (const key of ['headerGap', 'collectionGap'])
          expect(Math.max(...rhythm.map(r => r[key])) - Math.min(...rhythm.map(r => r[key]))).toBeLessThanOrEqual(1);
        if (width === 1440) {
          await p.getByRole('button', {name: locale === 'en' ? 'Collapse sidebar' : '折叠侧边栏', exact: true}).click();
          await settle(p);
          const nav = p.locator('nav').first();
          await expect(nav.locator('[data-theme-toggle]')).toBeVisible();
          await expect(nav.locator('[data-language-menu]')).toBeVisible();
          const centres = await nav
            .locator('a,button')
            .evaluateAll(items => items.filter(e => e.checkVisibility()).map(e => e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2));
          expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(0.5);
          await screenshot(p, `collapsed-rail-${locale}-light`);
        }
        if (width === 1440 && locale === 'zh-CN') {
          await p.getByRole('button', {name: '展开侧边栏', exact: true}).click();
          await p.locator('[data-theme-toggle]:visible').click();
          for (const route of routes) {
            await p.evaluate(route => (location.hash = route), route);
            await expect(p.locator('h1:visible')).toHaveText(titles[locale][routes.indexOf(route)]);
            await p.locator('[data-page-frame]:visible [data-collection]').first().waitFor();
            await p.locator(`${first[route]}:visible`).first().waitFor();
            await settle(p);
            await screenshot(p, `${route}-1440-zh-CN-dark`);
          }
        }
        console.log(`PASS layout rhythm, md controls, single-line labels, insets and footer: ${width} ${locale}`);
        await p.close();
      }
    await groupWidths(browser);
    for (const viewport of [
      {width: 768, height: 900},
      {width: 844, height: 390},
      {width: 390, height: 844}
    ])
      for (const locale of ['en', 'zh-CN', 'zh-TW']) {
        const theme = viewport.width === 844 ? 'light' : 'dark';
        const p = await browser.newPage({viewport, locale, reducedMotion: 'reduce', colorScheme: theme});
        await p.addInitScript(
          ({locale, theme}) => {
            localStorage.setItem('doona-lite.locale', locale);
            localStorage.setItem('doona-lite.theme', theme);
          },
          {locale, theme}
        );
        await p.goto(base);
        await waitForDemo(p);
        await p.locator('[data-group-row]').first().waitFor();
        await p.evaluate(() => (location.hash = 'nodes'));
        await p.locator('[data-node-id]').first().waitFor();
        await settle(p);
        await nodeLayout(p, viewport.width === 390, {en: 'Latency', 'zh-CN': '延迟', 'zh-TW': '延遲'}[locale]);
        if (viewport.width === 390) {
          await p.locator('tbody input[type="checkbox"]').first().check();
          await nodeLayout(p, true, {en: 'Latency', 'zh-CN': '延迟', 'zh-TW': '延遲'}[locale]);
        }
        await nodeMenu(p);
        await screenshot(p, `nodes-layout-${viewport.width}-${locale}-${theme}`);
        console.log(`PASS node columns, subscription help, compact labels and menu: ${viewport.width} ${locale}`);
        await p.close();
      }
    const p = await browser.newPage({viewport: {width: 390, height: 900}, locale: 'zh-TW', reducedMotion: 'reduce', colorScheme: 'dark'});
    await p.addInitScript(() => {
      localStorage.setItem('doona-lite.locale', 'zh-TW');
      localStorage.setItem('doona-lite.theme', 'dark');
    });
    await p.goto(base);
    await waitForDemo(p);
    await p.locator('[data-group-row]').first().waitFor();
    await p.evaluate(() => (location.hash = 'subscriptions'));
    await p.locator('[data-provider-id]:visible').first().waitFor();
    await settle(p);
    await searchInsets(p);
    await subscriptionActionInset(p);
    await p.setViewportSize({width: 768, height: 900});
    await p.locator('h1:visible').focus();
    await p.keyboard.press('Control+k');
    const palette = p.locator('dialog[open]').filter({has: p.getByRole('combobox')});
    const list = palette.getByRole('listbox');
    await expect(list.getByRole('option').last()).toBeAttached();
    await settle(p);
    const bounds = await list.evaluate(list => {
      const footer = list.closest('.astryx-layout').querySelector('.astryx-layout-footer');
      return {
        bottom: list.getBoundingClientRect().bottom,
        footer: footer.getBoundingClientRect().top,
        overflow: getComputedStyle(list).overflowY,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      };
    });
    expect(bounds.overflow).toBe('auto');
    expect(bounds.scrollHeight).toBeGreaterThan(bounds.clientHeight);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.footer);
    await list.evaluate(list => (list.scrollTop = list.scrollHeight));
    const last = await list.getByRole('option').last().boundingBox();
    const viewport = await list.boundingBox();
    expect(last.y).toBeGreaterThanOrEqual(viewport.y);
    expect(last.y + last.height).toBeLessThanOrEqual(viewport.y + viewport.height);
    console.log('PASS subscription action inset and scrollable palette above footer: zh-TW dark');
    await p.close();
  } finally {
    await browser.close();
  }
  if (process.env.LITE_RHYTHM_OUTPUT) fs.writeFileSync(process.env.LITE_RHYTHM_OUTPUT, JSON.stringify(records, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
