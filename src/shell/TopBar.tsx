import {memo, useState} from 'react';
import {Header, Menu, MenuSection, Separator} from 'react-aria-components';
import {About} from './About';
import Color from '../ui/icons/Color';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import Refresh from '../ui/icons/Refresh';
import Search from '../ui/icons/Search';
import Translate from '../ui/icons/Translate';
import logo from '../logo.svg';
import {useT, type Lang} from '../i18n';
import {Button, ChoiceMenu, MenuButton, MenuChoice, pickMenuKey} from '../ui/ui';
import type {SettingsContext} from '../features/settings/context';
import type {PaletteId, Wordmark} from '../features/settings/settings';
import type {AppearanceMenu, PaletteSection} from './view';
import {languageItems} from './view';

type Appearance = NonNullable<React.ContextType<typeof SettingsContext>>['ap'];

function SchemeIcon({dark}: {dark: boolean}) {
  return (
    <span className="rp-icon-stack" data-dark={dark || undefined}>
      <Contrast className="moon" />
      <Lighten className="sun" />
    </span>
  );
}

type TopBarProps = {
  lang: Lang;
  pickLang: (lang: Lang) => void;
  ap: Appearance;
  mac: boolean;
  openSearch: () => void;
  refresh: () => void;
  spinning: boolean;
  honk: () => void;
  wordmark: string;
  versionText: string;
  paletteSections: PaletteSection[];
  menu: AppearanceMenu;
};

// The top bar depends on appearance, language and the engine's version, not on the open page or its query,
// so it is memoised: moving between pages or tabs leaves it alone.
export const TopBar = memo(function TopBar({
  lang,
  pickLang,
  ap,
  mac,
  openSearch,
  refresh,
  spinning,
  honk,
  wordmark,
  versionText,
  paletteSections,
  menu
}: TopBarProps) {
  const t = useT();
  // The language and palette icons turn in when their value changes, like the scheme icon; not on first paint.
  const [first] = useState({lang, palette: ap.palette});
  return (
    <header className="rp-top">
      <About
        onHonk={honk}
        trigger={
          <Button className="rp-brand" tip={t('about.title')}>
            <img src={logo} alt="" />
            <span className="rp-brand-text">
              <span>{wordmark}</span>
              <span className="rp-brand-version">{versionText}</span>
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
        <Button quiet icon label={t('refresh')} isPending={spinning} onPress={refresh}>
          <Refresh className="rp-refresh rp-spin-on-press" />
        </Button>
        <Separator orientation="vertical" className="rp-vrule" />
        <ChoiceMenu quiet chevron={false} label={t('lang')} value={lang} onChange={k => pickLang(k as Lang)} items={languageItems}>
          <Translate key={lang} className={lang !== first.lang ? 'rp-icon-in' : undefined} />
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
                {menu.wordmarks.map(item => (
                  <MenuChoice key={item.id} item={item} />
                ))}
              </MenuSection>
            </Menu>
          }
        >
          <Color key={ap.palette} className={ap.palette !== first.palette ? 'rp-icon-in' : undefined} />
        </MenuButton>
        <Button quiet icon label={menu.themeLabel} onPress={ap.toggle}>
          <SchemeIcon dark={ap.dark} />
        </Button>
      </div>
    </header>
  );
});
