import {memo, useRef, useState} from 'react';
import {PhoneWidgets} from './widgets/host';
import {About} from './About';
import {BackendMenuPopover} from './Backend';
import Checkmark from '../ui/icons/Checkmark';
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
import {ReloadConfirm} from '../features/shared/ReloadConfirm';
import type {SettingsContext} from './preferences';
import type {Scheme} from './preferences';
import type {AppearanceMenu, BackendView, PaletteSection, TopBarCommands} from './view';
import {languageItems} from './view';
import {preloadSearch} from './search/load';
import {href} from './route';
import {LanguageMenu, PaletteMenu, SchemeToggle, usePaletteChoices} from './AppearanceControls';

type Appearance = NonNullable<React.ContextType<typeof SettingsContext>>['ap'];

type TopBarProps = {
  route: string;
  lang: Lang;
  pickLang: (lang: Lang) => void;
  ap: Appearance;
  mac: boolean;
  openSearch: () => void;
  refresh: () => void;
  spinning: boolean;
  commands: TopBarCommands;
  apply: () => void;
  reload: () => void;
  honk: () => void;
  backend: BackendView;
  wordmark: string;
  versionText: string;
  paletteSections: PaletteSection[];
  menu: AppearanceMenu;
};

// Route changes close the phone widget drawer; query-only updates keep the top bar memoised.
export const TopBar = memo(function TopBar({
  route,
  lang,
  pickLang,
  ap,
  mac,
  openSearch,
  refresh,
  spinning,
  commands,
  apply,
  reload,
  honk,
  backend,
  wordmark,
  versionText,
  paletteSections,
  menu
}: TopBarProps) {
  const t = useT();
  const {palettes} = usePaletteChoices({ap, paletteSections});
  const narrowMenu = useRef<HTMLSpanElement>(null);
  const [backendOpen, setBackendOpen] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const askReload = () => setConfirmReload(true);
  const appearance = {label: t('ui.appearanceSettings'), onAction: () => location.assign(href('settings', {tab: 'appearance'}))};
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
          <span className="grow">{t('shell.search')}</span>
          <span className="rp-kbd">{mac ? t('shell.macShortcut') : t('shell.shortcut')}</span>
        </Button>
      </div>
      <div className="rp-actions">
        <PhoneWidgets route={route} backend={backend} />
        <span className="rp-search-compact" onPointerEnter={preloadSearch} onFocus={preloadSearch}>
          <Button quiet icon label={t('shell.search')} onPress={openSearch}>
            <Search />
          </Button>
        </span>
        <Button quiet icon label={t('ui.refresh')} isPending={spinning} onPress={refresh}>
          <DataRefresh />
        </Button>
        {commands.apply && (
          <Button
            quiet
            icon
            className="rp-held"
            label={commands.apply.label}
            isPending={commands.apply.busy}
            isDisabled={commands.apply.blocked}
            onPress={apply}
          >
            <Checkmark />
            <span className="rp-held-count">{commands.apply.count}</span>
          </Button>
        )}
        {/* Below the side navigation's breakpoint, reload, language and appearance share one overflow menu. */}
        <span className="rp-wide-only">
          {commands.reload && (
            <Button quiet icon label={commands.reload.label} isPending={commands.reload.busy} isDisabled={commands.reload.blocked} onPress={askReload}>
              <Refresh className="rp-spin-on-press" />
            </Button>
          )}
          <Divider />
          <LanguageMenu lang={lang} pickLang={pickLang} />
          <PaletteMenu ap={ap} paletteSections={paletteSections} more={appearance} />
          <SchemeToggle dark={ap.dark} label={menu.themeLabel} toggle={ap.toggle} />
        </span>
        <span className="rp-narrow-only" ref={narrowMenu}>
          <ChoiceMenu
            quiet
            chevron={false}
            label={t('ui.moreOptions')}
            submenus={[
              {
                label: t('ui.lang'),
                icon: <Translate />,
                sections: [{title: t('ui.lang'), items: languageItems, value: lang, onChange: k => pickLang(k as Lang)}]
              },
              {
                label: t('ui.theme'),
                icon: <Contrast />,
                sections: [{title: t('ui.theme'), items: menu.schemes, value: ap.scheme, onChange: k => ap.pickScheme(k as Scheme)}]
              },
              {label: t('ui.palette'), icon: <Color />, sections: palettes, actions: [appearance]}
            ]}
            actions={[
              ...(commands.reload ? [{label: commands.reload.label, icon: <Refresh />, onAction: askReload}] : []),
              {label: backend.title, icon: <Data />, onAction: () => setBackendOpen(true)}
            ]}
          >
            <MoreVertical />
          </ChoiceMenu>
          <BackendMenuPopover backend={backend} honk={honk} anchor={narrowMenu} isOpen={backendOpen} onOpenChange={setBackendOpen} />
        </span>
      </div>
      <ReloadConfirm
        isOpen={confirmReload && !!commands.reload}
        onCancel={() => setConfirmReload(false)}
        isPending={commands.reload?.busy}
        isDisabled={commands.reload?.blocked}
        onConfirm={() => {
          setConfirmReload(false);
          reload();
        }}
      />
    </header>
  );
});
