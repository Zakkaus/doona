import {Activity, memo, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ContextType} from 'react';
import {useT, type Lang} from '../i18n';
import {Button, ErrorMessage, Empty, PageSkeleton, PageShapeContext, type PageShape} from '../ui/ui';
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
import {keepPages, type KeptPage} from './kept';
import {hasOpenOverlay, OverlayScopeContext, type OverlayScope} from '../ui/openOverlays';

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
  const {paletteSections, settingsValue, menu} = useShellFrame(lang, pickLang, ap);
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
      <SideNav route={route} groups={view.groups} busy={view.busy} backend={view.backend} honk={view.honk} />
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
                <Pages
                  shown={view.content.kind === 'page' ? {id: view.current.id, page: {Page, skeleton: view.current.skeleton, overlays: {}}} : null}
                  query={query}
                  go={go}
                  formats={`${ap.dateFormat} ${ap.timeFormat}`}
                />
                {view.content.kind === 'loading' ? (
                  <PageSkeleton />
                ) : (
                  view.content.kind === 'unavailable' && (
                    <Empty>
                      {t('shell.notOffered')}
                      <Button onPress={() => go('activity')}>{t('shell.toActivity')}</Button>
                    </Empty>
                  )
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

type Shown = {Page: ComponentType<PageProps>; skeleton: PageShape; overlays: OverlayScope};

// Pages already opened stay mounted under a hidden Activity, so going back to one shows it as it was left instead of
// building it again; keepPages says which. A hidden page keeps its state and DOM under display: none, which also
// takes it out of the accessibility tree, and runs no effects: its subscriptions, polls and listeners stop, and start
// again when it shows, which reads its resources again as opening it anew did.
function Pages({shown, query, go, formats}: {shown: {id: string; page: Shown} | null; query: string; go: PageProps['go']; formats: string}) {
  const [kept, setKept] = useState<ReadonlyArray<KeptPage<Shown>>>([]);
  // Pages format dates and times when they render, so a new clock or date format drops the hidden ones. A page left
  // with a dialog open is not kept either: the dialog would come back with it.
  const [formatted, setFormatted] = useState(formats);
  if (formatted !== formats) setFormatted(formats);
  const left = kept.filter(entry => entry.id === shown?.id || (formatted === formats && !hasOpenOverlay(entry.page.overlays)));
  const next = keepPages(left.length === kept.length ? kept : left, shown && {...shown, query});
  if (next !== kept) setKept(next);
  return next.map(entry => (
    <Activity key={entry.id} mode={entry.id === shown?.id ? 'visible' : 'hidden'}>
      <PageFrame page={entry.page} query={entry.query} go={go} />
    </Activity>
  ));
}

// Memoised, so a page that stays hidden or stays shown is not rendered again when another page opens.
const PageFrame = memo(function PageFrame({page: {Page, skeleton, overlays}, query, go}: {page: Shown; query: string; go: PageProps['go']}) {
  return (
    <OverlayScopeContext value={overlays}>
      <PageShapeContext value={skeleton}>
        <LoadBoundary>
          <Suspense fallback={<PageSkeleton />}>
            <Page go={go} query={query} />
          </Suspense>
        </LoadBoundary>
      </PageShapeContext>
    </OverlayScopeContext>
  );
});
