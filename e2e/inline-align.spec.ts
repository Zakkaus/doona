import {expect, loadingState, routes, test} from './fixtures';

// A help button and a status light sit inside a line of text; each must share the text's vertical centre rather
// than hang off its baseline. Text is measured by its glyph box, so the check is about what the eye sees.
for (const width of [1440, 390]) {
  test.describe(`${width}px`, () => {
    test.use({viewport: {width, height: width === 390 ? 844 : 900}, storage: {'doona-lang': 'zh-TW', 'doona-scheme': 'dark'}});

    test('the overview meta row keeps its help button and status light level with the text', async ({page}) => {
      await page.goto('/#/overview');
      const help = page.locator('.rp-kv.row .k .rp-help').first();
      await expect(help).toBeVisible();
      await expect(page.locator('.rp-kv.row ~ * .rp-light')).toBeVisible();

      const centres = await page.evaluate(() => {
        const middle = (rect: DOMRect) => rect.top + rect.height / 2;
        const glyphs = (element: Element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return middle(range.getBoundingClientRect());
        };
        const label = document.querySelector('.rp-kv.row .k .rp-help-row')!;
        const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE)!;
        const labelRange = document.createRange();
        labelRange.selectNodeContents(text);
        const light = document.querySelector('.rp-kv.row ~ * .rp-light')!;
        // The reload status follows the time of the last reload, the last value in the row.
        const values = document.querySelectorAll('.rp-kv.row .v');
        const time = values[values.length - 1].getBoundingClientRect();
        const lightBox = light.getBoundingClientRect();
        return {
          // On a phone the row wraps and the light may start a line of its own, with no time beside it to match.
          shared: lightBox.top < time.bottom && time.top < lightBox.bottom,
          label: middle(labelRange.getBoundingClientRect()),
          help: middle(label.querySelector('.rp-help')!.getBoundingClientRect()),
          time: glyphs(values[values.length - 1]),
          // The dot is centred in the light's box, so the box's centre is the dot's.
          dot: middle(light.getBoundingClientRect()),
          status: glyphs(light.querySelector('span')!)
        };
      });
      expect(Math.abs(centres.help - centres.label), 'help button against its label').toBeLessThanOrEqual(1);
      expect(Math.abs(centres.dot - centres.status), 'light dot against its text').toBeLessThanOrEqual(1);
      if (centres.shared) {
        expect(Math.abs(centres.status - centres.time), 'light text against the time').toBeLessThanOrEqual(1);
        expect(Math.abs(centres.dot - centres.time), 'light dot against the time').toBeLessThanOrEqual(1);
      }
    });

    // The shared alignment rules (CONTRIBUTING, UI components): one title line, one card inset for charts, one
    // sparkline column, one icon gap and one type per role on every page, and on Activity one set of column lines.
    test('every page keeps the shared title line, chart inset, sparkline column, icon gaps and type roles', async ({page}) => {
      test.setTimeout(120000);
      const seen = new Map<string, Set<string>>();
      for (const route of routes) {
        await page.goto(`/#/${route}`);
        await expect(page.locator('.rp-content h1')).toBeVisible();
        await expect(page.locator(`.rp-content ${loadingState}`)).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        const found = await page.evaluate(() => {
          const box = (element: Element) => element.getBoundingClientRect();
          const shown = (element: Element) => box(element).width > 0 && element.checkVisibility();
          const style = (element: Element) => getComputedStyle(element);
          const inset = (card: Element) => {
            const css = style(card);
            return {
              start: box(card).left + parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth),
              end: box(card).right - parseFloat(css.paddingRight) - parseFloat(css.borderRightWidth),
              top: box(card).top + parseFloat(css.paddingTop) + parseFloat(css.borderTopWidth)
            };
          };
          const problems: string[] = [];
          const control = parseFloat(style(document.documentElement).getPropertyValue('--rp-control'));
          // A header title starts at the card's top inset and is one control high.
          const titles = [
            ...document.querySelectorAll(
              '.rp-content .rp-card > .rp-h3:first-child, .rp-content .rp-card > :is(.rp-help-row, .rp-row):first-child > .rp-h3, .rp-content .rp-card > :is(.rp-help-row, .rp-row):first-child > :is(.rp-help-row, .rp-cluster, .rp-truncate):first-child > .rp-h3'
            )
          ].filter(shown);
          for (const title of titles) {
            const card = title.closest('.rp-card')!;
            const line = box(title);
            if (Math.abs(line.top - inset(card).top) > 1 || Math.abs(line.height - control) > 1)
              problems.push(`title ${title.textContent} at ${line.top - box(card).top}, ${line.height} high`);
          }
          // A chart's plot starts at its card's text inset: its grid and its fill and line start at one x and end at one x,
          // its time labels stay between the two, and its value labels end at the plot's box.
          for (const grid of [...document.querySelectorAll('.rp-content .rp-area-grid line:first-child')].filter(shown)) {
            const card = grid.closest('.rp-card')!;
            const svg = grid.closest('svg')!;
            if (Math.abs(box(grid).left - inset(card).start) > 1) problems.push(`chart plot at ${box(grid).left - box(card).left}`);
            const data = [...svg.querySelectorAll(':scope > :is(path, g:not([class])) path:not([stroke-dasharray])')].filter(shown).map(box);
            const labels = [...svg.querySelectorAll('.rp-area-x-ticks text')].map(box);
            const values = [...svg.querySelectorAll('.rp-area-y-ticks text')].map(box);
            const edges = (name: string, rects: DOMRect[]) => {
              if (!rects.length) return;
              const start = Math.min(...rects.map(rect => rect.left));
              const end = Math.max(...rects.map(rect => rect.right));
              if (Math.abs(start - box(grid).left) > 1 || Math.abs(end - box(grid).right) > 1)
                problems.push(
                  `chart ${name} ${start - box(card).left}..${end - box(card).left} against the grid ${box(grid).left - box(card).left}..${box(grid).right - box(card).left}`
                );
            };
            edges('data', data);
            for (const label of labels)
              if (label.left < box(grid).left - 1 || label.right > box(grid).right + 1)
                problems.push(`chart time label ${label.left - box(grid).left}..${label.right - box(grid).right} outside the grid`);
            for (const value of values)
              if (Math.abs(value.right - box(svg).right) > 1) problems.push(`chart value label ends ${box(svg).right - value.right} before the plot box`);
            // The value gutter is its widest label and one 8px gap, and a chart's figures beside it end at the end inset.
            if (values.length && Math.min(...values.map(value => value.left)) - box(grid).right < 7.5)
              problems.push(`chart value labels ${Math.min(...values.map(value => value.left)) - box(grid).right}px from the plot`);
            const facts = card.querySelector('.rp-chart-stats > .rp-facts');
            if (facts && shown(facts) && Math.abs(box(facts).right - inset(card).end) > 1)
              problems.push(`chart figures end ${inset(card).end - box(facts).right} before the end inset`);
            // An area chart's legend lines start at the text inset, one entry on its own line when it wraps.
            const parts = [...card.querySelectorAll('.rp-legend .it')].filter(shown).map(box);
            const lines = new Map<number, number>();
            for (const part of parts) lines.set(Math.round(part.top), Math.min(lines.get(Math.round(part.top)) ?? Infinity, part.left));
            for (const start of lines.values()) if (Math.abs(start - inset(card).start) > 1) problems.push(`legend line at ${start - inset(card).start}`);
          }
          // Cards of a page column (a grid, or sibling grids) land on the lines of one grid of equal tracks: rows of equal
          // cards set the track count, and a row of unequal spans takes its lines.
          const columns = new Map<Element, DOMRect[]>();
          for (const card of [...document.querySelectorAll('.rp-content .rp-card')].filter(shown)) {
            if (card.parentElement!.closest('.rp-card')) continue;
            const grid = card.closest('.rp-dash-section, .rp-g3, .rp-g21');
            if (grid) columns.set(grid.parentElement!, [...(columns.get(grid.parentElement!) ?? []), box(card)]);
          }
          for (const cards of columns.values()) {
            const byTop = new Map<number, DOMRect[]>();
            for (const card of cards) byTop.set(Math.round(card.top), [...(byTop.get(Math.round(card.top)) ?? []), card]);
            const rows = [...byTop.values()].filter(row => row.length > 1).map(row => row.sort((a, b) => a.left - b.left));
            if (!rows.length) continue;
            const start = Math.min(...cards.map(card => card.left));
            const end = Math.max(...cards.map(card => card.right));
            const gap = rows[0][1].left - rows[0][0].right;
            const equal = rows.filter(
              row => row.every(card => Math.abs(card.width - row[0].width) <= 1) && Math.abs(row[0].left - start) <= 1 && Math.abs(row.at(-1)!.right - end) <= 1
            );
            const tracks = equal.reduce((n, row) => (n % row.length === 0 ? n : row.length % n === 0 ? row.length : n * row.length), 1);
            if (tracks === 1 || tracks > 12) continue;
            const pitch = (end - start + gap) / tracks;
            const onLine = (x: number) => Math.abs((x - start) / pitch - Math.round((x - start) / pitch)) * pitch <= 1;
            for (const row of rows.filter(row => !equal.includes(row)))
              for (const card of row)
                if (!onLine(card.left) || !onLine(card.right + gap)) problems.push(`card ${card.left}..${card.right} off the ${tracks} column lines`);
          }
          // Lists in a card start at its text inset, and so does a table's first column, its frame hanging into the padding.
          for (const card of [...document.querySelectorAll('.rp-content .rp-card')].filter(shown)) {
            const start = inset(card).start;
            // A row that starts a line of its list: a two-column list's second column does not.
            for (const row of [...card.querySelectorAll(':is(.rp-capabilities, .rp-limits, .rp-kv) > :is(.rp-capability, li, .k)')].filter(shown)) {
              const first = Math.min(...[...row.parentElement!.children].map(item => box(item).left));
              if (row.closest('.rp-card') === card && Math.abs(box(row).left - first) <= 1 && Math.abs(box(row).left - start) > 1)
                problems.push(`list row ${row.textContent} at ${box(row).left - start}`);
            }
            for (const frame of [...card.querySelectorAll('.rp-table')].filter(shown)) {
              const cell = frame.querySelector('[role=columnheader], [role=rowheader], [role=gridcell]');
              const text =
                cell && [...cell.querySelectorAll('*'), cell].find(element => element.firstChild?.nodeType === Node.TEXT_NODE && element.textContent!.trim());
              if (text) {
                const range = document.createRange();
                range.selectNodeContents(text.firstChild!);
                const offset = range.getBoundingClientRect().left - start;
                if (Math.abs(offset) > 1) problems.push(`table text at ${offset}`);
              }
            }
            // A quiet action ending a line of the card ends its text at the end inset.
            const css = style(card);
            const right = box(card).right - parseFloat(css.paddingRight) - parseFloat(css.borderRightWidth);
            for (const action of [
              ...card.querySelectorAll(
                ':is(.rp-row, .rp-row > .rp-cluster:last-child, .rp-limit, .rp-control-tail) > :is(.rp-link:not([data-layout=inline]), .rp-btn.quiet:not(.icon)):last-child'
              )
            ].filter(shown)) {
              if (action.closest('.rp-card') !== card || right - box(action).right > 24) continue;
              const range = document.createRange();
              range.selectNodeContents(action);
              const text = [...range.getClientRects()].filter(rect => rect.width > 0);
              const end = Math.max(...text.map(rect => rect.right));
              if (text.length && Math.abs(end - right) > 1) problems.push(`action ${action.textContent} ends ${right - end} before the inset`);
            }
          }
          // Sparklines of tiles of one width in one row share their start and width.
          const sparks = [...document.querySelectorAll('.rp-content .rp-tile-body > .rp-spark')].filter(shown).map(spark => {
            const card = box(spark.closest('.rp-card')!);
            return {row: `${Math.round(card.top)} ${Math.round(card.width)}`, start: box(spark).left - card.left, width: box(spark).width};
          });
          for (const spark of sparks)
            for (const other of sparks.filter(other => other.row === spark.row))
              if (Math.abs(spark.start - other.start) > 1 || Math.abs(spark.width - other.width) > 1)
                problems.push(`sparkline at ${spark.start}+${spark.width} beside ${other.start}+${other.width}`);
          // One gap from an icon's box to its label, per role.
          const gaps: Record<string, number[]> = {};
          for (const [role, selector] of [
            ['tile caption', '.rp-tile-head > svg + .rp-tile-caption'],
            ['control label', '.rp-qlabel > svg + .rp-truncate'],
            ['navigation', '.rp-side .rp-nav > svg']
          ])
            // A caption a narrow tile hides visually is out of the line, as is a label whose narrow card hides its icon.
            gaps[role] = [...document.querySelectorAll(selector)]
              .filter(
                element =>
                  shown(element) && style(element).position !== 'absolute' && shown(element.tagName === 'svg' ? element : element.previousElementSibling!)
              )
              .map(element => {
                const icon = element.tagName === 'svg' ? element : element.previousElementSibling!;
                const range = document.createRange();
                range.selectNodeContents(element.tagName === 'svg' ? element.parentElement! : element);
                const text = [...range.getClientRects()].find(rect => rect.left >= box(icon).right - 0.5) ?? box(element);
                return text.left - box(icon).right;
              });
          for (const [role, list] of Object.entries(gaps))
            if (list.length && Math.max(...list) - Math.min(...list) > 1) problems.push(`${role} gaps ${list.join(',')}`);
          // The side navigation keeps one pitch from a header to its first link and between links.
          const rows = [...document.querySelectorAll('.rp-side .rp-disclosure')].filter(shown).flatMap(group => {
            const items = [...group.querySelectorAll(':is(.rp-disclosure-trigger, .rp-nav)')].filter(shown).map(item => box(item).top);
            return items.slice(1).map((top, i) => top - items[i]);
          });
          if (rows.length && Math.max(...rows) - Math.min(...rows) > 1) problems.push(`navigation pitch ${[...new Set(rows)].join(',')}`);
          // The type of each text role.
          const roles: Record<string, string[]> = {};
          for (const [role, selector] of [
            ['card title', '.rp-content .rp-card .rp-h3:not(.rp-code)'],
            ['tile caption', '.rp-content .rp-tile-caption'],
            ['stat value', '.rp-content .rp-tile-val .rp-big'],
            // The current page's link is bolder, as S2's selected item.
            ['navigation', '.rp-side .rp-nav:not([aria-current])'],
            ['page title', '.rp-content h1']
          ])
            roles[role] = [...document.querySelectorAll(selector)].filter(shown).map(element => `${style(element).fontSize} ${style(element).fontWeight}`);
          return {problems, roles};
        });
        expect(found.problems, route).toEqual([]);
        for (const [role, types] of Object.entries(found.roles)) for (const type of types) seen.set(role, (seen.get(role) ?? new Set()).add(type));
      }
      for (const [role, types] of seen) expect([...types], role).toHaveLength(1);
    });

    // Activity's cards set their text in four roles (CONTRIBUTING, Type roles): the card title, a primary value, a label
    // and meta, at weights 400 and 700 only; a value tile's figure keeps the stat value's size. Controls keep S2's own.
    test('the Activity cards keep to four type roles in either language', async ({page}) => {
      for (const lang of ['zh-TW', 'en']) {
        await page.addInitScript(value => localStorage.setItem('doona-lang', value), lang);
        await page.goto('/#/activity');
        await expect(page.locator("[data-profile='details'] > .rp-dashboard-cell")).toHaveCount(3);
        await expect(page.locator(`.rp-content ${loadingState}`)).toHaveCount(0);
        await expect(page.locator('[data-instance="history"] .rp-area-y-ticks text').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const found = await page.evaluate(() => {
          const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
          const roles = new Map([
            [`${token('--rp-text-lg')} 700`, 'title'],
            [`${token('--rp-text-md')} 700`, 'value'],
            [`${token('--rp-text-md')} 400`, 'label'],
            [`${token('--rp-text-xs')} 400`, 'meta']
          ]);
          const stat = `${token('--rp-text-3xl')} 700`;
          const off: string[] = [];
          const seen = new Set<string>();
          for (const cell of document.querySelectorAll('.rp-content .rp-dashboard-cell')) {
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const element = node.parentElement!;
              if (!node.textContent!.trim() || !element.checkVisibility()) continue;
              if (element.closest('button, [role=button], [role=radio], [role=tab], .rp-btn, .rp-segpick, [role=tooltip]')) continue;
              const style = getComputedStyle(element);
              const type = `${style.fontSize} ${style.fontWeight}`;
              const role = roles.get(type) ?? (type === stat && element.closest('.rp-tile-val') ? 'stat' : undefined);
              if (role) seen.add(role);
              else off.push(`${type} ${node.textContent!.trim().slice(0, 24)}`);
            }
          }
          return {off, seen: [...seen].sort()};
        });
        expect(found.off, lang).toEqual([]);
        expect(found.seen, lang).toEqual(['label', 'meta', 'stat', 'title', 'value']);
      }
    });

    test('the Activity rows share their column lines', async ({page}) => {
      await page.goto('/#/activity');
      await expect(page.locator("[data-profile='details'] > .rp-dashboard-cell")).toHaveCount(3);
      await page.evaluate(() => document.fonts.ready);
      const rows = await page.evaluate(() =>
        ['quick', 'details'].map(profile =>
          [...document.querySelectorAll(`[data-profile='${profile}'] > .rp-dashboard-cell`)].map(cell => {
            const box = cell.getBoundingClientRect();
            return [box.left, box.right];
          })
        )
      );
      // On a phone every card fills the one column; from 1100px the control cards take the details row's thirds.
      rows[0].forEach(([left, right], i) => {
        const [otherLeft, otherRight] = width === 390 ? rows[1][0] : rows[1][i];
        expect(Math.abs(left - otherLeft), `card ${i} start`).toBeLessThanOrEqual(1);
        expect(Math.abs(right - otherRight), `card ${i} end`).toBeLessThanOrEqual(1);
      });
      // The control cards keep one line each, and the words of their labels and of the status light share a title line
      // across the row.
      const lines = await page.locator("[data-profile='quick'] .rp-control-card > .rp-row").evaluateAll(rows =>
        rows.map(row => {
          const middles = [...row.children].map(part => part.getBoundingClientRect()).map(box => box.top + box.height / 2);
          const words = row.querySelector(":scope:not([data-step='icon']) > .rp-qlabel > .rp-truncate, :scope > .rp-light > span");
          const range = document.createRange();
          if (words) range.selectNodeContents(words);
          return {
            spread: Math.max(...middles) - Math.min(...middles),
            card: row.parentElement!.getBoundingClientRect().top,
            title: words && range.getBoundingClientRect().top
          };
        })
      );
      for (const line of lines) {
        expect(line.spread, 'one line').toBeLessThanOrEqual(1);
        for (const other of lines)
          if (Math.abs(other.card - line.card) <= 1 && line.title !== null && other.title !== null)
            expect(Math.abs(other.title - line.title), 'title line').toBeLessThanOrEqual(1);
      }
    });
  });
}
