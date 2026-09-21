import {useCallback, useEffect, useLayoutEffect, useMemo, useState, type ContextType} from 'react';
import {consumeProfileReadError} from '../api/profiles';
import {writeSetting} from '../features/settings/settings';
import type {SettingsContext} from '../features/settings/context';
import {LOCALE, useT, type Lang} from '../i18n';
import {toast} from '../ui/Feedback';
import {useSlider} from '../ui/hooks';
import {features, warmAllPages} from './registry';
import {parseHash, useRoute} from './route';
import {readAppearance, useAppearance} from './useAppearance';
import {appearanceMenu, palettes} from './view';

export function useShellController() {
  const [settings] = useState(readAppearance);
  const [lang, setLang] = useState<Lang>(settings.lang);
  useLayoutEffect(() => {
    document.documentElement.lang = LOCALE[lang];
  }, [lang]);
  const ap = useAppearance(settings);
  const {route, query, go, setDirty, revision, pending, discard, cancel} = useRoute(settings.api);
  useEffect(() => {
    if (!features.some(feature => feature.path === route)) go('activity');
  }, [route, go]);
  const [searchOpen, setSearchOpen] = useState(false);
  const pickLang = useCallback((next: Lang) => {
    setLang(next);
    writeSetting('lang', next);
  }, []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const navigate = useCallback(
    (href: string) => {
      const next = parseHash(href);
      go(next.route, next.query);
    },
    [go]
  );
  const draft = useMemo(() => ({setDirty, revision}), [setDirty, revision]);
  const mac = navigator.platform.startsWith('Mac');
  // Warm accented menu glyphs to avoid a font swap when opening a menu.
  useEffect(() => {
    const sample = 'Rosé Pine Frappé Macchiato Mocha Catppuccin Nord Glass';
    document.fonts?.load(`14px '${lang === 'zh-CN' ? 'Noto Sans SC' : 'Noto Sans TC'}'`, sample).catch(() => {});
  }, [lang]);
  useEffect(warmAllPages, []);
  return {settings, lang, ap, route, query, go, pending, discard, cancel, searchOpen, pickLang, openSearch, closeSearch, navigate, draft, mac};
}

export function useShellFrame(lang: Lang, pickLang: (lang: Lang) => void, ap: NonNullable<ContextType<typeof SettingsContext>>['ap'], route: string) {
  const t = useT();
  const paletteSections = useMemo(() => palettes(t), [t]);
  const settingsValue = useMemo(() => ({lang, pickLang, ap, paletteSections}), [lang, pickLang, ap, paletteSections]);
  const menu = useMemo(() => appearanceMenu(t, ap.scheme, ap.dark), [t, ap.scheme, ap.dark]);
  const [navRef, navPos] = useSlider(route, '[aria-current="page"]');
  return {paletteSections, settingsValue, menu, navRef, navStyle: navPos ? {translate: `0 ${navPos.y}px`, height: navPos.h} : undefined};
}

export function useStartupToasts() {
  const t = useT();
  useEffect(() => {
    if (consumeProfileReadError()) toast('negative', t('settings.profilesCorrupt'));
    try {
      if (sessionStorage.getItem('doona-saved')) {
        sessionStorage.removeItem('doona-saved');
        toast('positive', t('ui.saved'));
      }
    } catch {}
  }, [t]);
}
