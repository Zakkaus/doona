import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ContextType} from 'react';
import {runAfterTransition} from 'react-aria/private/utils/runAfterTransition';
import {consumeProfileReadError} from '../api/profiles';
import {writeSetting} from './preferences';
import type {SettingsContext} from './preferences';
import {LANGS, LOCALE, loadLanguage, translate, useT, type Lang} from '../i18n';
import {toast} from '../ui/Feedback';
import {isMac, useSlider} from '../ui/hooks';
import {warmAllPages} from './registry';
import {searchDialog} from './search/load';
import {parseHash, useRoute} from './route';
import {readAppearance, useAppearance} from './useAppearance';
import {appearanceMenu, palettes} from './view';

// `initial` is the language startup actually loaded, which may be the fallback rather than the saved one.
export function useShellController(initial: Lang) {
  const [settings] = useState(readAppearance);
  const [lang, setLang] = useState<Lang>(initial);
  const shown = useRef(initial);
  const wanted = useRef(initial);
  useLayoutEffect(() => {
    document.documentElement.lang = LOCALE[lang];
  }, [lang]);
  const ap = useAppearance(settings);
  const {route, query, go, setDirty, revision, pending, discard, cancel} = useRoute(settings.api);
  const [searchOpen, setSearchOpen] = useState(false);
  // The page keeps its language until the new catalogue has loaded; of several quick choices, the last one wins.
  const pickLang = useCallback((next: Lang) => {
    wanted.current = next;
    loadLanguage(next).then(
      () => {
        if (wanted.current !== next) return;
        shown.current = next;
        setLang(next);
        writeSetting('lang', next);
      },
      () => {
        if (wanted.current !== next) return;
        wanted.current = shown.current;
        const name = LANGS.find(([id]) => id === next)![1];
        toast('negative', translate(shown.current, 'shell.langUnavailable', {name}));
      }
    );
  }, []);
  // The dialog opens once its chunk is here; a chunk that fails leaves nothing open. Escape, a close or a newer
  // request while the chunk loads drops the request, so the dialog never opens after the user has moved on.
  const searchRequest = useRef(0);
  const openSearch = useCallback(() => {
    const request = ++searchRequest.current;
    searchDialog.preload().then(
      () => {
        if (searchRequest.current === request) setSearchOpen(true);
      },
      () => {
        if (searchRequest.current === request) toast('negative', translate(shown.current, 'shell.searchUnavailable'));
      }
    );
  }, []);
  const closeSearch = useCallback(() => {
    searchRequest.current++;
    setSearchOpen(false);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') searchRequest.current++;
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const navigate = useCallback(
    (href: string) => {
      const next = parseHash(href);
      go(next.route, next.query);
    },
    [go]
  );
  const draft = useMemo(() => ({setDirty, revision}), [setDirty, revision]);
  // Warm accented menu glyphs to avoid a font swap when opening a menu.
  useEffect(() => {
    const sample = 'Rosé Pine Frappé Macchiato Mocha Catppuccin Nord Glass';
    document.fonts?.load(`14px '${lang === 'zh-CN' ? 'Noto Sans SC' : 'Noto Sans TC'}'`, sample).catch(() => {});
  }, [lang]);
  useEffect(warmAllPages, []);
  // react-aria records every element with a running CSS transition and forgets it on transitionend or
  // transitioncancel, neither of which a removed element receives. A page left mid-transition (a tab marker sliding, a
  // colour fading) therefore stayed in that record with its whole detached tree, 0.3 to 0.7 MiB per round of the
  // pages. runAfterTransition drops the disconnected entries before it runs its callback.
  useEffect(() => {
    runAfterTransition(() => {});
  }, [route]);
  return {settings, lang, ap, route, query, go, pending, discard, cancel, searchOpen, pickLang, openSearch, closeSearch, navigate, draft, mac: isMac};
}

export function useShellFrame(lang: Lang, pickLang: (lang: Lang) => void, ap: NonNullable<ContextType<typeof SettingsContext>>['ap'], route: string) {
  const t = useT();
  const paletteSections = useMemo(() => palettes(t), [t]);
  const settingsValue = useMemo(() => ({lang, pickLang, ap, paletteSections}), [lang, pickLang, ap, paletteSections]);
  const menu = useMemo(() => appearanceMenu(t, ap.scheme, ap.dark), [t, ap.scheme, ap.dark]);
  const [navRef, navPos] = useSlider(route, '[aria-current="page"]');
  // One object per measured position: a fresh one on every render would re-render the memoised navigation.
  const navStyle = useMemo(() => (navPos ? {translate: `0 ${navPos.y}px`, height: navPos.h} : undefined), [navPos]);
  return {paletteSections, settingsValue, menu, navRef, navStyle};
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
