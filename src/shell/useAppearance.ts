import {useCallback, useLayoutEffect, useMemo, useState} from 'react';
import {writeSetting, type PaletteId, type Scheme, type Settings, type ToastPlacement, type Wordmark} from './preferences';
import {useMediaQuery, withCrossfade} from '../ui/hooks';

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
  const [mirrored, setMirrored] = useState(stored.mirrored);
  const [toastPlacement, setToastPlacement] = useState<ToastPlacement>(stored.toastPlacement);
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
  const pickMirrored = useCallback((next: boolean) => {
    setMirrored(next);
    writeSetting('mirror', next ? 'on' : 'off');
  }, []);
  const pickToastPlacement = useCallback((next: ToastPlacement) => {
    setToastPlacement(next);
    writeSetting('toastPlacement', next);
  }, []);
  return useMemo(
    () => ({scheme, dark, toggle, pickScheme, palette, pickPalette, wordmark, pickWordmark, mirrored, pickMirrored, toastPlacement, pickToastPlacement}),
    [scheme, dark, toggle, pickScheme, palette, pickPalette, wordmark, pickWordmark, mirrored, pickMirrored, toastPlacement, pickToastPlacement]
  );
}
