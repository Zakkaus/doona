import {Login} from './Login';
import {ApiError} from '../api/error';
import {Suspense, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {I18nProvider, Link as RLink, Separator} from 'react-aria-components';
import Search from '../ui/icons/Search';
import Refresh from '../ui/icons/Refresh';
import Translate from '../ui/icons/Translate';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import logo from '../logo.svg';
import {About, engineLinks} from './About';
import GitHub from '../ui/icons/GitHub';
import {LangContext, LANGS, LOCALE, useT, type Lang, type Translator} from '../i18n';
import {Button, MenuButton, ModalDialog, Toasts, LabeledSelect, ErrorMessage, Loading, Empty, errorText, toast, useSlider, withCrossfade, Link} from '../ui/ui';
import Color from '../ui/icons/Color';
import type {PageProps} from '../features/types';
import {DraftContext, useRoute} from './route';
import {refetchAll, useCapabilities, useVersion} from '../api/store';
import {features, navAvailable, warmPage} from './registry';
import {SearchDialog} from './search/SearchDialog';
import {SettingsContext} from '../features/settings/context';
import {readSettings, writeSetting, type PaletteId, type Scheme, type Settings, type Wordmark} from '../features/settings/settings';
import {Shortcuts} from './Shortcuts';

// Each entry pairs the light variant with a dark one; the description names both with their official variant names.
const palettes = (t: Translator): Array<{title: string; items: Array<{id: PaletteId; label: string; desc?: string}>}> => [
  {
    title: t('palette.rosePine'),
    items: [
      {id: 'rose-pine/main', label: t('palette.rosePine'), desc: t('palette.dawnMain')},
      {id: 'rose-pine/moon', label: t('palette.moon'), desc: t('palette.dawnMoon')}
    ]
  },
  {
    title: t('palette.catppuccin'),
    items: [
      {id: 'catppuccin/frappe', label: t('palette.frappe'), desc: t('palette.latteFrappe')},
      {id: 'catppuccin/macchiato', label: t('palette.macchiato'), desc: t('palette.latteMacchiato')},
      {id: 'catppuccin/mocha', label: t('palette.mocha'), desc: t('palette.latteMocha')}
    ]
  },
  {title: t('palette.nord'), items: [{id: 'nord/nord', label: t('palette.nord'), desc: t('palette.nordVariants')}]},
  {title: t('palette.kary'), items: [{id: 'kary/kary', label: t('palette.kary'), desc: t('palette.lightDark')}]},
  {title: t('palette.antd'), items: [{id: 'antd/antd', label: t('palette.antd'), desc: t('palette.defaultDark')}]},
  {
    title: t('palette.bytedance'),
    items: [
      {id: 'arco/arco', label: t('palette.arco'), desc: t('palette.lightDark')},
      {id: 'semi/semi', label: t('palette.semi'), desc: t('palette.lightDark')}
    ]
  },
  {title: t('palette.glassName'), items: [{id: 'glass/glass', label: t('palette.glassName'), desc: t('palette.glass')}]}
];
const navGroups = [...new Set(features.flatMap(feature => (feature.nav ? [feature.nav.group] : [])))];

// Stamp the stored appearance on <html> before the first paint; done in a layout effect alone, the first frame would
// paint the default palette and every control would then transition to the stored one (a visible flash on load).
export function stampAppearance() {
  const {scheme, palette, wordmark} = readSettings();
  const dark = scheme === 'dark' || (scheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [family, flavour] = palette.split('/');
  const d = document.documentElement.dataset;
  d.scheme = dark ? 'dark' : 'light';
  d.family = family;
  d.flavour = flavour;
  d.wordmark = wordmark;
}
function useAppearance(stored: Settings) {
  const [scheme, setScheme] = useState<Scheme>(stored.scheme);
  const [palette, setPalette] = useState<PaletteId>(stored.palette);
  const [wordmark, setWordmark] = useState<Wordmark>(stored.wordmark);
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = scheme === 'dark' || (scheme === 'system' && sysDark);
  useLayoutEffect(() => {
    const [family, flavour] = palette.split('/');
    const d = document.documentElement.dataset;
    d.scheme = dark ? 'dark' : 'light';
    d.family = family;
    d.flavour = flavour;
    d.wordmark = wordmark;
  }, [dark, palette, wordmark]);
  const pickScheme = (next: Scheme) => {
    withCrossfade(() => setScheme(next));
    writeSetting('scheme', next);
  };
  // Following the system flips to the opposite of the system; an override goes back to system.
  const toggle = () => pickScheme(scheme === 'system' ? (sysDark ? 'light' : 'dark') : 'system');
  const pickPalette = (p: PaletteId) => {
    withCrossfade(() => setPalette(p));
    writeSetting('palette', p);
  };
  const pickWordmark = (w: Wordmark) => {
    setWordmark(w);
    writeSetting('wordmark', w);
  };
  return {scheme, dark, toggle, pickScheme, palette, pickPalette, wordmark, pickWordmark};
}

function SchemeIcon({dark}: {dark: boolean}) {
  return (
    <span className="rp-icon-stack" data-dark={dark || undefined}>
      <Contrast className="moon" />
      <Lighten className="sun" />
    </span>
  );
}

export function Shell() {
  // One read of the stored settings at mount; the shell and the frame share it.
  const [settings] = useState(readSettings);
  const [lang, setLang] = useState<Lang>(settings.lang);
  useLayoutEffect(() => {
    document.documentElement.lang = LOCALE[lang];
  }, [lang]);
  const ap = useAppearance(settings);
  const {route, query, go, setDirty, pending, discard, cancel} = useRoute(settings.api);
  // A hash no page owns goes to the first page instead of showing it under the wrong address.
  useEffect(() => {
    if (!features.some(feature => feature.path === route)) go('activity');
  }, [route, go]);
  const [searchOpen, setSearchOpen] = useState(false);
  const pickLang = (l: Lang) => {
    setLang(l);
    writeSetting('lang', l);
  };
  const mac = navigator.platform.startsWith('Mac');
  // Warm the font subsets the menus need (accented Latin such as "Rosé", "Frappé") in the face the language
  // renders with; otherwise the first open fetches one and the whole page relays out.
  useEffect(() => {
    const sample = 'Rosé Pine Frappé Macchiato Mocha Catppuccin Nord Glass';
    document.fonts?.load(`14px '${lang === 'zh-CN' ? 'Noto Sans SC' : 'Noto Sans TC'}'`, sample).catch(() => {});
  }, [lang]);
  return (
    <LangContext.Provider value={lang}>
      <I18nProvider locale={LOCALE[lang]}>
        <DraftContext.Provider value={setDirty}>
          <Frame
            settings={settings}
            lang={lang}
            pickLang={pickLang}
            ap={ap}
            route={route}
            query={query}
            go={go}
            openSearch={() => setSearchOpen(true)}
            mac={mac}
          />
        </DraftContext.Provider>
        <DiscardDialog isOpen={pending !== null} discard={discard} cancel={cancel} />
        {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} go={go} />}
        <Shortcuts go={go} openSearch={() => setSearchOpen(true)} mac={mac} />
        <ToastHost />
      </I18nProvider>
    </LangContext.Provider>
  );
}

function DiscardDialog({isOpen, discard, cancel}: {isOpen: boolean; discard: () => void; cancel: () => void}) {
  const t = useT();
  return (
    <ModalDialog
      title={t('config.discardTitle')}
      narrow
      alert
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) cancel();
      }}
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button negative onPress={discard}>
            {t('config.discard')}
          </Button>
        </>
      )}
    >
      <p>{t('config.discardHelp')}</p>
    </ModalDialog>
  );
}

function ToastHost() {
  const t = useT();
  useEffect(() => {
    try {
      if (sessionStorage.getItem('doona-saved')) {
        sessionStorage.removeItem('doona-saved');
        toast('positive', t('ui.saved'));
      }
    } catch {}
  }, [t]);
  return <Toasts />;
}

function Frame({
  settings,
  lang,
  pickLang,
  ap,
  route,
  query,
  go,
  openSearch,
  mac
}: {
  settings: Settings;
  lang: Lang;
  pickLang: (l: Lang) => void;
  ap: ReturnType<typeof useAppearance>;
  route: string;
  query: string;
  go: PageProps['go'];
  openSearch: () => void;
  mac: boolean;
}) {
  const t = useT();
  const paletteSections = palettes(t);
  const capabilities = useCapabilities();
  const version = useVersion();
  const profile = settings.profiles.find(item => item.id === settings.activeId);
  // Every page stays in the navigation; one the backend does not offer is marked so, and opens to that notice.
  const offered = (path: string) => navAvailable(path, capabilities.data);
  const nav = navGroups.map(group => [group, features.filter(feature => feature.nav?.group === group)] as const);
  const [navRef, navPos] = useSlider(route, '[aria-current="page"]');
  const [spinning, setSpinning] = useState(false);
  const refreshLock = useRef(false);
  const feature = features.find(feature => feature.path === route) ?? features[0];
  const Page = feature.Page;
  // A 401 or 403 from the capability probe means the backend wants a token; the page yields to the login form.
  const needsToken = capabilities.error instanceof ApiError && (capabilities.error.status === 401 || capabilities.error.status === 403);
  const titleKey = feature.nav?.titleKey ?? 'nav.activity';
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <About
          trigger={
            <Button className="rp-brand" label={t('about.title')}>
              <img src={logo} alt="" />
              <span className="rp-brand-text">
                <span>doona</span>
                <span className="rp-brand-version">v{import.meta.env.VITE_DOONA_VERSION}</span>
              </span>
            </Button>
          }
        />
        <div className="rp-search-wrap">
          <Button className="rp-search" onPress={openSearch}>
            <Search />
            <span className="grow">{t('search')}</span>
            <span className="rp-kbd">{mac ? t('shell.macShortcut') : t('shell.shortcut')}</span>
          </Button>
        </div>
        <div className="rp-actions">
          <span className="rp-search-compact">
            <Button quiet icon label={t('search')} onPress={openSearch}>
              <Search />
            </Button>
          </span>
          <Button
            quiet
            icon
            label={t('refresh')}
            isPending={spinning}
            onPress={async () => {
              if (refreshLock.current) return;
              refreshLock.current = true;
              setSpinning(true);
              try {
                const outcomes = await refetchAll();
                const failure = outcomes.find(outcome => !outcome.ok);
                toast(failure ? 'negative' : 'positive', failure ? t('ui.refreshFailed', {error: errorText(failure.error)}) : t('ui.refreshed'));
              } finally {
                refreshLock.current = false;
                setSpinning(false);
              }
            }}
          >
            <Refresh />
          </Button>
          <Separator orientation="vertical" className="rp-vrule" />
          <MenuButton
            quiet
            chevron={false}
            label={t('lang')}
            value={lang}
            onChange={k => pickLang(k as Lang)}
            items={LANGS.map(([k, l]) => ({id: k, label: l}))}
          >
            <Translate />
          </MenuButton>
          <MenuButton
            quiet
            chevron={false}
            label={t('palette')}
            value={ap.palette}
            onChange={k => ap.pickPalette(k as PaletteId)}
            sections={paletteSections}
            extra={{
              title: t('wordmark'),
              value: ap.wordmark,
              onChange: k => ap.pickWordmark(k as Wordmark),
              items: [
                {id: 'gradient', label: t('wordmark.gradient')},
                {id: 'plain', label: t('wordmark.plain')}
              ]
            }}
          >
            <Color />
          </MenuButton>
          <Button
            quiet
            icon
            label={t('shell.theme', {theme: ap.scheme === 'system' ? t('theme.system') : ap.dark ? t('theme.dark') : t('theme.light')})}
            onPress={ap.toggle}
          >
            <SchemeIcon dark={ap.dark} />
          </Button>
        </div>
      </header>
      <nav className="rp-side" ref={navRef} aria-busy={capabilities.data || capabilities.error ? undefined : true}>
        {navPos && <span className="rp-nav-slider" style={{translate: `0 ${navPos.y}px`, height: navPos.h}} />}
        {nav.map(([g, items]) => (
          <div key={g} data-group={g.replace('grp.', '')}>
            <div className="rp-group">{t(g)}</div>
            {items.map(
              ({id, path, nav}) =>
                nav && (
                  <RLink
                    key={id}
                    className="rp-nav"
                    href={'#/' + path}
                    aria-current={route === path ? 'page' : undefined}
                    data-unavailable={offered(path) ? undefined : ''}
                    aria-description={offered(path) ? undefined : t('shell.notOffered')}
                    onHoverStart={() => warmPage(id)}
                    onFocus={() => warmPage(id)}
                  >
                    <nav.Icon />
                    {t(nav.titleKey)}
                  </RLink>
                )
            )}
          </div>
        ))}
        <div className="rp-side-grow" />
        <Link appearance="version" href={engineLinks(version.data?.engine.name).repo} external label={t('github')}>
          <GitHub />
          {version.data ? `${version.data.engine.name} ${version.data.engine.version}` : '—'}
        </Link>
      </nav>
      <main className="rp-main">
        <div className="rp-content">
          <div className="rp-head">
            <div className="rp-title">
              <h1 className="rp-h1">{t(titleKey)}</h1>
              {feature.nav?.hintKey && <span className="rp-hint">{t(feature.nav.hintKey)}</span>}
            </div>
            <div className="rp-mobile-nav">
              <LabeledSelect
                label={t('page')}
                value={route}
                onChange={k => go(k)}
                items={nav
                  .flatMap(([, items]) => items)
                  .flatMap(({path, nav}) =>
                    nav
                      ? [
                          {
                            id: path,
                            label: t(nav.titleKey),
                            desc: offered(path) ? undefined : t('shell.notOfferedShort')
                          }
                        ]
                      : []
                  )}
                bare
              />
            </div>
          </div>
          <ErrorMessage error={capabilities.error ? null : version.error} />
          <SettingsContext.Provider value={{lang, pickLang, ap, paletteSections}}>
            {needsToken && feature.id !== 'settings' ? (
              <Login backend={profile?.name ?? profile?.api ?? ''} rejected={!!profile?.token} />
            ) : !capabilities.data && !capabilities.error && feature.id !== 'settings' ? (
              // Pages mount once the capabilities are known, so none asks for a resource the backend lacks.
              <Loading />
            ) : capabilities.data && !navAvailable(feature.path, capabilities.data) ? (
              <Empty>
                {t('shell.notOffered')}
                <Button onPress={() => go('activity')}>{t('shell.toActivity')}</Button>
              </Empty>
            ) : (
              <Suspense key={feature.id} fallback={<Loading />}>
                <Page go={go} query={query} />
              </Suspense>
            )}
          </SettingsContext.Provider>
        </div>
      </main>
    </div>
  );
}
