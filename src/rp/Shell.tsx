// Rosé Pine shell: same frame as the S2 panel (top bar, side nav, rounded main), plain CSS and react-aria-components.
import {useEffect, useState} from 'react';
import {Button as RButton, Dialog, Modal, ModalOverlay, SearchField, Input, ListBox, ListBoxItem, ListBoxSection, Header} from 'react-aria-components';
import Search from '@react-spectrum/s2/icons/Search';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Translate from '@react-spectrum/s2/icons/Translate';
import Contrast from '@react-spectrum/s2/icons/Contrast';
import Lighten from '@react-spectrum/s2/icons/Lighten';
import GraphTrend from '@react-spectrum/s2/icons/ChartTrend';
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
import {Button, MenuButton} from './ui';
import {Activity} from './Activity';
import {Provider} from '@react-spectrum/s2';
import {ToastContainer} from '@react-spectrum/s2/Toast';
import Color from '@react-spectrum/s2/icons/Color';
import {S2_LOCALE} from '../app/i18n';
import {PAGES} from '../app/Shell';

type Scheme = 'system' | 'light' | 'dark';
type PaletteId = 'rose-pine' | 'catppuccin' | 'nord';
const PALETTES: Array<[PaletteId, string]> = [['rose-pine', 'Rosé Pine'], ['catppuccin', 'Catppuccin'], ['nord', 'Nord']];
const NAV: Array<[string, Array<[string, string, typeof Home]>]> = [
  ['grp.status', [['activity', 'nav.activity', GraphTrend], ['overview', 'nav.overview', Home]]],
  ['grp.network', [['connections', 'nav.connections', Link], ['clients', 'nav.clients', Devices]]],
  ['grp.proxy', [['policies', 'nav.policies', Share], ['rules', 'nav.rules', ListBulleted], ['dns', 'nav.dns', Globe]]],
  ['grp.system', [['resources', 'nav.resources', Data], ['config', 'nav.config', FileText], ['events', 'nav.events', History]]]
];
const NODES = [...new Set(groups.flatMap(g => g.nodes.map(n => n.name)))];

function useAppearance() {
  const [scheme, setScheme] = useState<Scheme>(() => { try { return (localStorage.getItem('doona-scheme') as Scheme) || 'system'; } catch { return 'system'; } });
  const [palette, setPalette] = useState<PaletteId>(() => { try { return (localStorage.getItem('doona-palette') as PaletteId) || 'rose-pine'; } catch { return 'rose-pine'; } });
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const on = () => setSysDark(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  const dark = scheme === 'dark' || (scheme === 'system' && sysDark);
  useEffect(() => { document.documentElement.dataset.scheme = dark ? 'dark' : 'light'; document.documentElement.dataset.palette = palette; }, [dark, palette]);
  // Same rule as the docs site: following the system flips to the opposite of the system; an override goes back to system.
  const toggle = () => { const next: Scheme = scheme === 'system' ? (sysDark ? 'light' : 'dark') : 'system'; setScheme(next); try { localStorage.setItem('doona-scheme', next); } catch { /* private mode */ } };
  const pickPalette = (p: PaletteId) => { setPalette(p); try { localStorage.setItem('doona-palette', p); } catch { /* private mode */ } };
  return {scheme, dark, toggle, palette, pickPalette};
}

function SchemeIcon({dark}: {dark: boolean}) {
  return <span className="rp-icon-stack"><Contrast UNSAFE_style={{opacity: dark ? 0 : 1, transform: dark ? 'rotate(-90deg) scale(0.5)' : 'rotate(0deg) scale(1)'}} /><Lighten UNSAFE_style={{opacity: dark ? 1 : 0, transform: dark ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)'}} /></span>;
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
        <SearchField aria-label={t('search')} value={q} onChange={setQ} autoFocus className="rp-input"><Search /><Input placeholder={t('search')} /></SearchField>
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
  const go = (p: string) => { location.hash = '#/' + p; };
  const pickLang = (l: Lang) => { setLang(l); try { localStorage.setItem('doona-lang', l); } catch { /* private mode */ } };
  const mac = navigator.platform.startsWith('Mac');
  return (
    <LangContext.Provider value={lang}>
      <Frame lang={lang} pickLang={pickLang} ap={ap} route={route} go={go} openSearch={() => setSearchOpen(true)} mac={mac} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} go={go} />
    </LangContext.Provider>
  );
}

function Frame({lang, pickLang, ap, route, go, openSearch, mac}: {lang: Lang, pickLang: (l: Lang) => void, ap: ReturnType<typeof useAppearance>, route: string, go: (p: string) => void, openSearch: () => void, mac: boolean}) {
  const t = useT();
  const s2Page = PAGES[route];
  const S2Page = route === 'activity' ? null : s2Page?.[1];
  const titleKey = NAV.flatMap(([, items]) => items).find(([k]) => k === route)?.[1] ?? 'nav.activity';
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <a className="rp-brand" href="#/activity"><img src={logo} alt="" />doona</a>
        <div className="rp-search-wrap"><RButton className="rp-search" onPress={openSearch}><Search /><span className="grow">{t('search')}</span><span className="rp-kbd">{mac ? '⌘K' : 'Ctrl K'}</span></RButton></div>
        <div className="rp-actions">
          <Button quiet icon label={t('refresh')}><Refresh /></Button>
          <div className="rp-vrule" />
          <MenuButton quiet chevron={false} label={t('lang')} value={lang} onChange={k => pickLang(k as Lang)} items={LANGS.map(([k, l]) => ({id: k, label: l}))}><Translate /></MenuButton>
          <MenuButton quiet chevron={false} label={t('palette')} value={ap.palette} onChange={k => ap.pickPalette(k as PaletteId)} items={PALETTES.map(([id, label]) => ({id, label}))}><Color /></MenuButton>
          <Button quiet icon label={t('theme') + '：' + (ap.scheme === 'system' ? t('theme.system') : ap.dark ? t('theme.dark') : t('theme.light'))} onPress={ap.toggle}><SchemeIcon dark={ap.dark} /></Button>
        </div>
      </header>
      <nav className="rp-side">
        {NAV.map(([g, items]) => (
          <div key={g}>
            <div className="rp-group">{t(g as 'grp.status')}</div>
            {items.map(([k, label, Icon]) => <a key={k} className="rp-nav" href={'#/' + k} aria-current={route === k ? 'page' : undefined}><Icon />{t(label as 'nav.activity')}</a>)}
          </div>
        ))}
        <div className="rp-side-grow" />
        <button className="rp-version" onClick={() => window.open('https://github.com/daeuniverse/honk', '_blank')}><GitHub />honk 0.9.3</button>
      </nav>
      <main className="rp-main">
        <div className="rp-content">
          <h1 className="rp-h1">{t(titleKey as 'nav.activity')}</h1>
          {S2Page ? <div className="rp-s2host"><Provider locale={S2_LOCALE[lang]} colorScheme={ap.dark ? 'dark' : 'light'} background="base" router={{navigate: (h: string) => { location.hash = h; }}}><ToastContainer /><S2Page go={go as never} query={location.hash.split('?')[1] ?? ''} /></Provider></div> : <Activity go={go} />}
        </div>
      </main>
    </div>
  );
}
