// Rosé Pine shell: same frame as the S2 panel (top bar, side nav, rounded main), plain CSS and react-aria-components.
import {Suspense, useEffect, useLayoutEffect, useState, type ReactNode} from 'react';
import {I18nProvider, ListBox, ListBoxItem, ListBoxSection, Header, Link as RLink, Separator} from 'react-aria-components';
import Close from '../ui/icons/Close';
import Search from '../ui/icons/Search';
import Refresh from '../ui/icons/Refresh';
import Translate from '../ui/icons/Translate';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import logo from '../logo.svg';
import GitHub from '../ui/icons/GitHub';
import {LangContext, LANGS, LOCALE, readLang, useT, type Lang, type Translator} from '../i18n';
import {Badge, Button, MenuButton, ModalDialog, TextField, Toasts, LabeledSelect, useSlider, withCrossfade} from '../ui/ui';
import Color from '../ui/icons/Color';
import type {PageProps} from '../features/types';
import {useRoute} from './route';
import {refetchAll, useCapabilities, useConnections, useGroups, useNodes, useVersion} from '../api/store';
import {chainLabel, connectionRows} from '../api/selectors';
import {features, navAvailable} from './registry';
import {SettingsContext} from '../features/settings/Settings';
import {readSettings, type BackendKind, type PaletteId, type Scheme, type Wordmark} from '../features/settings/settings';

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

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
// Stamp the stored appearance on <html> before the first paint; done in a layout effect alone, the first frame would
// paint the default palette and every control would then transition to the stored one (a visible flash on load).
export function stampAppearance() {
  const scheme = (read('doona-scheme') as Scheme) || 'system';
  const paletteRaw = read('doona-palette');
  const palette = paletteRaw && paletteRaw.includes('/') ? paletteRaw : 'rose-pine/moon';
  const dark = scheme === 'dark' || (scheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [family, flavour] = palette.split('/');
  const d = document.documentElement.dataset;
  d.scheme = dark ? 'dark' : 'light';
  d.family = family;
  d.flavour = flavour;
  d.wordmark = (read('doona-wordmark') as Wordmark) || 'gradient';
}
function useAppearance() {
  const [scheme, setScheme] = useState<Scheme>(() => {
    try {
      return (localStorage.getItem('doona-scheme') as Scheme) || 'system';
    } catch {
      return 'system';
    }
  });
  const [palette, setPalette] = useState<PaletteId>(() => {
    try {
      const v = localStorage.getItem('doona-palette') as PaletteId | null;
      return v && v.includes('/') ? v : 'rose-pine/moon';
    } catch {
      return 'rose-pine/moon';
    }
  });
  const [wordmark, setWordmark] = useState<Wordmark>(() => {
    try {
      return (localStorage.getItem('doona-wordmark') as Wordmark) || 'gradient';
    } catch {
      return 'gradient';
    }
  });
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
  // Same rule as the docs site: following the system flips to the opposite of the system; an override goes back to system.
  const toggle = () => {
    const next: Scheme = scheme === 'system' ? (sysDark ? 'light' : 'dark') : 'system';
    withCrossfade(() => setScheme(next));
    try {
      localStorage.setItem('doona-scheme', next);
    } catch {
      /* private mode */
    }
  };
  const pickPalette = (p: PaletteId) => {
    withCrossfade(() => setPalette(p));
    try {
      localStorage.setItem('doona-palette', p);
    } catch {
      /* private mode */
    }
  };
  const pickWordmark = (w: Wordmark) => {
    setWordmark(w);
    try {
      localStorage.setItem('doona-wordmark', w);
    } catch {
      /* private mode */
    }
  };
  return {scheme, dark, toggle, palette, pickPalette, wordmark, pickWordmark};
}

function SchemeIcon({dark}: {dark: boolean}) {
  return (
    <span className="rp-icon-stack" data-dark={dark || undefined}>
      <Contrast className="moon" />
      <Lighten className="sun" />
    </span>
  );
}

function SearchDialog({onClose, go, backend}: {onClose: () => void; go: PageProps['go']; backend: BackendKind}) {
  const t = useT();
  const [q, setQ] = useState('');
  const connections = useConnections();
  const nodes = useNodes();
  const groups = useGroups();
  const capabilities = useCapabilities();
  const needle = q.trim().toLowerCase();
  const limit = needle ? 8 : 5;
  const hits = {
    conns: connectionRows(connections.data)
      .filter(c => [c.domain, c.dst, c.src].some(value => value?.toLowerCase().includes(needle)))
      .slice(0, limit),
    nodes: (nodes.data ?? []).filter(n => n.name.toLowerCase().includes(needle)).slice(0, limit),
    groups: (groups.data ?? []).filter(g => g.name.toLowerCase().includes(needle)).slice(0, limit),
    pages: features
      .filter(feature => feature.nav && navAvailable(feature.path, capabilities.data, backend) && t(feature.nav.titleKey).toLowerCase().includes(needle))
      .slice(0, limit)
  };
  const error = connections.error ?? nodes.error ?? groups.error ?? capabilities.error;
  const pick = (k: string) => {
    if (k.startsWith('conn:')) go('connections', 'id=' + encodeURIComponent(k.slice(5)));
    else if (k.startsWith('page:')) go(k.slice(5));
    else go('policies');
    onClose();
  };
  return (
    <ModalDialog
      title={t('search')}
      hideTitle
      isOpen
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <Button quiet icon className="close" onPress={onClose} label={t('close')}>
        <Close />
      </Button>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog the user just opened */}
      <TextField search large label={t('search')} value={q} onChange={setQ} autoFocus />
      {error && <p role="alert">{error.message}</p>}
      {hits.conns.length + hits.nodes.length + hits.groups.length + hits.pages.length === 0 && <div className="rp-empty">{t('search.none')}</div>}
      <ListBox aria-label={t('search')} className="rp-results" onAction={k => pick(String(k))}>
        {hits.conns.length > 0 && (
          <ListBoxSection id="conns">
            <Header className="rp-section-h">{t('nav.connections')}</Header>
            {hits.conns.map(c => (
              <ListBoxItem key={c.id} id={'conn:' + c.id} className="rp-item plain" textValue={c.domain || c.dst || c.src || c.id}>
                <span>{c.domain || c.dst || c.src || c.id}</span>
                <span className="desc">{chainLabel(c)}</span>
              </ListBoxItem>
            ))}
          </ListBoxSection>
        )}
        {hits.nodes.length > 0 && (
          <ListBoxSection id="nodes">
            <Header className="rp-section-h">{t('search.nodes')}</Header>
            {hits.nodes.map(n => (
              <ListBoxItem key={n.id} id={'node:' + n.id} className="rp-item plain" textValue={n.name}>
                {n.name}
              </ListBoxItem>
            ))}
          </ListBoxSection>
        )}
        {hits.groups.length > 0 && (
          <ListBoxSection id="groups">
            <Header className="rp-section-h">{t('search.groups')}</Header>
            {hits.groups.map(g => (
              <ListBoxItem key={g.id} id={'group:' + g.id} className="rp-item plain" textValue={g.name}>
                {g.name}
              </ListBoxItem>
            ))}
          </ListBoxSection>
        )}
        {hits.pages.length > 0 && (
          <ListBoxSection id="pages">
            <Header className="rp-section-h">{t('search.pages')}</Header>
            {hits.pages.map(page => (
              <ListBoxItem key={page.path} id={'page:' + page.path} className="rp-item plain" textValue={t(page.nav!.titleKey)}>
                {t(page.nav!.titleKey)}
              </ListBoxItem>
            ))}
          </ListBoxSection>
        )}
      </ListBox>
    </ModalDialog>
  );
}

export function Shell() {
  const [lang, setLang] = useState<Lang>(readLang);
  useLayoutEffect(() => {
    document.documentElement.lang = LOCALE[lang];
  }, [lang]);
  const ap = useAppearance();
  const [settings] = useState(readSettings);
  const {route, query, go} = useRoute(settings.api);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);
  const pickLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem('doona-lang', l);
    } catch {
      /* private mode */
    }
  };
  const mac = navigator.platform.startsWith('Mac');
  // Warm the font subsets the menus need (accented Latin such as "Rosé", "Frappé"); otherwise the first open fetches one and the whole page relays out.
  useEffect(() => {
    const sample = 'Rosé Pine Frappé Macchiato Mocha Catppuccin Nord Glass';
    for (const w of [400, 500, 700]) document.fonts?.load(`${w} 14px 'Noto Sans TC'`, sample).catch(() => {});
  }, []);
  return (
    <LangContext.Provider value={lang}>
      <I18nProvider locale={LOCALE[lang]}>
        <Frame
          lang={lang}
          pickLang={pickLang}
          ap={ap}
          backend={settings.backend}
          route={route}
          query={query}
          go={go}
          openSearch={() => setSearchOpen(true)}
          mac={mac}
        />
        {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} go={go} backend={settings.backend} />}
        <ToastHost />
      </I18nProvider>
    </LangContext.Provider>
  );
}

function ToastHost() {
  const t = useT();
  return <Toasts labels={{close: t('close'), showAll: n => t('toast.showAllCount', {n}), collapse: t('toast.collapse'), clearAll: t('toast.clearAll')}} />;
}

function Delayed({children}: {children: ReactNode}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);
  return visible ? children : null;
}

function Frame({
  lang,
  pickLang,
  ap,
  backend,
  route,
  query,
  go,
  openSearch,
  mac
}: {
  lang: Lang;
  pickLang: (l: Lang) => void;
  ap: ReturnType<typeof useAppearance>;
  backend: BackendKind;
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
  const nav = navGroups.map(
    group => [group, features.filter(feature => feature.nav?.group === group && navAvailable(feature.path, capabilities.data, backend))] as const
  );
  const [navRef, navPos] = useSlider(route, '[aria-current="page"]');
  const [spinning, setSpinning] = useState(false);
  const feature = features.find(feature => feature.path === route) ?? features[0];
  const Page = feature.Page;
  const titleKey = feature.nav?.titleKey ?? 'nav.activity';
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <RLink className="rp-brand" href="#/activity">
          <img src={logo} alt="" />
          <span>doona</span>
        </RLink>
        <div className="rp-search-wrap">
          <Button appearance="search" onPress={openSearch}>
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
          <span className={spinning ? 'rp-spin' : undefined}>
            <Button
              quiet
              icon
              label={t('refresh')}
              isDisabled={spinning}
              onPress={async () => {
                setSpinning(true);
                let timer: number | undefined;
                await Promise.race([
                  refetchAll(),
                  new Promise<void>(resolve => {
                    timer = window.setTimeout(resolve, 2000);
                  })
                ]);
                clearTimeout(timer);
                setSpinning(false);
              }}
            >
              <Refresh />
            </Button>
          </span>
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
      <nav className="rp-side" ref={navRef}>
        {navPos && <span className="rp-nav-slider" style={{translate: `0 ${navPos.y}px`, height: navPos.h}} />}
        {nav.map(([g, items]) => (
          <div key={g} data-group={g.replace('grp.', '')}>
            <div className="rp-group">{t(g)}</div>
            {items.map(
              ({id, path, nav, compat}) =>
                nav && (
                  <RLink key={id} className="rp-nav" href={'#/' + path} aria-current={route === path ? 'page' : undefined}>
                    <nav.Icon />
                    {t(nav.titleKey)}
                    {compat && <Badge className="rp-nav-compat">{t('nav.compat')}</Badge>}
                  </RLink>
                )
            )}
          </div>
        ))}
        <div className="rp-side-grow" />
        <Button appearance="version" onPress={() => window.open('https://github.com/daeuniverse/honk', '_blank')} label={t('github')}>
          <GitHub />
          {version.data && !version.loading ? `${version.data.engine.name} ${version.data.engine.version}` : '—'}
        </Button>
      </nav>
      <main className="rp-main">
        <div className="rp-content">
          <div className="rp-head">
            <h1 className="rp-h1">{t(titleKey)}</h1>
            <div className="rp-mobile-nav">
              <LabeledSelect
                label={t('page')}
                value={route}
                onChange={k => go(k)}
                items={nav
                  .flatMap(([, items]) => items)
                  .flatMap(({path, nav, compat}) =>
                    nav
                      ? [
                          {
                            id: path,
                            label: t(nav.titleKey),
                            icon: compat ? <Badge className="rp-nav-compat">{t('nav.compat')}</Badge> : undefined
                          }
                        ]
                      : []
                  )}
                bare
              />
            </div>
          </div>
          <SettingsContext.Provider value={{lang, pickLang, ap, paletteSections}}>
            {feature.requires.backend && feature.requires.backend !== backend ? (
              <p className="rp-note">{t('shell.backendRequired')}</p>
            ) : (
              <Suspense
                key={feature.id}
                fallback={
                  <Delayed>
                    <div className="rp-empty" role="status">
                      {t('ui.loading')}
                    </div>
                  </Delayed>
                }
              >
                <Page go={go} query={query} backend={backend} />
              </Suspense>
            )}
          </SettingsContext.Provider>
        </div>
      </main>
    </div>
  );
}
