import {memo, useRef, useState} from 'react';
import {About} from './About';
import {BackendMenuPopover} from './Backend';
import Color from '../ui/icons/Color';
import Contrast from '../ui/icons/Contrast';
import MoreVertical from '../ui/icons/MoreVertical';
import Data from '../ui/icons/Data';
import DataRefresh from '../ui/icons/DataRefresh';
import Refresh from '../ui/icons/Refresh';
import Search from '../ui/icons/Search';
import Translate from '../ui/icons/Translate';
import logo from '../logo.svg';
import {useT, type Lang} from '../i18n';
import {Button, ChoiceMenu, Divider} from '../ui/ui';
import type {SettingsContext} from './preferences';
import type {Scheme} from './preferences';
import type {AppearanceMenu, BackendView, PaletteSection} from './view';
import {languageItems} from './view';
import {preloadSearch} from './search/load';
import {LanguageMenu, PaletteMenu, SchemeToggle, usePaletteChoices} from './AppearanceControls';

type Appearance = NonNullable<React.ContextType<typeof SettingsContext>>['ap'];

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
  backend: BackendView;
  wordmark: string;
  versionText: string;
  paletteSections: PaletteSection[];
  menu: AppearanceMenu;
};

// The top bar depends on appearance, language and the backend's version and state, not on the open page or its query,
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
  backend,
  wordmark,
  versionText,
  paletteSections,
  menu
}: TopBarProps) {
  const t = useT();
  const {palettes, wordmarks} = usePaletteChoices({ap, paletteSections, wordmarks: menu.wordmarks});
  const narrowMenu = useRef<HTMLSpanElement>(null);
  const [backendOpen, setBackendOpen] = useState(false);
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
        {/* Below the side navigation's breakpoint, language and appearance share one overflow menu, a submenu each. */}
        <span className="rp-wide-only">
          <Divider />
          <LanguageMenu lang={lang} pickLang={pickLang} />
          <PaletteMenu ap={ap} paletteSections={paletteSections} wordmarks={menu.wordmarks} />
          <SchemeToggle dark={ap.dark} label={menu.themeLabel} toggle={ap.toggle} />
        </span>
        <span className="rp-narrow-only" ref={narrowMenu}>
          <ChoiceMenu
            quiet
            chevron={false}
            label={t('moreOptions')}
            submenus={[
              {label: t('lang'), icon: <Translate />, sections: [{title: t('lang'), items: languageItems, value: lang, onChange: k => pickLang(k as Lang)}]},
              {
                label: t('theme'),
                icon: <Contrast />,
                sections: [{title: t('theme'), items: menu.schemes, value: ap.scheme, onChange: k => ap.pickScheme(k as Scheme)}]
              },
              {label: t('palette'), icon: <Color />, sections: palettes},
              {label: t('wordmark'), icon: <img src={logo} alt="" />, sections: [wordmarks]}
            ]}
            actions={[{label: backend.title, icon: <Data />, onAction: () => setBackendOpen(true)}]}
          >
            <MoreVertical />
          </ChoiceMenu>
          <BackendMenuPopover backend={backend} honk={honk} anchor={narrowMenu} isOpen={backendOpen} onOpenChange={setBackendOpen} />
        </span>
      </div>
    </header>
  );
});
