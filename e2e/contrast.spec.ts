import {expect, test} from './fixtures';
import type {PaletteId} from '../src/shell/preferences';

// Every palette, both schemes: the accent, the status tones and secondary text as text on the base, the surface, a
// tile (the overlay) and a selected tile, text on an accent fill, and body text.
// Palettes keep their official values, so a failing pair is fixed by the token a use reads, never by a new colour.
// Glass is left out: its surfaces are translucent over a gradient.
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
const roles = ['accent', 'negative', 'notice', 'positive', 'info'];
// Page-level secondary text reads the palette's own subtle, a known exception on the base and surface as in the a11y
// spec: [base, surface] floors for each look under 4.5:1 on either, 4.5 on a side that passes. Tiles read
// --rp-subtle-text and get no exception.
const subtleFloors: Record<string, [number, number]> = {
  'rose-pine/main light': [4, 4.2],
  'rose-pine/moon light': [4, 4.2],
  'rose-pine/moon dark': [4.5, 4.4],
  'catppuccin/frappe light': [4, 4.3],
  'catppuccin/macchiato light': [4, 4.3],
  'catppuccin/mocha light': [4, 4.3],
  'kary/kary light': [3.4, 3.6],
  'antd/antd light': [3.3, 3.3],
  'antd/antd dark': [4.4, 4.5],
  'arco/arco light': [3.2, 3.2]
};
// Kary's light body text is 4.1:1 on its base, 4.3:1 on its surface, 3.9:1 on a tile and 3.4:1 on a selected tile;
// its tones sit at the same level and its accent, info and tile secondary text fall back to that body text. Its
// page-level subtle keeps the lower floors above.
const karyFloors: Record<string, number> = {base: 4, surface: 4.2, tile: 3.8, 'selected tile': 3.4};
const known = new Map<string, number>([
  ...Object.entries(karyFloors).flatMap(([ground, floor]) =>
    ['text', 'subtle text', ...roles.map(role => `${role} text`)].map(name => [`kary/kary light ${name} on ${ground}`, floor] as const)
  ),
  ...Object.entries(subtleFloors).flatMap(([look, [base, surface]]) => [
    [`${look} subtle text on base`, base] as const,
    [`${look} subtle text on surface`, surface] as const
  ])
]);
test('accent, status and secondary text and accent fills reach 4.5:1 in every palette, and tones keep their colour where they read', async ({page}) => {
  await page.goto('/#/activity');
  const failures: string[] = [];
  for (const [palette, checked] of Object.entries(palettes)) {
    if (!checked) continue;
    for (const scheme of ['light', 'dark']) {
      const {ratios, faded} = await page.evaluate(
        ([palette, scheme, roles]) => {
          const [family, flavour] = palette.split('/');
          Object.assign(document.documentElement.dataset, {family, flavour, scheme});
          const rgb = (value: string) => {
            const probe = document.createElement('i');
            probe.style.color = value;
            document.body.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            const channels = color.match(/[\d.]+/g)!.map(Number);
            // A mixed colour computes to color(srgb r g b / a) with channels from 0 to 1.
            return color.startsWith('color(') ? channels.map((channel, i) => (i < 3 ? channel * 255 : channel)) : channels;
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
          const pair = (fg: string, bg: string, page: string) => {
            const below = over(rgb(bg), rgb(page));
            const [hi, lo] = [luminance(over(rgb(fg), below)), luminance(below)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
          };
          const ratio = (fg: string, bg: string) => pair(fg, bg, 'var(--rp-base)');
          // Tiles sit in cards on the base and in panels on the surface; a translucent tile takes the lower of the two.
          const tile = (fg: string, bg: string) => Math.min(pair(fg, bg, 'var(--rp-base)'), pair(fg, bg, 'var(--rp-surface)'));
          const on = (fg: string) => ({
            base: ratio(fg, 'var(--rp-base)'),
            surface: ratio(fg, 'var(--rp-surface)'),
            tile: tile(fg, 'var(--rp-overlay)'),
            'selected tile': tile(fg, 'var(--rp-selected)')
          });
          const each = (name: string, values: Record<string, number>) =>
            Object.entries(values).map(([ground, value]): [string, number] => [`${name} on ${ground}`, value]);
          // An undefined token falls back to transparent, which measures 1:1 instead of passing as inherited text.
          const subtle = on('var(--rp-subtle-text, transparent)');
          // A tone that reads on the base and the surface keeps its colour as page text, whatever tiles need.
          const faded = roles.filter(
            role =>
              Math.min(ratio(`var(--rp-${role})`, 'var(--rp-base)'), ratio(`var(--rp-${role})`, 'var(--rp-surface)')) >= 4.5 &&
              rgb(`var(--rp-${role}-text)`).join() !== rgb(`var(--rp-${role})`).join()
          );
          const ratios = {
            // Page text reads the role's token, judged on the base and the surface; tiles read the role's tile token.
            ...Object.fromEntries(
              roles.flatMap(role => {
                const page = on(`var(--rp-${role}-text, transparent)`);
                const tiled = on(`var(--rp-${role}-tile-text, transparent)`);
                return each(`${role} text`, {base: page.base, surface: page.surface, tile: tiled.tile, 'selected tile': tiled['selected tile']});
              })
            ),
            // Page-level secondary text reads the palette's subtle; tiles read --rp-subtle-text.
            'subtle text on base': ratio('var(--rp-subtle)', 'var(--rp-base)'),
            'subtle text on surface': ratio('var(--rp-subtle)', 'var(--rp-surface)'),
            'subtle text on tile': subtle.tile,
            'subtle text on selected tile': subtle['selected tile'],
            'text on accent': ratio('var(--rp-on-accent)', 'var(--rp-accent)'),
            ...Object.fromEntries(each('text', on('var(--rp-text)')))
          };
          return {ratios, faded};
        },
        [palette, scheme, roles] as const
      );
      for (const role of faded) failures.push(`${palette} ${scheme} ${role} text lost its colour on the page`);
      for (const [pair, value] of Object.entries(ratios))
        if (value < (known.get(`${palette} ${scheme} ${pair}`) ?? 4.5)) failures.push(`${palette} ${scheme} ${pair}: ${value.toFixed(2)}`);
    }
  }
  expect(failures).toEqual([]);
});

// Table rows, card dividers, hover and empty cells draw --rp-line and --rp-fill on a card. Several palettes set
// highlight low to their own surface, where both vanished; the palette points them at a step that shows instead.
test('lines and quiet fills show on a card in every palette', async ({page}) => {
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
            const color = getComputedStyle(probe).color;
            probe.remove();
            const channels = color.match(/[\d.]+/g)!.map(Number);
            return color.startsWith('color(') ? channels.map((channel, i) => (i < 3 ? channel * 255 : channel)) : channels;
          };
          const luminance = (value: number[], below: number[]) => {
            const [r, g, b, a = 1] = value;
            const [lr, lg, lb] = [r, g, b]
              .map((channel, i) => (channel * a + below[i] * (1 - a)) / 255)
              .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
            return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
          };
          const surface = rgb('var(--rp-surface)');
          const on = (token: string) => {
            const [hi, lo] = [luminance(rgb(`var(${token})`), surface), luminance(surface, surface)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
          };
          return {line: on('--rp-line'), fill: on('--rp-fill')};
        },
        [palette, scheme] as const
      );
      for (const [token, value] of Object.entries(ratios)) if (value < 1.1) failures.push(`${palette} ${scheme} ${token} on surface: ${value.toFixed(3)}`);
    }
  }
  expect(failures).toEqual([]);
});
