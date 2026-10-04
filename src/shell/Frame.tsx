import {Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, type ContextType} from 'react';
import {useT, type Lang} from '../i18n';
import {Button, ErrorMessage, Empty, PageSkeleton, PageShapeContext} from '../ui/ui';
import {PageActionsTarget} from '../ui/PageActions';
import {useApplyHeld} from '../features/shared/usePendingApply';
import {useLifecycle} from '../features/shared/useLifecycle';
import {refetchAll, useCapabilities} from '../store';
import {SettingsContext, type Settings} from './preferences';
import {Shortcuts} from './Shortcuts';
import {SideNav} from './SideNav';
import {HubBar, HubPages} from './HubBar';
import {TopBar} from './TopBar';
import {AboutContext, type ShellModel} from './useShell';
import {useShellFrame} from './useShellController';
import {topBarCommands} from './view';
import {LoadBoundary} from '../ui/LoadBoundary';
import type {PageProps} from './routes';
import {RefusalWait} from './RefusalWait';

export type FrameProps = {
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

// The signed-in frame around the pages: what only shows once the backend accepts the tab.
export function Frame(props: FrameProps & {view: ShellModel}) {
  const {view} = props;
  return (
    <AboutContext.Provider value={view.about}>
      <Layout {...props} />
      <Shortcuts go={props.go} openSearch={props.openSearch} refresh={view.refresh} mac={props.mac} entries={view.shortcuts} paths={view.shortcutPaths} />
    </AboutContext.Provider>
  );
}

const rereadAll = () => void refetchAll();
// Applying held rules and reloading honk are separate commands. The latest state is read through a ref so the memoised
// top bar keeps one callback for each.
function useCommands() {
  const t = useT();
  const capabilities = useCapabilities();
  const held = useApplyHeld();
  // A reload can change any resource, so every one is read again once it settles.
  const lifecycle = useLifecycle(undefined, capabilities.data, rereadAll);
  const latest = useRef({held, lifecycle});
  useLayoutEffect(() => {
    latest.current = {held, lifecycle};
  });
  const apply = useCallback(() => void latest.current.held.apply(), []);
  const reload = useCallback(() => void latest.current.lifecycle.run('reload'), []);
  const canReload = lifecycle.canRun('reload');
  const reloading = lifecycle.busy === 'reload';
  const commands = useMemo(
    () => topBarCommands({count: held.count, label: held.label, busy: held.busy}, canReload, reloading, t),
    [held.count, held.label, held.busy, canReload, reloading, t]
  );
  return {commands, apply, reload};
}

function Layout({lang, pickLang, ap, route, query, go, openSearch, mac, view}: FrameProps & {view: ShellModel}) {
  const t = useT();
  const {paletteSections, settingsValue, menu, navRef, navStyle} = useShellFrame(lang, pickLang, ap, route);
  const {commands, apply, reload} = useCommands();
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const Page = view.current.Page;
  const hub = view.groups.find(group => group.items.some(item => item.current));
  return (
    <div className="rp-shell">
      <TopBar
        route={route}
        lang={lang}
        pickLang={pickLang}
        ap={ap}
        mac={mac}
        openSearch={openSearch}
        refresh={view.refresh}
        spinning={view.spinning}
        commands={commands}
        apply={apply}
        reload={reload}
        honk={view.honk}
        backend={view.backend}
        wordmark={view.wordmark}
        versionText={view.about.versionText}
        paletteSections={paletteSections}
        menu={menu}
      />
      <SideNav route={route} groups={view.groups} busy={view.busy} backend={view.backend} honk={view.honk} navRef={navRef} navStyle={navStyle} />
      <main className="rp-main">
        <div className="rp-content">
          <div className="rp-head">
            <div className="rp-page-heading">
              <div className="rp-title">
                <h1 className="rp-h1">{view.current.title}</h1>
                {view.current.hint && <span className="rp-hint">{view.current.hint}</span>}
              </div>
              <div ref={setActions} className="rp-page-actions" />
            </div>
            {hub && <HubPages key={hub.id} hub={hub} />}
          </div>
          <ErrorMessage error={view.error} onRetry={view.refresh} />
          <RefusalWait />
          <PageActionsTarget value={actions}>
            <PageShapeContext value={view.current.skeleton}>
              <SettingsContext.Provider value={settingsValue}>
                {view.content.kind === 'loading' ? (
                  <PageSkeleton />
                ) : view.content.kind === 'unavailable' ? (
                  <Empty>
                    {t('shell.notOffered')}
                    <Button onPress={() => go('activity')}>{t('shell.toActivity')}</Button>
                  </Empty>
                ) : (
                  <LoadBoundary key={view.current.id}>
                    <Suspense fallback={<PageSkeleton />}>
                      <Page go={go} query={query} />
                    </Suspense>
                  </LoadBoundary>
                )}
              </SettingsContext.Provider>
            </PageShapeContext>
          </PageActionsTarget>
        </div>
      </main>
      <HubBar groups={view.groups} />
    </div>
  );
}
