import {useCallback, useLayoutEffect, useMemo, useState} from 'react';
import {
  updateFlagOverride,
  writeSetting,
  type DateFormat,
  type PaletteId,
  type Scheme,
  type Settings,
  type TimeFormat,
  type ToastPlacement,
  type Wordmark
} from './preferences';
import {useMediaQuery, withCrossfade} from '../ui/hooks';
import type {RoutePath} from './routes';
import {setDateFormat, setTimeFormat} from '../i18n/format';

// Glass's scroll edge shows while the root carries data-scrolled. The attribute changes only when the page leaves or
// returns to the top, so the passive listener costs one comparison per scroll event.
let watchingScroll = false;
function watchScroll() {
  if (watchingScroll) return;
  watchingScroll = true;
  const update = () => document.documentElement.toggleAttribute('data-scrolled', scrollY > 0);
  addEventListener('scroll', update, {passive: true});
  update();
}

export function applyAppearance(dark: boolean, palette: PaletteId, wordmark: Wordmark, blur: number) {
  const [family, flavour] = palette.split('/');
  const d = document.documentElement.dataset;
  d.scheme = dark ? 'dark' : 'light';
  d.family = family;
  d.flavour = flavour;
  d.wordmark = wordmark;
  document.documentElement.style.setProperty('--rp-blur-scale', String(blur));
  // Glass's lens filters load with the palette, once; the stylesheet uses them while the root carries data-lens.
  if (palette === 'glass/glass' && d.lens === undefined)
    void import('../ui/lens').then(({installLens}) => {
      if (installLens()) d.lens = '';
    });
  if (palette === 'glass/glass') watchScroll();
}
export function useAppearance(stored: Settings) {
  const [scheme, setScheme] = useState<Scheme>(stored.scheme);
  const [palette, setPalette] = useState<PaletteId>(stored.palette);
  const [blur, setBlur] = useState(stored.blur);
  const [wordmark, setWordmark] = useState<Wordmark>(stored.wordmark);
  const [mirrored, setMirrored] = useState(stored.mirrored);
  const [flagOverrides, setFlagOverrides] = useState(stored.flagOverrides);
  const [countryFlags, setCountryFlags] = useState(stored.countryFlags);
  const [sparklines, setSparklines] = useState(stored.sparklines);
  const [toastPlacement, setToastPlacement] = useState<ToastPlacement>(stored.toastPlacement);
  const [startPage, setStartPage] = useState<RoutePath>(stored.startPage);
  const [dateFormat, setDateFormatState] = useState<DateFormat>(stored.dateFormat);
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(stored.timeFormat);
  const sysDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = scheme === 'dark' || (scheme === 'system' && sysDark);
  useLayoutEffect(() => applyAppearance(dark, palette, wordmark, blur), [dark, palette, wordmark, blur]);
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
  const pickBlur = useCallback((next: number) => {
    setBlur(next);
    writeSetting('blur', String(next));
  }, []);
  const pickWordmark = useCallback((next: Wordmark) => {
    setWordmark(next);
    writeSetting('wordmark', next);
  }, []);
  const pickMirrored = useCallback((next: boolean) => {
    setMirrored(next);
    writeSetting('mirror', next ? 'on' : 'off');
  }, []);
  const pickCountryFlags = useCallback((next: boolean) => {
    setCountryFlags(next);
    writeSetting('countryFlags', next ? 'on' : 'off');
  }, []);
  const pickSparklines = useCallback((next: boolean) => {
    setSparklines(next);
    writeSetting('sparklines', next ? 'on' : 'off');
  }, []);
  const pickFlag = useCallback(
    (name: string, value: string) => {
      const next = updateFlagOverride(flagOverrides, name, value);
      setFlagOverrides(next);
      writeSetting('flagOverrides', JSON.stringify(next));
    },
    [flagOverrides]
  );
  const pickToastPlacement = useCallback((next: ToastPlacement) => {
    setToastPlacement(next);
    writeSetting('toastPlacement', next);
  }, []);
  const pickStartPage = useCallback((next: RoutePath) => {
    setStartPage(next);
    writeSetting('startPage', next);
  }, []);
  // The formatters read the order and the clock each time they run: the settings page shows times only in tooltips,
  // which format on hover, and a page opened after the change formats with the new ones.
  const pickDateFormat = useCallback((next: DateFormat) => {
    setDateFormat(next);
    setDateFormatState(next);
    writeSetting('dateFormat', next);
  }, []);
  const pickTimeFormat = useCallback((next: TimeFormat) => {
    setTimeFormat(next);
    setTimeFormatState(next);
    writeSetting('timeFormat', next);
  }, []);
  return useMemo(
    () => ({
      scheme,
      dark,
      toggle,
      pickScheme,
      palette,
      pickPalette,
      blur,
      pickBlur,
      wordmark,
      pickWordmark,
      mirrored,
      pickMirrored,
      flagOverrides,
      pickFlag,
      countryFlags,
      pickCountryFlags,
      sparklines,
      pickSparklines,
      toastPlacement,
      pickToastPlacement,
      startPage,
      pickStartPage,
      dateFormat,
      pickDateFormat,
      timeFormat,
      pickTimeFormat
    }),
    [
      scheme,
      dark,
      toggle,
      pickScheme,
      palette,
      pickPalette,
      blur,
      pickBlur,
      wordmark,
      pickWordmark,
      mirrored,
      pickMirrored,
      flagOverrides,
      pickFlag,
      countryFlags,
      pickCountryFlags,
      sparklines,
      pickSparklines,
      toastPlacement,
      pickToastPlacement,
      startPage,
      pickStartPage,
      dateFormat,
      pickDateFormat,
      timeFormat,
      pickTimeFormat
    ]
  );
}
