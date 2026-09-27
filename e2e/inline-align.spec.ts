import {expect, test} from './fixtures';

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
  });
}
