import {Login} from './Login';
import {consumeProfileReadError} from '../api/profiles';
import {Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState, type ContextType} from 'react';
import {I18nProvider, RouterProvider, Link as RLink, Separator, Menu, MenuSection, Header} from 'react-aria-components';
import Search from '../ui/icons/Search';
import Refresh from '../ui/icons/Refresh';
import Translate from '../ui/icons/Translate';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import logo from '../logo.svg';
import {About} from './About';
import GitHub from '../ui/icons/GitHub';
import {LangContext, LANGS, LOCALE, useT, type Lang, type Translator} from '../i18n';
import {Button, ChoiceMenu, ModalDialog, Toasts, LabeledSelect, ErrorMessage, Loading, Empty, toast, useSlider, withCrossfade, Link} from '../ui/ui';
import {MenuButton, MenuChoice, pickMenuKey} from '../ui/ui';
import Color from '../ui/icons/Color';
import type {PageProps} from '../features/types';
import {DraftContext, parseHash, useRoute} from './route';
import {features, warmPage} from './registry';
import {SearchDialog} from './search/SearchDialog';
import {SettingsContext} from '../features/settings/context';
import {readSettings, writeSetting, type PaletteId, type Scheme, type Settings, type Wordmark} from '../features/settings/settings';
import {Shortcuts} from './Shortcuts';
import {AboutContext, useShell, type ShellModel} from './useShell';
import {translate} from '../i18n';

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
const paletteIds = new Set(palettes(translate.bind(null, 'en')).flatMap(section => section.items.map(item => item.id)));
function readAppearance() {
  const settings = readSettings();
  return {...settings, palette: paletteIds.has(settings.palette) ? settings.palette : ('rose-pine/moon' as PaletteId)};
}

// Stamp the stored appearance on <html> before the first paint; done in a layout effect alone, the first frame would
// paint the default palette and every control would then transition to the stored one (a visible flash on load).
export function stampAppearance() {
  const {scheme, palette, wordmark} = readAppearance();
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
  const pickScheme = useCallback((next: Scheme) => {
    withCrossfade(() => setScheme(next));
    writeSetting('scheme', next);
  }, []);
  // Following the system flips to the opposite of the system; an override goes back to system.
  const toggle = useCallback(() => pickScheme(scheme === 'system' ? (sysDark ? 'light' : 'dark') : 'system'), [pickScheme, scheme, sysDark]);
  const pickPalette = useCallback((p: PaletteId) => {
    withCrossfade(() => setPalette(p));
    writeSetting('palette', p);
  }, []);
  const pickWordmark = useCallback((w: Wordmark) => {
    setWordmark(w);
    writeSetting('wordmark', w);
  }, []);
  return useMemo(
    () => ({scheme, dark, toggle, pickScheme, palette, pickPalette, wordmark, pickWordmark}),
    [scheme, dark, toggle, pickScheme, palette, pickPalette, wordmark, pickWordmark]
  );
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
  const [settings] = useState(readAppearance);
  const [lang, setLang] = useState<Lang>(settings.lang);
  useLayoutEffect(() => {
    document.documentElement.lang = LOCALE[lang];
  }, [lang]);
  const ap = useAppearance(settings);
  const {route, query, go, setDirty, revision, pending, discard, cancel} = useRoute(settings.api);
  // A hash no page owns goes to the first page instead of showing it under the wrong address.
  useEffect(() => {
    if (!features.some(feature => feature.path === route)) go('activity');
  }, [route, go]);
  const [searchOpen, setSearchOpen] = useState(false);
  const pickLang = useCallback((l: Lang) => {
    setLang(l);
    writeSetting('lang', l);
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
  // Warm the font subsets the menus need (accented Latin such as "Rosé", "Frappé") in the face the language
  // renders with; otherwise the first open fetches one and the whole page relays out.
  useEffect(() => {
    const sample = 'Rosé Pine Frappé Macchiato Mocha Catppuccin Nord Glass';
    document.fonts?.load(`14px '${lang === 'zh-CN' ? 'Noto Sans SC' : 'Noto Sans TC'}'`, sample).catch(() => {});
  }, [lang]);
  return (
    <LangContext.Provider value={lang}>
      <I18nProvider locale={LOCALE[lang]}>
        <RouterProvider navigate={navigate}>
          <DraftContext.Provider value={draft}>
            <ShellFrame settings={settings} lang={lang} pickLang={pickLang} ap={ap} route={route} query={query} go={go} openSearch={openSearch} mac={mac} />
          </DraftContext.Provider>
          <DiscardDialog isOpen={pending !== null} discard={discard} cancel={cancel} />
          {searchOpen && <SearchDialog onClose={closeSearch} go={go} />}
          <ToastHost />
        </RouterProvider>
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
    if (consumeProfileReadError()) toast('negative', t('settings.profilesCorrupt'));
    try {
      if (sessionStorage.getItem('doona-saved')) {
        sessionStorage.removeItem('doona-saved');
        toast('positive', t('ui.saved'));
      }
    } catch {}
  }, [t]);
  return <Toasts />;
}

type FrameProps = {
  settings: Settings;
  lang: Lang;
  pickLang: (l: Lang) => void;
  ap: NonNullable<ContextType<typeof SettingsContext>>['ap'];
  route: string;
  query: string;
  go: PageProps['go'];
  openSearch: () => void;
  mac: boolean;
};
function ShellFrame(props: FrameProps) {
  const view = useShell(props.settings, props.route);
  return (
    <AboutContext.Provider value={view.about}>
      <Frame {...props} view={view} />
      <Shortcuts go={props.go} openSearch={props.openSearch} mac={props.mac} entries={view.shortcuts} paths={view.shortcutPaths} />
    </AboutContext.Provider>
  );
}
function Frame({lang, pickLang, ap, route, query, go, openSearch, mac, view}: FrameProps & {view: ShellModel}) {
  const t = useT();
  const paletteSections = useMemo(() => palettes(t), [t]);
  const settingsValue = useMemo(() => ({lang, pickLang, ap, paletteSections}), [lang, pickLang, ap, paletteSections]);
  const [navRef, navPos] = useSlider(route, '[aria-current="page"]');
  const Page = view.current.Page;
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <About
          onHonk={view.honk}
          trigger={
            <Button className="rp-brand" label={t('about.title')}>
              <img src={logo} alt="" />
              <span className="rp-brand-text">
                <span>{view.wordmark}</span>
                <span className="rp-brand-version">{view.about.versionText}</span>
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
          <Button quiet icon label={t('refresh')} isPending={view.spinning} onPress={view.refresh}>
            <Refresh />
          </Button>
          <Separator orientation="vertical" className="rp-vrule" />
          <ChoiceMenu
            quiet
            chevron={false}
            label={t('lang')}
            value={lang}
            onChange={k => pickLang(k as Lang)}
            items={LANGS.map(([k, l]) => ({id: k, label: l}))}
          >
            <Translate />
          </ChoiceMenu>
          <MenuButton
            quiet
            chevron={false}
            label={t('palette')}
            content={
              <Menu aria-label={t('palette')}>
                {paletteSections.map(section => (
                  <MenuSection
                    key={section.title}
                    id={section.title}
                    selectionMode="single"
                    selectedKeys={[ap.palette]}
                    onSelectionChange={pickMenuKey(k => ap.pickPalette(k as PaletteId))}
                  >
                    <Header className="rp-sec-h">{section.title}</Header>
                    {section.items.map(item => (
                      <MenuChoice key={item.id} item={item} />
                    ))}
                  </MenuSection>
                ))}
                <MenuSection
                  id="wordmark"
                  selectionMode="single"
                  selectedKeys={[ap.wordmark]}
                  onSelectionChange={pickMenuKey(k => ap.pickWordmark(k as Wordmark))}
                >
                  <Header className="rp-sec-h">{t('wordmark')}</Header>
                  <MenuChoice item={{id: 'gradient', label: t('wordmark.gradient')}} />
                  <MenuChoice item={{id: 'plain', label: t('wordmark.plain')}} />
                </MenuSection>
              </Menu>
            }
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
      <nav className="rp-side" ref={navRef} aria-busy={view.busy || undefined}>
        {navPos && <span className="rp-nav-slider" style={{translate: `0 ${navPos.y}px`, height: navPos.h}} />}
        {view.groups.map(group => (
          <div key={group.id} data-group={group.id}>
            <div className="rp-group">{group.label}</div>
            {group.items.map(item => (
              <RLink
                key={item.id}
                className="rp-nav"
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                data-unavailable={item.unavailable ? '' : undefined}
                aria-description={item.description}
                onHoverStart={() => warmPage(item.id)}
                onFocus={() => warmPage(item.id)}
              >
                <item.Icon />
                {item.label}
              </RLink>
            ))}
          </div>
        ))}
        <div className="rp-side-grow" />
        <Link appearance="version" href={view.engine.href} external label={t('github')}>
          <GitHub />
          {view.engine.text}
        </Link>
      </nav>
      <main className="rp-main">
        <div className="rp-content">
          <div className="rp-head">
            <div className="rp-title">
              <h1 className="rp-h1">{view.current.title}</h1>
              {view.current.hint && <span className="rp-hint">{view.current.hint}</span>}
            </div>
            <div className="rp-mobile-nav">
              <LabeledSelect label={t('page')} value={route} onChange={k => go(k)} items={view.choices} bare />
            </div>
          </div>
          <ErrorMessage error={view.error} />
          <SettingsContext.Provider value={settingsValue}>
            {view.content.kind === 'login' ? (
              <Login backend={view.content.backend} rejected={view.content.rejected} />
            ) : view.content.kind === 'loading' ? (
              <Loading />
            ) : view.content.kind === 'unavailable' ? (
              <Empty>
                {t('shell.notOffered')}
                <Button onPress={() => go('activity')}>{t('shell.toActivity')}</Button>
              </Empty>
            ) : (
              <Suspense key={view.current.id} fallback={<Loading />}>
                <Page go={go} query={query} />
              </Suspense>
            )}
          </SettingsContext.Provider>
        </div>
      </main>
    </div>
  );
}
