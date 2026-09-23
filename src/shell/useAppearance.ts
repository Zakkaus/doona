import {useCallback, useLayoutEffect, useMemo, useState} from 'react';
import {readSettings, writeSetting, type PaletteId, type Scheme, type Settings, type Wordmark} from './preferences';
import type {Translator} from '../i18n';
import {useMediaQuery, withCrossfade} from '../ui/hooks';
import {palettes} from './view';

// Only the ids are read, so no catalogue is needed: the labels are the keys themselves.
const idsOnly: Translator = key => key;
const paletteIds = new Set(palettes(idsOnly).flatMap(section => section.items.map(item => item.id)));
export function readAppearance() {
  const settings = readSettings();
  return {...settings, palette: paletteIds.has(settings.palette) ? settings.palette : ('rose-pine/moon' as PaletteId)};
}
export function applyAppearance(dark: boolean, palette: PaletteId, wordmark: Wordmark) {
  const [family, flavour] = palette.split('/');
  const d = document.documentElement.dataset;
  d.scheme = dark ? 'dark' : 'light';
  d.family = family;
  d.flavour = flavour;
  d.wordmark = wordmark;
}
export function useAppearance(stored: Settings) {
  const [scheme, setScheme] = useState<Scheme>(stored.scheme);
  const [palette, setPalette] = useState<PaletteId>(stored.palette);
  const [wordmark, setWordmark] = useState<Wordmark>(stored.wordmark);
  const sysDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = scheme === 'dark' || (scheme === 'system' && sysDark);
  useLayoutEffect(() => applyAppearance(dark, palette, wordmark), [dark, palette, wordmark]);
  const pickScheme = useCallback((next: Scheme) => {
    withCrossfade(() => setScheme(next));
    writeSetting('scheme', next);
  }, []);
  // A system preference toggles to its opposite; an override toggles back to system.
  const toggle = useCallback(() => pickScheme(scheme === 'system' ? (sysDark ? 'light' : 'dark') : 'system'), [pickScheme, scheme, sysDark]);
  const pickPalette = useCallback((next: PaletteId) => {
    withCrossfade(() => setPalette(next));
    writeSetting('palette', next);
  }, []);
  const pickWordmark = useCallback((next: Wordmark) => {
    setWordmark(next);
    writeSetting('wordmark', next);
  }, []);
  return useMemo(
    () => ({scheme, dark, toggle, pickScheme, palette, pickPalette, wordmark, pickWordmark}),
    [scheme, dark, toggle, pickScheme, palette, pickPalette, wordmark, pickWordmark]
  );
}
