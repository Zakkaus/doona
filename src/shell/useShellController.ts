import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ContextType} from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- react-aria is pinned; the effect that calls it says why
import {runAfterTransition} from 'react-aria/private/utils/runAfterTransition';
import {consumeProfileReadError} from '../api/profiles';
import {storageKeys} from '../api/storage';
import {readSettings, writeSetting} from './preferences';
import type {SettingsContext} from './preferences';
import {LANGS, LOCALE, loadLanguage, pageDirection, translate, useT, type Lang} from '../i18n';
import {toast} from '../ui/Feedback';
import {isMac, useSlider} from '../ui/hooks';
import {warmAllPages} from './registry';
import {searchDialog} from './search/load';
import {parseHash, useRoute} from './route';
import {useAppearance} from './useAppearance';
import {appearanceMenu, paletteMenu} from './view';

// `initial` is the language startup actually loaded, which may be the fallback rather than the saved one.
export function useShellController(initial: Lang) {
  const [settings] = useState(readSettings);
  const [lang, setLang] = useState<Lang>(initial);
  const shown = useRef(initial);
  const wanted = useRef(initial);
  const ap = useAppearance(settings);
  const {mirrored} = ap;
  useLayoutEffect(() => {
    const d = document.documentElement;
    d.lang = LOCALE[lang];
    d.dir = pageDirection(LOCALE[lang], mirrored);
    d.toggleAttribute('data-mirror', mirrored);
  }, [lang, mirrored]);
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
    (href: string, options?: {replace?: boolean}) => {
      const next = parseHash(href);
      go(next.route, next.query, options);
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
  // react-aria tracks elements with a running CSS transition until transitionend or transitioncancel, which a removed
  // element never receives, so a page left mid-transition would keep its detached tree. runAfterTransition drops
  // disconnected entries first. It is a private export: react-aria is pinned, so recheck this path on upgrade.
  useEffect(() => {
    runAfterTransition(() => {});
  }, [route]);
  return {settings, lang, ap, route, query, go, pending, discard, cancel, searchOpen, pickLang, openSearch, closeSearch, navigate, draft, mac: isMac};
}

export function useShellFrame(lang: Lang, pickLang: (lang: Lang) => void, ap: NonNullable<ContextType<typeof SettingsContext>>['ap'], route: string) {
  const t = useT();
  const paletteSections = useMemo(() => paletteMenu(t), [t]);
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
      if (sessionStorage.getItem(storageKeys.saved)) {
        sessionStorage.removeItem(storageKeys.saved);
        toast('positive', t('ui.saved'));
      }
    } catch {
      /* Storage can be unavailable. */
    }
  }, [t]);
}
