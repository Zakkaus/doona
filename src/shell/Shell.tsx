import './install';
import {lazy, Suspense, useCallback, useState, type ComponentProps, type ReactNode} from 'react';
import {I18nProvider, RouterProvider} from 'react-aria-components';
import {LangContext, LOCALE, RewordingContext, useT, type Lang} from '../i18n';
import {ConfirmDialog, Toasts, ErrorMessage, Loading, PageSkeleton} from '../ui/ui';
import {DraftContext, useDraftGuard} from './draft';
import {useModeDraft} from '../features/shared/useModeDraft';
import {searchDialog} from './search/load';
import {CountryFlagsContext, FlagEditingContext} from '../ui/NodeName';
import {flagKey} from '../dae/flags';
import {resolvedFlag} from '../features/shared/countryFlags';
import {useCopyDiagnostics} from '../features/shared/useCopyDiagnostics';
import {readSettings} from './preferences';
import type {ToastPlacement} from './preferences';
import {useShell, type ShellModel} from './useShell';
import {applyAppearance} from './useAppearance';
import {paletteWords} from './palettes';
import {useShellController, useShellFrame, useStartupToasts} from './useShellController';
import {LoadBoundary} from '../ui/LoadBoundary';
import {preloadable} from '../ui/preloadable';
import {expectsAccess} from '../api';
import logo from '../logo.svg';
import type {Frame, FrameProps} from './Frame';
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
  const {settings, lang, ap, route, query, go, confirming, discard, cancel, searchOpen, pickLang, openSearch, closeSearch, navigate, draft, mac} =
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
                  <ModeDraftGuard />
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
                <DiscardDialog isOpen={confirming} discard={discard} cancel={cancel} />
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

// The outbound mode staged in a widget or on Activity outlives the frame: a refused read that turns the tab to the
// sign-in page still warns before the reload that signing in again starts.
function ModeDraftGuard() {
  const [draft, setDraft] = useModeDraft();
  useDraftGuard(draft !== null, () => setDraft(null));
  return null;
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
  const copy = useCopyDiagnostics();
  return <Toasts placement={placement} page={route} onCopyError={entry => void copy([entry])} />;
}

// The signed-in frame shares the Activity page's chunk. A tab that expects to be let in requests it at startup beside
// the capabilities read; any other tab requests it once the backend accepts it, so the sign-in page does not load it.
const frame = preloadable<ComponentProps<typeof Frame>>(() => import('./Frame').then(module => ({default: module.Frame})));
export const preloadFrame = () => void frame.preload().catch(() => undefined);

// What startup shows before the shell: the brand over the given content. The shell shows the same while the frame loads.
export function StartupFrame({children}: {children: ReactNode}) {
  return (
    <div className="rp-shell">
      <header className="rp-top">
        <div className="rp-brand">
          <img src={logo} alt="" />
          <span>doona</span>
        </div>
      </header>
      <main className="rp-main">
        <div className="rp-content">{children}</div>
      </main>
    </div>
  );
}

function ShellFrame(props: FrameProps) {
  const view = useShell(props.settings, props.route);
  // Signing in takes the whole page: the shell around it would offer nothing that works yet.
  if (view.content.kind === 'login') return <SignIn {...props} view={view} content={view.content} />;
  // A failed read shows with its retry while the rest of startup still waits.
  const waiting = (
    <StartupFrame>
      <ErrorMessage error={view.error} onRetry={view.refresh} />
      <PageSkeleton />
    </StartupFrame>
  );
  // A tab that may still have to sign in keeps the startup screen until the backend answers.
  if (view.content.kind === 'loading' && !expectsAccess()) return waiting;
  return (
    <LoadBoundary>
      <Suspense fallback={waiting}>
        <frame.Component {...props} view={view} />
      </Suspense>
    </LoadBoundary>
  );
}

function SignIn({lang, pickLang, ap, route, view, content}: FrameProps & {view: ShellModel; content: Extract<ShellModel['content'], {kind: 'login'}>}) {
  const {menu, paletteSections} = useShellFrame(lang, pickLang, ap, route);
  return (
    <Suspense fallback={<Loading />}>
      <Login
        profileId={content.profileId}
        api={content.api}
        backend={content.backend}
        rejected={content.rejected}
        missingApi={content.missingApi}
        lang={lang}
        pickLang={pickLang}
        dark={ap.dark}
        themeLabel={menu.themeLabel}
        toggleScheme={ap.toggle}
        palette={{ap, paletteSections}}
        wordmark={view.wordmark}
        error={view.error}
        onRetry={view.refresh}
      />
    </Suspense>
  );
}
