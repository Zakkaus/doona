import {useSyncExternalStore} from 'react';

const VARS = [
  'base',
  'surface',
  'overlay',
  'muted',
  'subtle',
  'text',
  'on-text',
  'love',
  'gold',
  'rose',
  'pine',
  'foam',
  'iris',
  'hl-low',
  'hl-med',
  'hl-high',
  'accent',
  'positive',
  'negative',
  'notice',
  'info',
  'line'
] as const;
export type Palette = Record<(typeof VARS)[number], string> & {cat: string[]};
function read(): Palette {
  const cs = getComputedStyle(document.documentElement);
  return {
    ...Object.fromEntries(VARS.map(v => [v, cs.getPropertyValue('--rp-' + v).trim()])),
    cat: [1, 2, 3, 4, 5, 6, 7, 8].map(i => cs.getPropertyValue('--rp-c' + i).trim())
  } as Palette;
}
let palette: {key: string; value: Palette} | undefined;
function getPalette() {
  const {family, flavour, scheme} = document.documentElement.dataset;
  const key = `${family}/${flavour}/${scheme}`;
  if (palette?.key !== key) palette = {key, value: read()};
  return palette.value;
}
function subscribePalette(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, {attributes: true, attributeFilter: ['data-family', 'data-flavour', 'data-scheme']});
  return () => mo.disconnect();
}
export function usePalette() {
  return useSyncExternalStore(subscribePalette, getPalette);
}
