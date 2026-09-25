import {memo, useState} from 'react';
import {Separator} from 'react-aria-components';
import {About} from './About';
import Color from '../ui/icons/Color';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import MoreVertical from '../ui/icons/MoreVertical';
import DataRefresh from '../ui/icons/DataRefresh';
import Refresh from '../ui/icons/Refresh';
import Search from '../ui/icons/Search';
import Translate from '../ui/icons/Translate';
import logo from '../logo.svg';
import {useT, type Lang} from '../i18n';
import {Button, ChoiceMenu} from '../ui/ui';
import type {SettingsContext} from './preferences';
import type {PaletteId, Scheme, Wordmark} from './preferences';
import type {AppearanceMenu, PaletteSection} from './view';
import {languageItems} from './view';
import {preloadSearch} from './search/load';

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
  // Null when the backend offers no reload and no rules are held.
  reload: (() => void) | null;
  reloading: boolean;
  held: number;
  reloadLabel: string;
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
  reload,
  reloading,
  held,
  reloadLabel,
  honk,
  wordmark,
  versionText,
  paletteSections,
  menu
}: TopBarProps) {
  const t = useT();
  // The language and palette icons turn in when their value changes, like the scheme icon; not on first paint.
  const [first] = useState({lang, palette: ap.palette});
  const paletteMenu = [
    ...paletteSections.map(section => ({...section, value: ap.palette, onChange: (k: string) => ap.pickPalette(k as PaletteId)})),
    {title: t('wordmark'), items: menu.wordmarks, value: ap.wordmark, onChange: (k: string) => ap.pickWordmark(k as Wordmark)}
  ];
  return (
    <header className="rp-top">
      <About
        onHonk={honk}
        trigger={
          <Button appearance="plain" className="rp-brand" tip={t('about.title')}>
            <img src={logo} alt="" />
            <span className="rp-brand-text">
              <span>{wordmark}</span>
              <span className="rp-brand-version">{versionText}</span>
            </span>
          </Button>
        }
      />
      <div className="rp-search-wrap" onPointerEnter={preloadSearch} onFocus={preloadSearch}>
        <Button appearance="plain" className="rp-search" onPress={openSearch}>
          <Search />
          <span className="grow">{t('search')}</span>
          <span className="rp-kbd">{mac ? t('shell.macShortcut') : t('shell.shortcut')}</span>
        </Button>
      </div>
      <div className="rp-actions">
        <span className="rp-search-compact" onPointerEnter={preloadSearch} onFocus={preloadSearch}>
          <Button quiet icon label={t('search')} onPress={openSearch}>
            <Search />
          </Button>
        </span>
        <Button quiet icon label={t('refresh')} isPending={spinning} onPress={refresh}>
          <DataRefresh />
        </Button>
        {reload && (
          <Button quiet icon className="rp-held" label={reloadLabel} isPending={reloading} onPress={reload}>
            <Refresh className="rp-refresh rp-spin-on-press" />
            {!!held && <span className="rp-held-count">{held}</span>}
          </Button>
        )}
        {/* Below the side navigation's breakpoint, language and appearance share one overflow menu. */}
        <span className="rp-wide-only">
          <Separator orientation="vertical" className="rp-vrule" />
          <ChoiceMenu quiet chevron={false} label={t('lang')} value={lang} onChange={k => pickLang(k as Lang)} items={languageItems}>
            <Translate key={lang} className={lang !== first.lang ? 'rp-icon-in' : undefined} />
          </ChoiceMenu>
          <ChoiceMenu quiet chevron={false} label={t('palette')} sections={paletteMenu}>
            <Color key={ap.palette} className={ap.palette !== first.palette ? 'rp-icon-in' : undefined} />
          </ChoiceMenu>
          <Button quiet icon label={menu.themeLabel} onPress={ap.toggle}>
            <SchemeIcon dark={ap.dark} />
          </Button>
        </span>
        <span className="rp-narrow-only">
          <ChoiceMenu
            quiet
            chevron={false}
            label={t('moreOptions')}
            sections={[
              {title: t('lang'), items: languageItems, value: lang, onChange: k => pickLang(k as Lang)},
              {title: t('theme'), items: menu.schemes, value: ap.scheme, onChange: k => ap.pickScheme(k as Scheme)},
              ...paletteMenu
            ]}
          >
            <MoreVertical />
          </ChoiceMenu>
        </span>
      </div>
    </header>
  );
});
