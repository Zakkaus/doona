import {memo, useRef, useState} from 'react';
import {About} from './About';
import {BackendMenuPopover} from './Backend';
import Checkmark from '../ui/icons/Checkmark';
import MoreVertical from '../ui/icons/MoreVertical';
import Data from '../ui/icons/Data';
import DataRefresh from '../ui/icons/DataRefresh';
import Refresh from '../ui/icons/Refresh';
import Search from '../ui/icons/Search';
import logo from '../logo.svg';
import {useT} from '../i18n';
import {Button, ChoiceMenu, Divider, Link} from '../ui/ui';
import {ReloadConfirm} from '../features/shared/ReloadConfirm';
import type {BackendView, TopBarCommands} from './view';
import Settings from '../ui/icons/Settings';
import {appearanceSettingsHref} from '../features/shared/link';
import {SchemeToggle} from './AppearanceControls';
import type {SettingsContext} from './preferences';
import {preloadSearch} from './search/load';

type TopBarProps = {
  ap: NonNullable<React.ContextType<typeof SettingsContext>>['ap'];
  openAppearance: () => void;
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
};

// The top bar depends on appearance, language and the backend's version and state, not on the open page or its query,
// so it is memoised: moving between pages or tabs leaves it alone.
export const TopBar = memo(function TopBar({
  ap,
  openAppearance,
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
  versionText
}: TopBarProps) {
  const t = useT();
  const narrowMenu = useRef<HTMLSpanElement>(null);
  const [backendOpen, setBackendOpen] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const askReload = () => setConfirmReload(true);
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
        <span className="rp-wide-only">
          {commands.reload && (
            <Button quiet icon label={commands.reload.label} isPending={commands.reload.busy} isDisabled={commands.reload.blocked} onPress={askReload}>
              <Refresh className="rp-refresh rp-spin-on-press" />
            </Button>
          )}
          <Divider />
          <Link appearance="button" quiet icon label={t('settings.appearance')} href={appearanceSettingsHref}>
            <Settings />
          </Link>
          <SchemeToggle
            dark={ap.dark}
            label={t('shell.theme', {theme: t(ap.scheme === 'system' ? 'theme.system' : ap.dark ? 'theme.dark' : 'theme.light')})}
            toggle={ap.toggle}
          />
        </span>
        <span className="rp-narrow-only" ref={narrowMenu}>
          <ChoiceMenu
            quiet
            chevron={false}
            label={t('ui.moreOptions')}
            submenus={[]}
            actions={[
              {label: t('settings.appearance'), icon: <Settings />, onAction: openAppearance},
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
