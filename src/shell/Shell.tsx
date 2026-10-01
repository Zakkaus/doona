import './install';
import {lazy, Suspense, useCallback, useState, type ContextType} from 'react';
import {I18nProvider, RouterProvider} from 'react-aria-components';
import {LangContext, LOCALE, RewordingContext, useT, type Lang} from '../i18n';
import {Button, ConfirmDialog, Toasts, ErrorMessage, Loading, Empty} from '../ui/ui';
import {DraftContext} from './draft';
import {searchDialog} from './search/load';
import {CountryFlagsContext, FlagEditingContext} from '../ui/NodeName';
import {flagKey} from '../dae/flags';
import {resolvedFlag} from '../features/shared/countryFlags';
import {readSettings, SettingsContext} from './preferences';
import type {Settings, ToastPlacement} from './preferences';
import {Shortcuts} from './Shortcuts';
import {SideNav} from './SideNav';
import {HubBar, HubPages} from './HubBar';
import {TopBar} from './TopBar';
import {AboutContext, useShell, type ShellModel} from './useShell';
import {applyAppearance} from './useAppearance';
import {paletteWords} from './palettes';
import {useShellController, useShellFrame, useStartupToasts} from './useShellController';
import {LoadBoundary} from '../ui/LoadBoundary';
import type {PageProps} from './routes';
import {RefusalWait} from './RefusalWait';
const FlagPicker = lazy(() => import('../ui/FlagPicker').then(module => ({default: module.FlagPicker})));

// Only a backend that refuses the request needs the sign-in forms, so they load on demand.
const Login = lazy(() => import('./Login').then(module => ({default: module.Login})));

// The startup entry calls this before mounting React to avoid a palette flash.
export function stampAppearance() {
  const {scheme, palette, wordmark} = readSettings();
  const dark = scheme === 'dark' || (scheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyAppearance(dark, palette, wordmark);
}

export function Shell({lang: initial}: {lang: Lang}) {
  const {settings, lang, ap, route, query, go, pending, discard, cancel, searchOpen, pickLang, openSearch, closeSearch, navigate, draft, mac} =
    useShellController(initial);
  const [flagTarget, setFlagTarget] = useState<{name: string} | null>(null);
  const editFlag = useCallback((name: string) => setFlagTarget({name}), []);
  const lookupFlag = useCallback((name: string) => resolvedFlag(name, ap.flagOverrides, ap.countryFlags), [ap.flagOverrides, ap.countryFlags]);
  return (
    <LangContext.Provider value={lang}>
      <CountryFlagsContext.Provider value={lookupFlag}>
        <FlagEditingContext.Provider value={editFlag}>
          <RewordingContext.Provider value={paletteWords(ap.palette)}>
            {/* The mirrored layout turns React Aria right to left too; the locale keeps its strings and formats. */}
            <I18nProvider locale={LOCALE[lang]} direction={ap.mirrored ? 'rtl' : undefined}>
              <RouterProvider navigate={navigate}>
                <DraftContext.Provider value={draft}>
                  <ShellFrame
                    settings={settings}
                    lang={lang}
                    pickLang={pickLang}
                    ap={ap}
                    route={route}
                    query={query}
                    go={go}
                    openSearch={openSearch}
                    mac={mac}
                  />
                </DraftContext.Provider>
                <DiscardDialog isOpen={pending !== null} discard={discard} cancel={cancel} />
                {searchOpen && (
                  <LoadBoundary>
                    <Suspense fallback={null}>
                      <searchDialog.Component onClose={closeSearch} go={go} />
                    </Suspense>
                  </LoadBoundary>
                )}
                {flagTarget && (
                  <LoadBoundary>
                    <Suspense fallback={null}>
                      <FlagPicker
                        name={flagTarget.name}
                        automaticFlag={resolvedFlag(flagTarget.name, {}, true)}
                        value={ap.flagOverrides[flagKey(flagTarget.name)] ?? 'automatic'}
                        onChange={value => ap.pickFlag(flagTarget.name, value)}
                        onClose={() => setFlagTarget(null)}
                      />
                    </Suspense>
                  </LoadBoundary>
                )}
                <ToastHost placement={ap.toastPlacement} route={route} />
              </RouterProvider>
            </I18nProvider>
          </RewordingContext.Provider>
        </FlagEditingContext.Provider>
      </CountryFlagsContext.Provider>
    </LangContext.Provider>
  );
}

function DiscardDialog({isOpen, discard, cancel}: {isOpen: boolean; discard: () => void; cancel: () => void}) {
  const t = useT();
  return (
    <ConfirmDialog title={t('config.discardTitle')} isOpen={isOpen} onCancel={cancel} confirmLabel={t('config.discard')} onConfirm={discard}>
      <p className="rp-label">{t('config.discardHelp')}</p>
    </ConfirmDialog>
  );
}

function ToastHost({placement, route}: {placement: ToastPlacement; route: string}) {
  useStartupToasts();
  return <Toasts placement={placement} page={route} />;
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
  const hub = view.groups.find(group => group.items.some(item => item.current));
  // Signing in takes the whole page: the shell around it would offer nothing that works yet.
  if (view.content.kind === 'login')
    return (
      <Suspense fallback={<Loading />}>
        <Login
          profileId={view.content.profileId}
          api={view.content.api}
          backend={view.content.backend}
          rejected={view.content.rejected}
          missingApi={view.content.missingApi}
          lang={lang}
          pickLang={pickLang}
          dark={ap.dark}
          themeLabel={menu.themeLabel}
          toggleScheme={ap.toggle}
          palette={{ap, paletteSections, wordmarks: menu.wordmarks}}
          wordmark={view.wordmark}
          error={view.error}
          onRetry={view.refresh}
        />
      </Suspense>
    );
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
        commands={view.commands}
        apply={view.apply}
        reload={view.reload}
        honk={view.honk}
        backend={view.backend}
        wordmark={view.wordmark}
        versionText={view.about.versionText}
        paletteSections={paletteSections}
        menu={menu}
      />
      <SideNav groups={view.groups} busy={view.busy} backend={view.backend} honk={view.honk} navRef={navRef} navStyle={navStyle} />
      <main className="rp-main">
        <div className="rp-content">
          <div className="rp-head">
            <div className="rp-title">
              <h1 className="rp-h1">{view.current.title}</h1>
              {view.current.hint && <span className="rp-hint">{view.current.hint}</span>}
            </div>
            {hub && <HubPages key={hub.id} hub={hub} />}
          </div>
          <ErrorMessage error={view.error} onRetry={view.refresh} />
          <RefusalWait />
          <SettingsContext.Provider value={settingsValue}>
            {view.content.kind === 'loading' ? (
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
      <HubBar groups={view.groups} />
    </div>
  );
}
