import './install';
import {Login} from './Login';
import {Suspense, type ContextType} from 'react';
import {I18nProvider, RouterProvider} from 'react-aria-components';
import {LangContext, LOCALE, useT, type Lang} from '../i18n';
import {Button, ModalDialog, Toasts, LabeledSelect, ErrorMessage, Loading, Empty} from '../ui/ui';
import type {PageProps} from '../features/types';
import {DraftContext} from './route';
import {SearchDialog} from './search/SearchDialog';
import {SettingsContext} from '../features/settings/context';
import type {Settings} from '../features/settings/settings';
import {Shortcuts} from './Shortcuts';
import {SideNav} from './SideNav';
import {TopBar} from './TopBar';
import {AboutContext, useShell, type ShellModel} from './useShell';
import {applyAppearance, readAppearance} from './useAppearance';
import {useShellController, useShellFrame, useStartupToasts} from './useShellController';
import {LoadBoundary} from '../ui/LoadBoundary';

// The startup entry calls this before mounting React to avoid a palette flash.
export function stampAppearance() {
  const {scheme, palette, wordmark} = readAppearance();
  const dark = scheme === 'dark' || (scheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyAppearance(dark, palette, wordmark);
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
      <TopBar
        lang={lang}
        pickLang={pickLang}
        ap={ap}
        mac={mac}
        openSearch={openSearch}
        refresh={view.refresh}
        spinning={view.spinning}
        honk={view.honk}
        wordmark={view.wordmark}
        versionText={view.about.versionText}
        paletteSections={paletteSections}
        menu={menu}
      />
      <SideNav groups={view.groups} busy={view.busy} engine={view.engine} navRef={navRef} navStyle={navStyle} />
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
          <ErrorMessage error={view.error} onRetry={view.refresh} />
          <SettingsContext.Provider value={settingsValue}>
            {view.content.kind === 'login' ? (
              <Login profileId={view.content.profileId} api={view.content.api} backend={view.content.backend} rejected={view.content.rejected} />
            ) : view.content.kind === 'loading' ? (
              <Loading />
            ) : view.content.kind === 'unavailable' ? (
              <Empty>
                {t('shell.notOffered')}
                <Button onPress={() => go('activity')}>{t('shell.toActivity')}</Button>
              </Empty>
            ) : (
              <LoadBoundary key={view.current.id}>
                <Suspense fallback={<Loading />}>
                  <Page go={go} query={query} />
                </Suspense>
              </LoadBoundary>
            )}
          </SettingsContext.Provider>
        </div>
      </main>
    </div>
  );
}
