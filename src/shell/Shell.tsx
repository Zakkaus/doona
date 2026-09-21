import './install';
import {Login} from './Login';
import {Suspense, type ContextType} from 'react';
import {I18nProvider, RouterProvider, Link as RLink, Separator, Menu, MenuSection, Header} from 'react-aria-components';
import Search from '../ui/icons/Search';
import Refresh from '../ui/icons/Refresh';
import Translate from '../ui/icons/Translate';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import logo from '../logo.svg';
import {About} from './About';
import GitHub from '../ui/icons/GitHub';
import {LangContext, LOCALE, useT, type Lang} from '../i18n';
import {Button, ChoiceMenu, ModalDialog, Toasts, LabeledSelect, ErrorMessage, Loading, Empty, Link} from '../ui/ui';
import {MenuButton, MenuChoice, pickMenuKey} from '../ui/ui';
import Color from '../ui/icons/Color';
import type {PageProps} from '../features/types';
import {DraftContext} from './route';
import {warmPage} from './registry';
import {SearchDialog} from './search/SearchDialog';
import {SettingsContext} from '../features/settings/context';
import type {PaletteId, Settings, Wordmark} from '../features/settings/settings';
import {Shortcuts} from './Shortcuts';
import {AboutContext, useShell, type ShellModel} from './useShell';
import {applyAppearance, readAppearance} from './useAppearance';
import {useShellController, useShellFrame, useStartupToasts} from './useShellController';
import {languageItems} from './view';

// The startup entry calls this before mounting React to avoid a palette flash.
export function stampAppearance() {
  const {scheme, palette, wordmark} = readAppearance();
  const dark = scheme === 'dark' || (scheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyAppearance(dark, palette, wordmark);
}

function SchemeIcon({dark}: {dark: boolean}) {
  return (
    <span className="rp-icon-stack" data-dark={dark || undefined}>
      <Contrast className="moon" />
      <Lighten className="sun" />
    </span>
  );
}

export function Shell() {
  const {settings, lang, ap, route, query, go, pending, discard, cancel, searchOpen, pickLang, openSearch, closeSearch, navigate, draft, mac} =
    useShellController();
  return (
    <LangContext.Provider value={lang}>
      <I18nProvider locale={LOCALE[lang]}>
        <RouterProvider navigate={navigate}>
          <DraftContext.Provider value={draft}>
            <ShellFrame settings={settings} lang={lang} pickLang={pickLang} ap={ap} route={route} query={query} go={go} openSearch={openSearch} mac={mac} />
          </DraftContext.Provider>
          <DiscardDialog isOpen={pending !== null} discard={discard} cancel={cancel} />
          {searchOpen && <SearchDialog onClose={closeSearch} go={go} />}
          <ToastHost />
        </RouterProvider>
      </I18nProvider>
    </LangContext.Provider>
  );
}

function DiscardDialog({isOpen, discard, cancel}: {isOpen: boolean; discard: () => void; cancel: () => void}) {
  const t = useT();
  return (
    <ModalDialog
      title={t('config.discardTitle')}
      narrow
      alert
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) cancel();
      }}
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button negative onPress={discard}>
            {t('config.discard')}
          </Button>
        </>
      )}
    >
      <p>{t('config.discardHelp')}</p>
    </ModalDialog>
  );
}

function ToastHost() {
  useStartupToasts();
  return <Toasts />;
}

type FrameProps = {
  settings: Settings;
  lang: Lang;
  pickLang: (l: Lang) => void;
  ap: NonNullable<ContextType<typeof SettingsContext>>['ap'];
  route: string;
  query: string;
  go: PageProps['go'];
  openSearch: () => void;
  mac: boolean;
};
function ShellFrame(props: FrameProps) {
  const view = useShell(props.settings, props.route);
  return (
    <AboutContext.Provider value={view.about}>
      <Frame {...props} view={view} />
      <Shortcuts go={props.go} openSearch={props.openSearch} refresh={view.refresh} mac={props.mac} entries={view.shortcuts} paths={view.shortcutPaths} />
    </AboutContext.Provider>
  );
}
function Frame({lang, pickLang, ap, route, query, go, openSearch, mac, view}: FrameProps & {view: ShellModel}) {
  const t = useT();
  const {paletteSections, settingsValue, menu, navRef, navStyle} = useShellFrame(lang, pickLang, ap, route);
  const Page = view.current.Page;
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <About
          onHonk={view.honk}
          trigger={
            <Button className="rp-brand" label={t('about.title')}>
              <img src={logo} alt="" />
              <span className="rp-brand-text">
                <span>{view.wordmark}</span>
                <span className="rp-brand-version">{view.about.versionText}</span>
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
          <Button quiet icon label={t('refresh')} isPending={view.spinning} onPress={view.refresh}>
            <Refresh />
          </Button>
          <Separator orientation="vertical" className="rp-vrule" />
          <ChoiceMenu quiet chevron={false} label={t('lang')} value={lang} onChange={k => pickLang(k as Lang)} items={languageItems}>
            <Translate />
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
            <Color />
          </MenuButton>
          <Button quiet icon label={menu.themeLabel} onPress={ap.toggle}>
            <SchemeIcon dark={ap.dark} />
          </Button>
        </div>
      </header>
      <nav className="rp-side" ref={navRef} aria-busy={view.busy || undefined}>
        {navStyle && <span className="rp-nav-slider" style={navStyle} />}
        {view.groups.map(group => (
          <div key={group.id} data-group={group.id}>
            <div className="rp-group">{group.label}</div>
            {group.items.map(item => (
              <RLink
                key={item.id}
                className="rp-nav"
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                data-unavailable={item.unavailable ? '' : undefined}
                aria-description={item.description}
                onHoverStart={() => warmPage(item.id)}
                onFocus={() => warmPage(item.id)}
              >
                <item.Icon />
                {item.label}
              </RLink>
            ))}
          </div>
        ))}
        <div className="rp-side-grow" />
        <Link appearance="version" href={view.engine.href} external label={t('github')}>
          <GitHub />
          {view.engine.text}
        </Link>
      </nav>
      <main className="rp-main">
        <div className="rp-content">
          <div className="rp-head">
            <div className="rp-title">
              <h1 className="rp-h1">{view.current.title}</h1>
              {view.current.hint && <span className="rp-hint">{view.current.hint}</span>}
            </div>
            <div className="rp-mobile-nav">
              <LabeledSelect label={t('page')} value={route} onChange={k => go(k)} items={view.choices} bare />
            </div>
          </div>
          <ErrorMessage error={view.error} />
          <SettingsContext.Provider value={settingsValue}>
            {view.content.kind === 'login' ? (
              <Login backend={view.content.backend} rejected={view.content.rejected} />
            ) : view.content.kind === 'loading' ? (
              <Loading />
            ) : view.content.kind === 'unavailable' ? (
              <Empty>
                {t('shell.notOffered')}
                <Button onPress={() => go('activity')}>{t('shell.toActivity')}</Button>
              </Empty>
            ) : (
              <Suspense key={view.current.id} fallback={<Loading />}>
                <Page go={go} query={query} />
              </Suspense>
            )}
          </SettingsContext.Provider>
        </div>
      </main>
    </div>
  );
}
