import {useEffect, useState} from 'react';
import {Provider} from '@react-spectrum/s2/Provider';
import {SideNav, SideNavHeader, SideNavItem, SideNavItemContent, SideNavItemLink, SideNavSection} from '@react-spectrum/s2/SideNav';
import {SearchField} from '@react-spectrum/s2/SearchField';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {ActionButtonGroup} from '@react-spectrum/s2/ActionButtonGroup';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {Text} from '@react-spectrum/s2/Text';
import {TooltipTrigger, Tooltip} from '@react-spectrum/s2/Tooltip';
import {ToastContainer} from '@react-spectrum/s2/Toast';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import Contrast from '@react-spectrum/s2/icons/Contrast';
import {DesignPage} from './DesignPage';
import logo from './logo.svg';

type Scheme = 'light dark' | 'light' | 'dark';

const shell = style({
  display: 'grid',
  gridTemplateColumns: {default: ['1fr'], lg: [260, 'minmax(0, 1fr)']},
  gridTemplateRows: ['auto', '1fr'],
  minHeight: 'screen'
});
const topbar = style({
  gridColumnStart: 1,
  gridColumnEnd: -1,
  display: 'grid',
  gridTemplateColumns: {default: ['auto', 'minmax(0, 1fr)', 'auto'], lg: [236, 'minmax(280px, 640px)', 'auto', '1fr', 'auto']},
  alignItems: 'center',
  gap: {default: 12, lg: 24},
  paddingX: {default: 16, lg: 24},
  height: 64
});
const desktopOnly = style({display: {default: 'none', lg: 'flex'}, alignItems: 'center', gap: 16});
const mobileBar = style({display: {default: 'block', lg: 'none'}, gridColumnStart: 1, gridColumnEnd: -1, paddingX: 16, paddingBottom: 12});
const brand = style({display: 'flex', alignItems: 'center', gap: 12, font: 'title-lg', fontWeight: 'extra-bold'});
const brandMark = style({width: 28, height: 28});
const sidebar = style({
  display: {default: 'none', lg: 'block'},
  paddingTop: 8,
  paddingBottom: 40,
  paddingStart: 32,
  paddingEnd: 16,
  position: 'sticky',
  top: 64,
  alignSelf: 'start',
  maxHeight: 'calc(100vh - 64px)',
  overflow: 'auto'
});
const panel = style({
  marginEnd: {default: 12, lg: 24},
  marginStart: {default: 12, lg: 0},
  marginBottom: 40,
  borderRadius: 'xl',
  paddingX: {default: 20, lg: 32},
  paddingTop: {default: 28, lg: 56},
  paddingBottom: {default: 48, lg: 80},
  minWidth: 0
});

const SECTIONS: Array<[string, Array<[string, string]>]> = [
  [
    '設計語言',
    [
      ['pos', '定位'],
      ['shell', '應用骨架'],
      ['spec', '規範'],
      ['color', '色彩']
    ]
  ],
  [
    '元件',
    [
      ['controls', '控件'],
      ['conns', '連線與就地操作'],
      ['policies', '策略'],
      ['rules', '規則表'],
      ['config', '配置編輯器']
    ]
  ],
  ['產品', [['skeleton', '頁面骨架']]]
];

export function App() {
  const [scheme, setScheme] = useState<Scheme>(() => {
    try {
      return (localStorage.getItem('doona-scheme') as Scheme) || 'light dark';
    } catch {
      return 'light dark';
    }
  });
  const [route, setRoute] = useState(() => location.hash.slice(1) || 'pos');
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || 'pos');
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const pick = (s: Scheme) => {
    setScheme(s);
    try {
      localStorage.setItem('doona-scheme', s);
    } catch {
      /* private mode */
    }
  };
  const cycle = () => pick(scheme === 'light dark' ? 'light' : scheme === 'light' ? 'dark' : 'light dark');
  const navigate = (href: string) => {
    location.hash = href.replace(/^#/, '');
  };

  return (
    <Provider locale="zh-TW" colorScheme={scheme === 'light dark' ? undefined : scheme} background="layer-1" router={{navigate}}>
      <ToastContainer />
      <div className={shell}>
        <header className={topbar}>
          <div className={brand}>
            <img className={brandMark} src={logo} alt="" />
            doona
          </div>
          <SearchField aria-label="搜尋" placeholder="搜尋設計語言" />
          <nav className={desktopOnly + ' ' + style({gridColumnEnd: {lg: 'span 2'}})}>
            <ActionButtonGroup isQuiet>
              <ActionButton onPress={() => navigate('#spec')}>
                <Text>規範</Text>
              </ActionButton>
              <ActionButton onPress={() => navigate('#controls')}>
                <Text>元件</Text>
              </ActionButton>
              <ActionButton onPress={() => navigate('#skeleton')}>
                <Text>頁面骨架</Text>
              </ActionButton>
            </ActionButtonGroup>
          </nav>
          <TooltipTrigger>
            <ActionButton isQuiet aria-label="切換主題" onPress={cycle}>
              <Contrast />
            </ActionButton>
            <Tooltip>主題：{scheme === 'light dark' ? '跟隨系統' : scheme === 'light' ? '亮' : '暗'}</Tooltip>
          </TooltipTrigger>
        </header>
        <div className={mobileBar}>
          <Picker aria-label="章節" selectedKey={route} onSelectionChange={k => k != null && navigate('#' + String(k))} styles={style({width: 'full'})}>
            {SECTIONS.flatMap(([, items]) => items).map(([id, label]) => (
              <PickerItem key={id} id={id}>
                {label}
              </PickerItem>
            ))}
          </Picker>
        </div>
        <nav className={sidebar}>
          <SideNav aria-label="目錄" selectedRoute={'#' + route}>
            {SECTIONS.map(([title, items]) => (
              <SideNavSection key={title}>
                <SideNavHeader>{title}</SideNavHeader>
                {items.map(([id, label]) => (
                  <SideNavItem key={id} id={id} href={'#' + id} textValue={label}>
                    <SideNavItemContent>
                      <SideNavItemLink>{label}</SideNavItemLink>
                    </SideNavItemContent>
                  </SideNavItem>
                ))}
              </SideNavSection>
            ))}
          </SideNav>
        </nav>
        <Provider background="base" styles={panel}>
          <DesignPage scheme={scheme} />
        </Provider>
      </div>
    </Provider>
  );
}
