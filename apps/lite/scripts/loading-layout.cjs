const {chromium, expect} = require('@playwright/test');
const base = process.env.LITE_PREVIEW_URL;
if (!base) throw new Error('Set LITE_PREVIEW_URL to the preview server.');
const routes = ['groups', 'subscriptions', 'nodes', 'routing', 'dns'];
async function collectionRows(p) {
  return p.locator('[data-collection][aria-busy]:visible').evaluateAll(collections =>
    collections.map(collection =>
      [...collection.querySelectorAll('li, tr')].slice(0, 30).map(row => {
        const {x, width, height} = row.getBoundingClientRect();
        const trigger = row.querySelector('.lite-disclosure > .astryx-collapsible-trigger');
        const children = trigger ? [...trigger.children, row.querySelector('.lite-disclosure-actions')] : [...row.children];
        return {
          x,
          width,
          height,
          header: !!row.closest('thead'),
          children: children.map(child => {
            const {x, width} = child.getBoundingClientRect();
            return {x, width};
          })
        };
      })
    )
  );
}

function compareChildren(before, after, label) {
  expect(after.length, `${label} child count`).toBe(before.length);
  for (let i = 0; i < before.length; i++) {
    for (const axis of ['x', 'width']) expect(Math.abs(before[i][axis] - after[i][axis]), `${label} child ${i} ${axis}`).toBeLessThanOrEqual(2);
  }
}

async function inspectorRows(p) {
  return p.locator('[data-inspector-placeholder] .astryx-radio-list-item:visible, [data-group-inspector] [data-member-row]:visible').evaluateAll(rows =>
    rows.slice(0, 3).map(row =>
      [...row.children].map(child => {
        const {x, width} = child.getBoundingClientRect();
        return {x, width};
      })
    )
  );
}

async function geometry(p) {
  return p.evaluate(() =>
    [...document.querySelectorAll('[data-page-header], [data-page-frame] [data-collection-toolbar], [data-page-frame] h2, [data-page-frame] [data-mode]')]
      .filter(e => e.checkVisibility())
      .map(e => {
        const {x, y, width, height} = e.getBoundingClientRect();
        return {
          tag: e.hasAttribute('data-page-header') ? 'header' : (e.getAttribute('data-mode') ?? (e.tagName === 'H2' ? e.textContent : 'toolbar')),
          x,
          y,
          width,
          height
        };
      })
  );
}
(async () => {
  const browser = await chromium.launch({args: ['--disable-features=OverlayScrollbar']});
  try {
    for (const width of [1440, 390]) {
      for (const route of routes) {
        const p = await browser.newPage({viewport: {width, height: 900}, locale: 'en', reducedMotion: 'reduce'});
        await p.goto(`${base}?slow=1200`);
        await p.getByRole('button', {name: 'Try the demo', exact: true}).click();
        if (route !== 'groups') {
          await p.locator('[data-group-row]').first().waitFor();
          await p.evaluate(route => {
            location.hash = route;
          }, route);
        }
        const skeleton = p.locator(`[data-loading-shape="${route}"]:visible`).first();
        await skeleton.waitFor();
        if (route === 'groups' && width === 1440) await p.locator('[data-loading-shape="group-inspector"]:visible').waitFor();
        const before = await geometry(p);
        const beforeRows = await collectionRows(p);
        const beforeMembers = await inspectorRows(p);
        if (route === 'groups' && width === 1440) expect(beforeMembers.length).toBeGreaterThan(0);
        if (process.env.LITE_SHOTS && width === 1440 && ['groups', 'subscriptions'].includes(route))
          await p.screenshot({path: `${process.env.LITE_SHOTS}/loading-${route}.png`});
        await p.waitForFunction(() => [...document.querySelectorAll('[data-collection][aria-busy="true"]')].every(e => !e.checkVisibility()));
        await p.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const after = await geometry(p);
        const afterRows = await collectionRows(p);
        const afterMembers = await inspectorRows(p);
        expect(afterMembers.length, `${width} ${route} inspector row count`).toBe(beforeMembers.length);
        for (let i = 0; i < beforeMembers.length; i++) compareChildren(beforeMembers[i], afterMembers[i], `${width} ${route} inspector row ${i}`);
        expect(afterRows.map(rows => rows.length)).toEqual(beforeRows.map(rows => rows.length));
        for (let c = 0; c < beforeRows.length; c++) {
          let checked = 0;
          for (let i = 0; i < beforeRows[c].length; i++) {
            if (!beforeRows[c][i].header && checked++ < 3)
              compareChildren(beforeRows[c][i].children, afterRows[c][i].children, `${width} ${route} collection ${c} row ${i}`);
            for (const axis of ['x', 'width', 'height'])
              expect(Math.abs(beforeRows[c][i][axis] - afterRows[c][i][axis]), `${width} ${route} row ${i} ${axis}`).toBeLessThanOrEqual(1);
          }
        }
        expect(after.map(e => e.tag)).toEqual(before.map(e => e.tag));
        for (let i = 0; i < before.length; i++) {
          for (const axis of ['x', 'y', 'width', 'height'])
            expect(
              Math.abs(before[i][axis] - after[i][axis]),
              `${width} ${route} ${before[i].tag} ${axis}: ${JSON.stringify({before, after})}`
            ).toBeLessThanOrEqual(1);
        }
        console.log(`PASS loading layout ${width} ${route}: ${before.length} header/toolbar/section landmarks`);
        await p.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
