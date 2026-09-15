// Rosé Pine shell: same frame as the S2 panel (top bar, side nav, rounded main), plain CSS and react-aria-components.
import {useEffect, useState, type ReactElement} from 'react';
import {Button as RButton, Dialog, Modal, ModalOverlay, SearchField, Input, ListBox, ListBoxItem, ListBoxSection, Header, Link as RLink, Separator} from 'react-aria-components';
import Close from '@react-spectrum/s2/icons/Close';
import {toast} from './ui';
import Search from '@react-spectrum/s2/icons/Search';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Translate from '@react-spectrum/s2/icons/Translate';
import Contrast from '@react-spectrum/s2/icons/Contrast';
import Lighten from '@react-spectrum/s2/icons/Lighten';
import GraphTrend from '@react-spectrum/s2/icons/SpeedFast';
import Home from '@react-spectrum/s2/icons/Home';
import Link from '@react-spectrum/s2/icons/Link';
import Devices from '@react-spectrum/s2/icons/DeviceAll';
import Share from '@react-spectrum/s2/icons/Share';
import ListBulleted from '@react-spectrum/s2/icons/ListBulleted';
import Globe from '@react-spectrum/s2/icons/GlobeGrid';
import Data from '@react-spectrum/s2/icons/Data';
import FileText from '@react-spectrum/s2/icons/FileText';
import History from '@react-spectrum/s2/icons/History';
import logo from '../logo.svg';
import GitHub from '../app/icons/GitHub';
import {LangContext, LANGS, readLang, useT, type Lang} from '../app/i18n';
import {conns, groups, rules} from '../app/mock';
import {Button, MenuButton, Toasts, LabeledSelect} from './ui';
import {Activity} from './Activity';
import Color from '@react-spectrum/s2/icons/Color';
import {Overview} from './pages/Overview';
import {Connections} from './pages/Connections';
import {Clients} from './pages/Clients';
import {Policies} from './pages/Policies';
import {Rules} from './pages/Rules';
import {Dns} from './pages/Dns';
import {Resources} from './pages/Resources';
import {ConfigPage} from './pages/ConfigPage';
import {Events} from './pages/Events';
import type {PageProps} from './pages/types';
const PAGES: Record<string, (p: PageProps) => ReactElement> = {overview: Overview, connections: Connections, clients: Clients, policies: Policies, rules: Rules, dns: Dns, resources: Resources, config: ConfigPage, events: Events};

type Scheme = 'system' | 'light' | 'dark';
// A palette is a family plus its dark flavour; the light flavour is fixed per family (Dawn, Latte, Nord light).
type PaletteId = 'rose-pine/main' | 'rose-pine/moon' | 'catppuccin/frappe' | 'catppuccin/macchiato' | 'catppuccin/mocha' | 'nord/nord' | 'glass/glass';
const PALETTES: Array<{title: string, items: Array<{id: PaletteId, label: string, desc?: string}>}> = [
  {title: 'Rosé Pine', items: [{id: 'rose-pine/moon', label: 'Moon', desc: '暗版較柔'}, {id: 'rose-pine/main', label: 'Main', desc: '暗版最深'}]},
  {title: 'Catppuccin', items: [{id: 'catppuccin/frappe', label: 'Frappé', desc: '暗版最淺'}, {id: 'catppuccin/macchiato', label: 'Macchiato', desc: '暗版'}, {id: 'catppuccin/mocha', label: 'Mocha', desc: '暗版最深'}]},
  {title: 'Nord', items: [{id: 'nord/nord', label: 'Nord'}]},
  {title: 'Glass', items: [{id: 'glass/glass', label: 'Glass', desc: '毛玻璃'}]}
];
const NAV: Array<[string, Array<[string, string, typeof Home]>]> = [
  ['grp.status', [['activity', 'nav.activity', GraphTrend], ['overview', 'nav.overview', Home]]],
  ['grp.network', [['connections', 'nav.connections', Link], ['clients', 'nav.clients', Devices]]],
  ['grp.proxy', [['policies', 'nav.policies', Share], ['rules', 'nav.rules', ListBulleted], ['dns', 'nav.dns', Globe]]],
  ['grp.system', [['resources', 'nav.resources', Data], ['config', 'nav.config', FileText], ['events', 'nav.events', History]]]
];
const NODES = [...new Set(groups.flatMap(g => g.nodes.map(n => n.name)))];

function useAppearance() {
  const [scheme, setScheme] = useState<Scheme>(() => { try { return (localStorage.getItem('doona-scheme') as Scheme) || 'system'; } catch { return 'system'; } });
  const [palette, setPalette] = useState<PaletteId>(() => { try { const v = localStorage.getItem('doona-palette') as PaletteId | null; return v && v.includes('/') ? v : 'rose-pine/moon'; } catch { return 'rose-pine/moon'; } });
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const on = () => setSysDark(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  const dark = scheme === 'dark' || (scheme === 'system' && sysDark);
  useEffect(() => { const [family, flavour] = palette.split('/'); const d = document.documentElement.dataset; d.scheme = dark ? 'dark' : 'light'; d.family = family; d.flavour = flavour; }, [dark, palette]);
  // Same rule as the docs site: following the system flips to the opposite of the system; an override goes back to system.
  const toggle = () => { const next: Scheme = scheme === 'system' ? (sysDark ? 'light' : 'dark') : 'system'; setScheme(next); try { localStorage.setItem('doona-scheme', next); } catch { /* private mode */ } };
  const pickPalette = (p: PaletteId) => { setPalette(p); try { localStorage.setItem('doona-palette', p); } catch { /* private mode */ } };
  return {scheme, dark, toggle, palette, pickPalette};
}

function SchemeIcon({dark}: {dark: boolean}) {
  return <span className="rp-icon-stack" data-dark={dark || undefined}><Contrast UNSAFE_className="moon" /><Lighten UNSAFE_className="sun" /></span>;
}

function SearchDialog({open, onClose, go}: {open: boolean, onClose: () => void, go: (p: string) => void}) {
  const t = useT();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hits = needle ? {
    conns: conns.filter(c => (c.host || c.dst).toLowerCase().includes(needle)).slice(0, 8),
    nodes: NODES.filter(n => n.toLowerCase().includes(needle)).slice(0, 8),
    rules: rules.filter(r => r.cond.toLowerCase().includes(needle)).slice(0, 8)
  } : {conns: conns.slice(0, 5), nodes: NODES.slice(0, 5), rules: rules.slice(0, 5)};
  const pick = (k: string) => { const [kind] = k.split(':'); go(kind === 'conn' ? 'connections' : kind === 'node' ? 'policies' : 'rules'); onClose(); };
  return (
    <ModalOverlay className="rp-underlay" isOpen={open} onOpenChange={o => { if (!o) onClose(); }} isDismissable>
      <Modal><Dialog className="rp-dialog" aria-label={t('search')}>
        <RButton className="rp-btn quiet icon close" onPress={onClose} aria-label={t('close')}><Close /></RButton>
        <SearchField aria-label={t('search')} value={q} onChange={setQ} autoFocus className="rp-input lg"><Search /><Input placeholder={t('search')} /><RButton className="clear" aria-label={t('clear')}><Close /></RButton></SearchField>
        {hits.conns.length + hits.nodes.length + hits.rules.length === 0 && <div className="rp-empty">{t('search.none')}</div>}
        <ListBox aria-label={t('search')} className="rp-results" onAction={k => pick(String(k))}>
          {hits.conns.length > 0 && <ListBoxSection id="conns"><Header className="rp-section-h">{t('nav.connections')}</Header>{hits.conns.map(c => <ListBoxItem key={c.id} id={'conn:' + c.id} className="rp-item" textValue={c.host || c.dst}><span>{c.host || c.dst}</span><span className="desc">{c.chain.join(' → ')}</span></ListBoxItem>)}</ListBoxSection>}
          {hits.nodes.length > 0 && <ListBoxSection id="nodes"><Header className="rp-section-h">{t('search.nodes')}</Header>{hits.nodes.map(n => <ListBoxItem key={n} id={'node:' + n} className="rp-item" textValue={n}>{n}</ListBoxItem>)}</ListBoxSection>}
          {hits.rules.length > 0 && <ListBoxSection id="rules"><Header className="rp-section-h">{t('nav.rules')}</Header>{hits.rules.map(r => <ListBoxItem key={r.id} id={'rule:' + r.id} className="rp-item" textValue={r.cond}><span>{r.cond}</span><span className="desc">{r.target}</span></ListBoxItem>)}</ListBoxSection>}
        </ListBox>
      </Dialog></Modal>
    </ModalOverlay>
  );
}

export function Shell() {
  const [lang, setLang] = useState<Lang>(readLang);
  const ap = useAppearance();
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, '').split('?')[0] || 'activity');
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { const on = () => setRoute(location.hash.replace(/^#\/?/, '').split('?')[0] || 'activity'); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  useEffect(() => { const on = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); } }; addEventListener('keydown', on); return () => removeEventListener('keydown', on); }, []);
  const go = (p: string, q?: string) => { location.hash = '#/' + p + (q ? '?' + q : ''); };
  const pickLang = (l: Lang) => { setLang(l); try { localStorage.setItem('doona-lang', l); } catch { /* private mode */ } };
  const mac = navigator.platform.startsWith('Mac');
  return (
    <LangContext.Provider value={lang}>
      <Frame lang={lang} pickLang={pickLang} ap={ap} route={route} go={go} openSearch={() => setSearchOpen(true)} mac={mac} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} go={go} />
      <ToastHost />
    </LangContext.Provider>
  );
}

function ToastHost() { const t = useT(); return <Toasts closeLabel={t('close')} />; }

function Frame({lang, pickLang, ap, route, go, openSearch, mac}: {lang: Lang, pickLang: (l: Lang) => void, ap: ReturnType<typeof useAppearance>, route: string, go: (p: string) => void, openSearch: () => void, mac: boolean}) {
  const t = useT();
  const Page = route === 'activity' ? null : PAGES[route];
  const titleKey = NAV.flatMap(([, items]) => items).find(([k]) => k === route)?.[1] ?? 'nav.activity';
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <RLink className="rp-brand" href="#/activity"><img src={logo} alt="" />doona</RLink>
        <div className="rp-search-wrap"><RButton className="rp-search" onPress={openSearch}><Search /><span className="grow">{t('search')}</span><span className="rp-kbd">{mac ? '⌘K' : 'Ctrl K'}</span></RButton></div>
        <div className="rp-actions">
          <span className="rp-search-compact"><Button quiet icon label={t('search')} onPress={openSearch}><Search /></Button></span>
          <Button quiet icon label={t('refresh')} onPress={() => toast('positive', t('refreshed'))}><Refresh /></Button>
          <Separator orientation="vertical" className="rp-vrule" />
          <MenuButton quiet chevron={false} label={t('lang')} value={lang} onChange={k => pickLang(k as Lang)} items={LANGS.map(([k, l]) => ({id: k, label: l}))}><Translate /></MenuButton>
          <MenuButton quiet chevron={false} label={t('palette')} value={ap.palette} onChange={k => ap.pickPalette(k as PaletteId)} sections={PALETTES}><Color /></MenuButton>
          <Button quiet icon label={t('theme') + '：' + (ap.scheme === 'system' ? t('theme.system') : ap.dark ? t('theme.dark') : t('theme.light'))} onPress={ap.toggle}><SchemeIcon dark={ap.dark} /></Button>
        </div>
      </header>
      <nav className="rp-side">
        {NAV.map(([g, items]) => (
          <div key={g}>
            <div className="rp-group">{t(g as 'grp.status')}</div>
            {items.map(([k, label, Icon]) => <RLink key={k} className="rp-nav" href={'#/' + k} aria-current={route === k ? 'page' : undefined}><Icon />{t(label as 'nav.activity')}</RLink>)}
          </div>
        ))}
        <div className="rp-side-grow" />
        <RButton className="rp-version" onPress={() => window.open('https://github.com/daeuniverse/honk', '_blank')} aria-label={t('github')}><GitHub />honk 0.9.3</RButton>
      </nav>
      <main className="rp-main">
        <div className="rp-content">
          <div className="rp-head">
            <h1 className="rp-h1">{t(titleKey as 'nav.activity')}</h1>
            <div className="rp-mobile-nav"><LabeledSelect label={t('page')} value={route} onChange={k => go(k)} items={NAV.flatMap(([, items]) => items).map(([k, label]) => ({id: k, label: t(label as 'nav.activity')}))} bare /></div>
          </div>
          {Page ? <Page go={go} query={location.hash.split('?')[1] ?? ''} /> : <Activity go={go} />}
        </div>
      </main>
    </div>
  );
}
