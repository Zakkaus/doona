const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./preview.cjs');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}, locale: 'zh-TW', colorScheme: 'light'});
    await page.goto(base);
    await page.locator('[data-group-row]').first().waitFor();
    await page.getByRole('link', {name: '節點', exact: true}).click();
    const name = page.locator('[data-node-id]').filter({hasText: /^hk-01$/});
    const row = page.locator('tr').filter({has: name});
    const dialog = page.getByRole('dialog', {name: '編輯節點', exact: true});
    await expect(name).toBeVisible();
    await expect(page.locator('tr:focus')).toHaveCount(0);
    await expect(page.locator('tr:focus-visible')).toHaveCount(0);

    // No keyboard events: returning from a mouse-operated dialog must keep focus, not a ring.
    for (const useField of [false, true]) {
      await name.click();
      await expect(dialog).toBeVisible();
      if (useField) await dialog.getByRole('textbox', {name: '名稱', exact: true}).click();
      await dialog.getByRole('button', {name: '取消', exact: true}).click();
      await expect(dialog).toBeHidden();
      await expect(row).toBeFocused();
      await expect(page.locator('tr:focus-visible')).toHaveCount(0);
    }
    console.log('PASS mouse-only dialog return retains row focus without :focus-visible (including clicking a text field)');

    // Tab into the selection checkbox and back to the row, then edit and dismiss using only keys.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(row).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(row).toBeFocused();
    await expect(page.locator('tr:focus-visible')).toHaveCount(1);
    await page.mouse.move(0, 0);

    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({colorScheme});
      for (const width of [1280, 390, 1920]) {
        await page.setViewportSize({width, height: 800});
        // Wait for responsive columns and the pinning ResizeObserver before measuring.
        await expect.poll(() => row.locator('td').count()).toBe(width < 768 ? 3 : 7);
        await page.waitForTimeout(350);
        const geometry = await row.evaluate(row => {
          const first = row.cells[0];
          const last = row.cells[row.cells.length - 1];
          const box = first.getBoundingClientRect();
          const end = last.getBoundingClientRect();
          const layer = getComputedStyle(first, '::after');
          const cell = getComputedStyle(first);
          const top = box.top + parseFloat(cell.borderTopWidth) + parseFloat(layer.top);
          const left = box.left + parseFloat(cell.borderLeftWidth) + parseFloat(layer.left);
          return {
            display: layer.display,
            outlineStyle: layer.outlineStyle,
            outlineWidth: parseFloat(layer.outlineWidth),
            outlineColor: layer.outlineColor,
            outlineOffset: parseFloat(layer.outlineOffset),
            left,
            right: left + parseFloat(layer.width),
            top,
            bottom: top + parseFloat(layer.height),
            rowTop: box.top,
            rowBottom: box.bottom,
            rowLeft: box.left,
            rowRight: end.right,
            anchorZ: Number(cell.zIndex),
            stickyZ: [...row.cells]
              .slice(1)
              .filter(cell => getComputedStyle(cell).position === 'sticky')
              .map(cell => Number(getComputedStyle(cell).zIndex))
          };
        });
        expect(geometry.display).not.toBe('none');
        expect(geometry.outlineStyle).toBe('solid');
        expect(geometry.outlineWidth).toBe(2);
        expect(geometry.outlineOffset).toBe(-geometry.outlineWidth);
        for (const edge of ['Left', 'Right', 'Top', 'Bottom']) {
          expect(Math.abs(geometry[edge.toLowerCase()] - geometry[`row${edge}`])).toBeLessThanOrEqual(1);
        }
        for (const z of geometry.stickyZ) expect(geometry.anchorZ).toBeGreaterThan(z);

        // Temporarily hit-test the normally pointer-transparent ring, including both sticky ends.
        const hitStyle = await page.addStyleTag({content: 'tr:focus-visible > td:first-child::after { pointer-events: auto; }'});
        const hits = await row.evaluate((row, box) => {
          const points = [
            [box.left + 1, (box.top + box.bottom) / 2],
            [box.right - 1, (box.top + box.bottom) / 2],
            [(box.left + box.right) / 2, box.top + 1],
            [(box.left + box.right) / 2, box.bottom - 1]
          ];
          return points.map(([x, y]) => document.elementFromPoint(x, y) === row.cells[0]);
        }, geometry);
        await hitStyle.evaluate(style => style.remove());
        expect(hits).toEqual([true, true, true, true]);
        if (width === 1280 && process.env.LITE_SHOTS) {
          fs.mkdirSync(process.env.LITE_SHOTS, {recursive: true});
          await page.screenshot({path: path.join(process.env.LITE_SHOTS, `nodes-keyboard-${colorScheme}.png`)});
        }
        console.log(`PASS ${colorScheme} ${width}x800: keyboard ring encloses the visible row above sticky cells`, JSON.stringify(geometry));
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
