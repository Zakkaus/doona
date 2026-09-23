import {expect, test} from './fixtures';
import type {PaletteId} from '../src/features/settings/settings';

// Every palette, both schemes: the accent as text on the base and surface, text on an accent fill, and body text.
// Palettes keep their official values, so a failing pair is fixed by the token a use reads, never by a new colour.
// Glass is left out: its surfaces are translucent over a gradient. Kary's own light text on its light base is 4.1:1.
const palettes = {
  'rose-pine/main': 1,
  'rose-pine/moon': 1,
  'catppuccin/frappe': 1,
  'catppuccin/macchiato': 1,
  'catppuccin/mocha': 1,
  'nord/nord': 1,
  'kary/kary': 1,
  'glass/glass': 0,
  'antd/antd': 1,
  'arco/arco': 1,
  'semi/semi': 1
} satisfies Record<PaletteId, 0 | 1>;
// Kary's light accent text falls back to that same body text.
const known = new Set(['kary/kary light text on base', 'kary/kary light accent text on base', 'kary/kary light accent text on surface']);

test('accent text and accent fills reach 4.5:1 in every palette', async ({page}) => {
  await page.goto('/#/activity');
  const failures: string[] = [];
  for (const [palette, checked] of Object.entries(palettes)) {
    if (!checked) continue;
    for (const scheme of ['light', 'dark']) {
      const ratios = await page.evaluate(
        ([palette, scheme]) => {
          const [family, flavour] = palette.split('/');
          Object.assign(document.documentElement.dataset, {family, flavour, scheme});
          const rgb = (value: string) => {
            const probe = document.createElement('i');
            probe.style.color = value;
            document.body.append(probe);
            const channels = getComputedStyle(probe)
              .color.match(/[\d.]+/g)!
              .map(Number);
            probe.remove();
            return channels;
          };
          // A translucent colour is drawn over what lies beneath it: the background over the base, the text over that.
          const over = (value: number[], below: number[]) => {
            const [r, g, b, a = 1] = value;
            return [r, g, b].map((channel, i) => channel * a + below[i] * (1 - a));
          };
          const luminance = (channels: number[]) => {
            const [r, g, b] = channels.map(c => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const base = rgb('var(--rp-base)');
          const ratio = (fg: string, bg: string) => {
            const below = over(rgb(bg), base);
            const [hi, lo] = [luminance(over(rgb(fg), below)), luminance(below)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
          };
          return {
            'accent text on base': ratio('var(--rp-accent-text)', 'var(--rp-base)'),
            'accent text on surface': ratio('var(--rp-accent-text)', 'var(--rp-surface)'),
            'text on accent': ratio('var(--rp-on-accent)', 'var(--rp-accent)'),
            'text on base': ratio('var(--rp-text)', 'var(--rp-base)')
          };
        },
        [palette, scheme]
      );
      for (const [pair, value] of Object.entries(ratios))
        if (value < 4.5 && !known.has(`${palette} ${scheme} ${pair}`)) failures.push(`${palette} ${scheme} ${pair}: ${value.toFixed(2)}`);
    }
  }
  expect(failures).toEqual([]);
});
