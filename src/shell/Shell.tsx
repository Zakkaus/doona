// Rosé Pine shell: same frame as the S2 panel (top bar, side nav, rounded main), plain CSS and react-aria-components.
import {useEffect, useLayoutEffect, useState} from 'react';
import {
  I18nProvider,
  Button as RButton,
  Dialog,
  Modal,
  ModalOverlay,
  SearchField,
  Input,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Header,
  Link as RLink,
  Separator
} from 'react-aria-components';
import Close from '../ui/icons/Close';
import {toast} from '../ui/ui';
import Search from '../ui/icons/Search';
import Refresh from '../ui/icons/Refresh';
import Translate from '../ui/icons/Translate';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import logo from '../logo.svg';
import GitHub from '../ui/icons/GitHub';
import {LangContext, LANGS, LOCALE, readLang, useT, type Lang, type Translator} from '../i18n';
import {conns, groups, rules} from '../features/clash-compat/fixtures';
import {Button, MenuButton, Toasts, LabeledSelect, useSlider, withCrossfade} from '../ui/ui';
import Color from '../ui/icons/Color';
import type {PageProps} from '../features/types';
import {useRoute} from './route';
import {useCapabilities} from '../api/store';
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
const NODES = [...new Set(groups.flatMap(g => g.nodes.map(n => n.name)))];

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

function SearchDialog({open, onClose, go}: {open: boolean; onClose: () => void; go: (p: string) => void}) {
  const t = useT();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? {
        conns: conns.filter(c => (c.host || c.dst).toLowerCase().includes(needle)).slice(0, 8),
        nodes: NODES.filter(n => n.toLowerCase().includes(needle)).slice(0, 8),
        rules: rules.filter(r => r.cond.toLowerCase().includes(needle)).slice(0, 8)
      }
    : {conns: conns.slice(0, 5), nodes: NODES.slice(0, 5), rules: rules.slice(0, 5)};
  const pick = (k: string) => {
    const [kind] = k.split(':');
    go(kind === 'conn' ? 'connections' : kind === 'node' ? 'policies' : 'rules');
    onClose();
  };
  return (
    <ModalOverlay
      className="rp-underlay"
      isOpen={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
      isDismissable
    >
      <Modal>
        <Dialog className="rp-dialog" aria-label={t('search')}>
          <RButton className="rp-btn quiet icon close" onPress={onClose} aria-label={t('close')}>
            <Close />
          </RButton>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog the user just opened */}
          <SearchField aria-label={t('search')} value={q} onChange={setQ} autoFocus className="rp-input lg">
            <Search />
            <Input placeholder={t('search')} />
            <RButton className="clear" aria-label={t('clear')}>
              <Close />
            </RButton>
          </SearchField>
          {hits.conns.length + hits.nodes.length + hits.rules.length === 0 && <div className="rp-empty">{t('search.none')}</div>}
          <ListBox aria-label={t('search')} className="rp-results" onAction={k => pick(String(k))}>
            {hits.conns.length > 0 && (
              <ListBoxSection id="conns">
                <Header className="rp-section-h">{t('nav.connections')}</Header>
                {hits.conns.map(c => (
                  <ListBoxItem key={c.id} id={'conn:' + c.id} className="rp-item plain" textValue={c.host || c.dst}>
                    <span>{c.host || c.dst}</span>
                    <span className="desc">{c.chain.join(' → ')}</span>
                  </ListBoxItem>
                ))}
              </ListBoxSection>
            )}
            {hits.nodes.length > 0 && (
              <ListBoxSection id="nodes">
                <Header className="rp-section-h">{t('search.nodes')}</Header>
                {hits.nodes.map(n => (
                  <ListBoxItem key={n} id={'node:' + n} className="rp-item plain" textValue={n}>
                    {n}
                  </ListBoxItem>
                ))}
              </ListBoxSection>
            )}
            {hits.rules.length > 0 && (
              <ListBoxSection id="rules">
                <Header className="rp-section-h">{t('nav.rules')}</Header>
                {hits.rules.map(r => (
                  <ListBoxItem key={r.id} id={'rule:' + r.id} className="rp-item" textValue={r.cond}>
                    <span>{r.cond}</span>
                    <span className="desc">{r.target}</span>
                  </ListBoxItem>
                ))}
              </ListBoxSection>
            )}
          </ListBox>
        </Dialog>
      </Modal>
    </ModalOverlay>
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
        <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} go={go} />
        <ToastHost />
      </I18nProvider>
    </LangContext.Provider>
  );
}

function ToastHost() {
  const t = useT();
  return <Toasts labels={{close: t('close'), showAll: n => t('toast.showAllCount', {n}), collapse: t('toast.collapse'), clearAll: t('toast.clearAll')}} />;
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
          <RButton className="rp-search" onPress={openSearch}>
            <Search />
            <span className="grow">{t('search')}</span>
            <span className="rp-kbd">{mac ? t('shell.macShortcut') : t('shell.shortcut')}</span>
          </RButton>
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
              onPress={() => {
                setSpinning(true);
                setTimeout(() => setSpinning(false), 600);
                toast('positive', t('refreshed'));
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
                    {compat && <span className="rp-badge rp-nav-compat">{t('nav.compat')}</span>}
                  </RLink>
                )
            )}
          </div>
        ))}
        <div className="rp-side-grow" />
        <RButton className="rp-version" onPress={() => window.open('https://github.com/daeuniverse/honk', '_blank')} aria-label={t('github')}>
          <GitHub />
          honk 0.9.3
        </RButton>
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
                            icon: compat ? <span className="rp-badge rp-nav-compat">{t('nav.compat')}</span> : undefined
                          }
                        ]
                      : []
                  )}
                bare
              />
            </div>
          </div>
          <SettingsContext.Provider value={{lang, pickLang, ap, paletteSections}}>
            <Page go={go} query={query} />
          </SettingsContext.Provider>
        </div>
      </main>
    </div>
  );
}
