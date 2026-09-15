import {useEffect, useRef, useState, type ComponentType} from 'react';
import {Provider} from '@react-spectrum/s2/Provider';
import {SideNav, SideNavHeader, SideNavItem, SideNavItemContent, SideNavItemLink, SideNavSection} from '@react-spectrum/s2/SideNav';
import {SearchTrigger} from './SearchTrigger';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {Button} from 'react-aria-components';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {TooltipTrigger, Tooltip} from '@react-spectrum/s2/Tooltip';
import {ToastContainer} from '@react-spectrum/s2/Toast';
import {style, focusRing, iconStyle} from '@react-spectrum/s2/style' with {type: 'macro'};
import Contrast from '@react-spectrum/s2/icons/Contrast';
import Lighten from '@react-spectrum/s2/icons/Lighten';
import GitHub from './icons/GitHub';
import logo from '../logo.svg';
import {Divider} from '@react-spectrum/s2/Divider';
import {Menu, MenuTrigger, MenuItem, SubmenuTrigger} from '@react-spectrum/s2/Menu';
import type {Key} from '@react-spectrum/s2';
import Settings from '@react-spectrum/s2/icons/Settings';
import {LangContext, LANGS, S2_LOCALE, readLang, useT, type Lang} from './i18n';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Home from '@react-spectrum/s2/icons/Home';
import ChartTrend from '@react-spectrum/s2/icons/ChartTrend';
import LinkIcon from '@react-spectrum/s2/icons/Link';
import DeviceAll from '@react-spectrum/s2/icons/DeviceAll';
import Share from '@react-spectrum/s2/icons/Share';
import ListBulleted from '@react-spectrum/s2/icons/ListBulleted';
import GlobeGrid from '@react-spectrum/s2/icons/GlobeGrid';
import Translate from '@react-spectrum/s2/icons/Translate';
import Data from '@react-spectrum/s2/icons/Data';
import FileText from '@react-spectrum/s2/icons/FileText';
import History from '@react-spectrum/s2/icons/History';
import {toast} from './ui';
import {Activity} from './pages/Activity';
import {Overview} from './pages/Overview';
import {Connections} from './pages/Connections';
import {Clients} from './pages/Clients';
import {Policies} from './pages/Policies';
import {Rules} from './pages/Rules';
import {Dns} from './pages/Dns';
import {Resources} from './pages/Resources';
import {ConfigPage} from './pages/ConfigPage';
import {Events} from './pages/Events';

type Scheme = 'light dark' | 'light' | 'dark';
export type Go = (route: string, query?: string) => void;
export type PageProps = {go: Go, query: string};

type NavKey = 'nav.activity' | 'nav.overview' | 'nav.connections' | 'nav.clients' | 'nav.policies' | 'nav.rules' | 'nav.dns' | 'nav.resources' | 'nav.config' | 'nav.events';
type GrpKey = 'grp.status' | 'grp.network' | 'grp.proxy' | 'grp.system';
const NAV: Array<[GrpKey | null, Array<[string, NavKey, ComponentType, ComponentType<PageProps>]>]> = [
  ['grp.status', [['activity', 'nav.activity', ChartTrend, Activity], ['overview', 'nav.overview', Home, Overview]]],
  ['grp.network', [['connections', 'nav.connections', LinkIcon, Connections], ['clients', 'nav.clients', DeviceAll, Clients]]],
  ['grp.proxy', [['policies', 'nav.policies', Share, Policies], ['rules', 'nav.rules', ListBulleted, Rules], ['dns', 'nav.dns', GlobeGrid, Dns]]],
  ['grp.system', [['resources', 'nav.resources', Data, Resources], ['config', 'nav.config', FileText, ConfigPage], ['events', 'nav.events', History, Events]]]
];
export const PAGES = Object.fromEntries(NAV.flatMap(([, i]) => i).map(([k, l, , C]) => [k, [l, C] as const]));

// Whole frame capped and centred like the S2 docs site: top bar, side nav and panel share one column.
const shell = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: [240, 'minmax(0, 1fr)']}, gridTemplateRows: ['auto', '1fr'], minHeight: 'screen', width: 'full', maxWidth: 1600, marginX: 'auto'});
// Top bar like the S2 docs site: brand on the left, a wide search in the middle, actions on the right.
const topbar = style({position: 'sticky', top: 0, zIndex: 2, backgroundColor: 'layer-1', gridColumnStart: 1, gridColumnEnd: -1, display: 'grid', gridTemplateColumns: {default: ['auto', 'minmax(0, 1fr)', 'auto'], lg: [216, 'minmax(0, 1fr)', 'auto']}, alignItems: 'center', columnGap: 24, paddingX: {default: 16, lg: 24}, minHeight: {default: 56, lg: 64}});
const brand = style({display: 'flex', alignItems: 'center', gap: 12, font: 'title-lg', fontWeight: 'extra-bold', minHeight: 32});
const brandMark = style({width: 28, height: 28});
const searchWrap = style({display: {default: 'none', lg: 'flex'}, justifyContent: 'center', gridRowStart: 1, gridColumnStart: 2, gridColumnEnd: 3});
const icons = style({display: {default: 'none', lg: 'flex'}, alignItems: 'center', gap: 4, gridRowStart: 1, gridColumnStart: 3});
const mobileMenu = style({display: {default: 'flex', lg: 'none'}, alignItems: 'center', gap: 4, gridRowStart: 1, gridColumnStart: 3, justifySelf: 'end'});
// Same rule as the docs header: 2px, 32px tall, sitting in the 4px gap.
const rule = style({display: 'flex', height: 32, marginX: 4});
const side = style({display: {default: 'none', lg: 'flex'}, flexDirection: 'column', paddingTop: 16, paddingBottom: 16, paddingStart: 24, paddingEnd: 12, position: 'sticky', top: 64, alignSelf: 'start', height: 'calc(100vh - 64px)', boxSizing: 'border-box', overflow: 'auto'});
const sideGrow = style({flexGrow: 1});
const sideFoot = style({flexShrink: 0, paddingTop: 8, paddingStart: 4});
// Version link at the foot of the side nav: quiet, secondary text, sized to its content.
const versionLink = style({...focusRing(), display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, paddingX: 8, borderRadius: 'default', borderWidth: 0, font: 'ui-sm', color: 'gray-700', backgroundColor: {default: 'transparent', isHovered: 'gray-200', isPressed: 'gray-300'}, cursor: 'pointer', boxSizing: 'border-box'});
// Panel like the docs site: rounded top corners only, runs to the bottom of the viewport.
const main = style({marginEnd: {default: 0, lg: 16}, borderTopStartRadius: 'xl', borderTopEndRadius: 'xl', paddingX: {default: 20, lg: 40}, paddingTop: {default: 20, lg: 32}, paddingBottom: {default: 24, lg: 48}, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 32});
const head = style({display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 48, flexWrap: 'wrap'});
// Content column capped like the S2 docs site so cards stop stretching on wide screens.
const content = style({width: 'full', maxWidth: 1120, marginX: 'auto', display: 'flex', flexDirection: 'column', gap: 32, minWidth: 0});
const h1 = style({font: 'heading-xl', margin: 0, flexShrink: 0});
const mobileNav = style({display: {default: 'block', lg: 'none'}, width: 'full'});

function parseHash() { const h = location.hash.replace(/^#\/?/, ''); const [route, query = ''] = h.split('?'); return {route: PAGES[route] ? route : 'activity', query}; }

export function Shell() {
  const [lang, setLang] = useState<Lang>(readLang);
  const pick = (l: Lang) => { setLang(l); try { localStorage.setItem('doona-lang', l); } catch { /* private mode */ } };
  const [scheme, setScheme] = useState<Scheme>(() => { try { return (localStorage.getItem('doona-scheme') as Scheme) || 'light dark'; } catch { return 'light dark'; } });
  const [loc, setLoc] = useState(parseHash);
  useEffect(() => { const f = () => setLoc(parseHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const go: Go = (route, query) => { location.hash = '/' + route + (query ? '?' + query : ''); };
  const navigate = (href: string) => { location.hash = href.replace(/^#/, ''); };
  const pickScheme = (s: Scheme) => { setScheme(s); try { localStorage.setItem('doona-scheme', s); } catch { /* private mode */ } };
  const [titleKey, Page] = PAGES[loc.route];
  return (
    <LangContext.Provider value={lang}><Provider locale={S2_LOCALE[lang]} colorScheme={scheme === 'light dark' ? undefined : scheme} background="layer-1" router={{navigate}}>
      <ToastContainer />
      <Frame lang={lang} pick={pick} scheme={scheme} setScheme={pickScheme} route={loc.route} titleKey={titleKey} go={go} query={loc.query} Page={Page} />
    </Provider></LangContext.Provider>
  );
}

// Follows the OS preference so the toggle icon can show the effective scheme.
// Checkbox-style single choice: multiple-selection look, but only the newly picked key survives.
function pickOne<T extends string>(current: T, apply: (v: T) => void) {
  return (k: 'all' | Set<Key>) => { if (k === 'all') return; const next = [...k].find(x => x !== current); if (next) apply(next as T); };
}
function useSystemDark() {
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const on = () => setDark(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  return dark;
}
const iconStack = style({position: 'relative', size: 20, display: 'block'});
// Same crossfade as the docs site's colour scheme toggle: the two icons rotate and scale past each other in 200 ms.
function ThemeIcon({isDark}: {isDark: boolean}) {
  return (
    <span className={iconStack}>
      <Contrast UNSAFE_style={{position: 'absolute', inset: 0, opacity: isDark ? 0 : 1, transform: isDark ? 'rotate(-90deg) scale(0.5)' : 'rotate(0deg) scale(1)', transition: 'opacity 200ms ease-out, transform 200ms ease-out'}} />
      <Lighten UNSAFE_style={{position: 'absolute', inset: 0, opacity: isDark ? 1 : 0, transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)', transition: 'opacity 200ms ease-out, transform 200ms ease-out'}} />
    </span>
  );
}
function Frame({lang, pick, scheme, setScheme, route, titleKey, go, query, Page}: {lang: Lang, pick: (l: Lang) => void, scheme: Scheme, setScheme: (s: Scheme) => void, route: string, titleKey: NavKey, go: Go, query: string, Page: ComponentType<PageProps>}) {
  const systemDark = useSystemDark();
  // Beyond the 1600px frame the html canvas shows; keep it the same colour as the shell whatever scheme is forced.
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => { for (let el: HTMLElement | null = shellRef.current; el && el !== document.documentElement; el = el.parentElement) { const bg = getComputedStyle(el).backgroundColor; if (bg !== 'rgba(0, 0, 0, 0)') { document.documentElement.style.backgroundColor = bg; return; } } }, [scheme, systemDark]);
  const t = useT();
  return (
      <div ref={shellRef} className={shell}>
        <header className={topbar}>
          <div className={brand}><img className={brandMark} src={logo} alt="" />doona</div>
          <div className={searchWrap}>
            <SearchTrigger placeholder={t('search')} labels={{all: t('search.all'), conns: t('nav.connections'), nodes: t('search.nodes'), rules: t('nav.rules'), none: t('search.none')}} go={go} />
          </div>
          <div className={mobileMenu}>
            <SearchTrigger compact placeholder={t('search')} labels={{all: t('search.all'), conns: t('nav.connections'), nodes: t('search.nodes'), rules: t('nav.rules'), none: t('search.none')}} go={go} />
            <MenuTrigger>
              <ActionButton isQuiet aria-label={t('settings')}><Settings /></ActionButton>
              <Menu>
                <MenuItem onAction={() => toast('neutral', t('refreshed'))}>{t('refresh')}</MenuItem>
                <SubmenuTrigger>
                  <MenuItem>{t('lang')}</MenuItem>
                  <Menu selectionMode="multiple" disallowEmptySelection selectedKeys={[lang]} onSelectionChange={pickOne(lang, pick)}>{LANGS.map(([k, l]) => <MenuItem key={k} id={k}>{l}</MenuItem>)}</Menu>
                </SubmenuTrigger>
                <SubmenuTrigger>
                  <MenuItem>{t('theme')}</MenuItem>
                  <Menu selectionMode="multiple" disallowEmptySelection selectedKeys={[scheme]} onSelectionChange={pickOne(scheme, setScheme)}><MenuItem id="light dark">{t('theme.system')}</MenuItem><MenuItem id="light">{t('theme.light')}</MenuItem><MenuItem id="dark">{t('theme.dark')}</MenuItem></Menu>
                </SubmenuTrigger>
              </Menu>
            </MenuTrigger>
            <TooltipTrigger><ActionButton isQuiet aria-label={t('theme')} onPress={() => setScheme(scheme === 'light dark' ? (systemDark ? 'light' : 'dark') : 'light dark')}><ThemeIcon isDark={scheme === 'dark' || (scheme === 'light dark' && systemDark)} /></ActionButton><Tooltip>{t('theme')}：{scheme === 'light dark' ? t('theme.system') : scheme === 'light' ? t('theme.light') : t('theme.dark')}</Tooltip></TooltipTrigger>
          </div>
          <div className={icons}>
            <TooltipTrigger><ActionButton isQuiet aria-label={t('refresh')} onPress={() => toast('neutral', t('refreshed'))}><Refresh /></ActionButton><Tooltip>{t('refresh')}</Tooltip></TooltipTrigger>
            <div className={rule}><Divider orientation="vertical" size="M" styles={style({alignSelf: 'stretch'})} /></div>
            <MenuTrigger>
              <TooltipTrigger><ActionButton isQuiet aria-label={t('lang')}><Translate /></ActionButton><Tooltip>{t('lang')}</Tooltip></TooltipTrigger>
              <Menu selectionMode="multiple" disallowEmptySelection selectedKeys={[lang]} onSelectionChange={pickOne(lang, pick)}>{LANGS.map(([k, l]) => <MenuItem key={k} id={k}>{l}</MenuItem>)}</Menu>
            </MenuTrigger>
            <TooltipTrigger><ActionButton isQuiet aria-label={t('theme')} onPress={() => setScheme(scheme === 'light dark' ? (systemDark ? 'light' : 'dark') : 'light dark')}><ThemeIcon isDark={scheme === 'dark' || (scheme === 'light dark' && systemDark)} /></ActionButton><Tooltip>{t('theme')}：{scheme === 'light dark' ? t('theme.system') : scheme === 'light' ? t('theme.light') : t('theme.dark')}</Tooltip></TooltipTrigger>
          </div>
        </header>
        <nav className={side}>
          <SideNav aria-label="導覽" selectedRoute={'#/' + route}>
            {NAV.map(([grp, items]) => grp
              ? <SideNavSection key={grp}><SideNavHeader>{t(grp)}</SideNavHeader>{items.map(([k, l, Icon]) => <SideNavItem key={k} id={k} href={'#/' + k} textValue={t(l)}><SideNavItemContent><Icon /><SideNavItemLink>{t(l)}</SideNavItemLink></SideNavItemContent></SideNavItem>)}</SideNavSection>
              : items.map(([k, l, Icon]) => <SideNavItem key={k} id={k} href={'#/' + k} textValue={t(l)}><SideNavItemContent><Icon /><SideNavItemLink>{t(l)}</SideNavItemLink></SideNavItemContent></SideNavItem>))}
          </SideNav>
          <div className={sideGrow} />
          <div className={sideFoot}>
            <TooltipTrigger><Button className={versionLink} onPress={() => window.open('https://github.com/daeuniverse/honk', '_blank')}><GitHub styles={iconStyle({size: 'S', color: 'gray'})} />honk 0.9.3</Button><Tooltip>{t('github')}</Tooltip></TooltipTrigger>
          </div>
        </nav>
        <Provider background="base" styles={main}>
          <div className={content}>
          <div className={head}>
            <h1 className={h1}>{t(titleKey)}</h1>
            <div className={mobileNav}><Picker aria-label={t('page')} selectedKey={route} onSelectionChange={k => k != null && go(String(k))} styles={style({width: 'full'})}>{NAV.flatMap(([, i]) => i).map(([k, l]) => <PickerItem key={k} id={k}>{t(l)}</PickerItem>)}</Picker></div>
          </div>
          <Page go={go} query={query} />
          </div>
        </Provider>
      </div>
  );
}
