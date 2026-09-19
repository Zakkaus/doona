// The shell: top bar, side navigation and a rounded main column, in plain CSS and react-aria-components.
import {Login} from './Login';
import {ApiError} from '../api/error';
import {Suspense, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {I18nProvider, ListBox, ListBoxItem, ListBoxSection, Header, Link as RLink, Separator} from 'react-aria-components';
import Close from '../ui/icons/Close';
import Search from '../ui/icons/Search';
import Refresh from '../ui/icons/Refresh';
import Translate from '../ui/icons/Translate';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import logo from '../logo.svg';
import GitHub from '../ui/icons/GitHub';
import {LangContext, LANGS, LOCALE, useT, type Lang, type Translator} from '../i18n';
import {
  Button,
  MenuButton,
  ModalDialog,
  TextField,
  Toasts,
  LabeledSelect,
  ErrorMessage,
  Loading,
  TextTooltip,
  errorText,
  toast,
  visibleErrors,
  useSlider,
  withCrossfade
} from '../ui/ui';
import Color from '../ui/icons/Color';
import type {PageProps} from '../features/types';
import {useRoute} from './route';
import {refetchAll, useCapabilities, useConfig, useConnections, useGroups, useNodes, useProviders, useVersion} from '../api/store';
import {chainLabel, connectionRows} from '../api/selectors';
import {features, navAvailable, subpages, warmPage} from './registry';
import {SettingsContext} from '../features/settings/Settings';
import {readSettings, type PaletteId, type Scheme, type Settings, type Wordmark} from '../features/settings/settings';
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

function SearchDialog({onClose, go}: {onClose: () => void; go: PageProps['go']}) {
  const t = useT();
  const [q, setQ] = useState('');
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const connections = useConnections(undefined, resources?.connections.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const groups = useGroups(resources?.groups.available === true);
  const providers = useProviders(resources?.providers.available === true);
  const config = useConfig(resources?.config.available === true);
  const needle = q.trim().toLowerCase();
  const limit = needle ? 8 : 5;
  const match = (...values: Array<string | null | undefined>) => values.some(value => value?.toLowerCase().includes(needle));
  const available = (path: string) => navAvailable(path, capabilities.data);
  // Pages and their tabs and cards, so a tab or card name lands on the right place, not just the page.
  const places = [
    ...features
      .filter(feature => feature.nav && available(feature.path))
      .map(feature => ({id: feature.path, query: '', title: t(feature.nav!.titleKey), parent: ''})),
    ...subpages
      .filter(item => available(item.path))
      .map(item => ({
        id: item.path + '?' + item.query,
        query: item.query,
        title: t(item.titleKey),
        parent: t(features.find(f => f.path === item.path)!.nav!.titleKey)
      }))
  ];
  const hits = {
    conns: connectionRows(connections.data)
      .filter(c => match(c.domain, c.dst, c.src))
      .slice(0, limit),
    nodes: (nodes.data ?? []).filter(n => match(n.name)).slice(0, limit),
    groups: (groups.data ?? []).filter(g => match(g.name)).slice(0, limit),
    providers: (providers.data?.providers ?? []).filter(p => match(p.name)).slice(0, limit),
    sources: (config.data?.sources ?? []).filter(source => match(source.path)).slice(0, limit),
    pages: places.filter(place => match(place.title, place.parent && place.parent + ' ' + place.title)).slice(0, limit)
  };
  const error = connections.error ?? nodes.error ?? groups.error ?? capabilities.error;
  const total = Object.values(hits).reduce((sum, list) => sum + list.length, 0);
  const pick = (k: string) => {
    const [kind, ...rest] = k.split(':');
    const id = rest.join(':');
    if (kind === 'conn') go('connections', 'id=' + encodeURIComponent(id));
    else if (kind === 'node') {
      const node = nodes.data?.find(n => n.id === id);
      go('nodes', (node?.provider_id ? 'provider=' + encodeURIComponent(node.provider_id) + '&' : '') + 'q=' + encodeURIComponent(node?.name ?? id));
    } else if (kind === 'group') go('policies', 'group=' + encodeURIComponent(id));
    else if (kind === 'provider') go('nodes', 'provider=' + encodeURIComponent(id));
    else if (kind === 'source') go('config', 'tab=source&source=' + encodeURIComponent(id));
    else {
      const [path, query] = id.split('?');
      go(path, query);
    }
    onClose();
  };
  const section = (id: string, title: string, items: Array<{key: string; label: string; desc?: string}>) =>
    items.length > 0 && (
      <ListBoxSection id={id}>
        <Header className="rp-section-h">{title}</Header>
        {items.map(item => (
          <ListBoxItem key={item.key} id={item.key} className="rp-item plain" textValue={item.label}>
            <span>{item.label}</span>
            {item.desc && <span className="desc">{item.desc}</span>}
          </ListBoxItem>
        ))}
      </ListBoxSection>
    );
  return (
    <ModalDialog
      title={t('search')}
      hideTitle
      isOpen
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <div className="rp-toolbar">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog the user just opened */}
        <TextField search large label={t('search')} value={q} onChange={setQ} autoFocus className="rp-grow" />
        <Button quiet icon onPress={onClose} label={t('close')}>
          <Close />
        </Button>
      </div>
      {error && <ErrorMessage error={error} />}
      {total === 0 && <div className="rp-empty">{t('search.none')}</div>}
      <ListBox aria-label={t('search')} className="rp-results" onAction={k => pick(String(k))}>
        {section(
          'pages',
          t('search.pages'),
          hits.pages.map(place => ({key: 'page:' + place.id, label: place.title, desc: place.parent || undefined}))
        )}
        {section(
          'conns',
          t('nav.connections'),
          hits.conns.map(c => ({key: 'conn:' + c.id, label: c.domain || c.dst || c.src || c.id, desc: chainLabel(c, t)}))
        )}
        {section(
          'nodes',
          t('search.nodes'),
          hits.nodes.map(n => ({key: 'node:' + n.id, label: n.name, desc: n.group_ids.join(', ') || undefined}))
        )}
        {section(
          'groups',
          t('search.groups'),
          hits.groups.map(g => ({key: 'group:' + g.id, label: g.name, desc: g.policy.native}))
        )}
        {section(
          'providers',
          t('search.providers'),
          hits.providers.map(p => ({key: 'provider:' + p.id, label: p.name, desc: t('search.nodeCount', {n: p.node_count})}))
        )}
        {section(
          'sources',
          t('search.sources'),
          hits.sources.map(source => ({key: 'source:' + source.id, label: source.path, desc: source.kind}))
        )}
      </ListBox>
    </ModalDialog>
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
  const {route, query, go} = useRoute(settings.api);
  // A hash no page owns goes to the first page instead of showing it under the wrong address.
  useEffect(() => {
    if (!features.some(feature => feature.path === route)) go('activity');
  }, [route, go]);
  const [searchOpen, setSearchOpen] = useState(false);
  const pickLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem('doona-lang', l);
    } catch {
      /* private mode */
    }
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
        {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} go={go} />}
        <Shortcuts go={go} openSearch={() => setSearchOpen(true)} mac={mac} />
        <ToastHost />
      </I18nProvider>
    </LangContext.Provider>
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
  const [refreshed, setRefreshed] = useState(0);
  const announcedRefresh = useRef(0);
  useEffect(() => {
    if (refreshed === announcedRefresh.current) return;
    announcedRefresh.current = refreshed;
    const error = visibleErrors.values().next().value;
    toast(error ? 'negative' : 'positive', error ? t('ui.refreshFailed', {error: errorText(error)}) : t('ui.refreshed'));
  }, [refreshed, t]);
  const feature = features.find(feature => feature.path === route) ?? features[0];
  const Page = feature.Page;
  // A 401 or 403 from the capability probe means the backend wants a token; the page yields to the login form.
  const needsToken = capabilities.error instanceof ApiError && (capabilities.error.status === 401 || capabilities.error.status === 403);
  const titleKey = feature.nav?.titleKey ?? 'nav.activity';
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <RLink className="rp-brand" href="#/activity">
          <img src={logo} alt="" />
          <span className="rp-brand-text">
            <span>doona</span>
            <span className="rp-brand-version">v{import.meta.env.VITE_DOONA_VERSION}</span>
          </span>
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
                await refetchAll();
                setRefreshed(value => value + 1);
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
        <Button appearance="version" onPress={() => window.open('https://github.com/daeuniverse/honk', '_blank')} label={t('github')}>
          <GitHub />
          {version.data ? `${version.data.engine.name} ${version.data.engine.version}` : '—'}
          {settings.profiles.length > 1 && <TextTooltip text={profile?.name}>{profile?.name}</TextTooltip>}
        </Button>
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
              <div className="rp-empty">
                {t('shell.notOffered')}
                <Button onPress={() => go('activity')}>{t('shell.toActivity')}</Button>
              </div>
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
