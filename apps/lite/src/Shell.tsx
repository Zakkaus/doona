import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Stack';
import {Kbd} from '@astryxdesign/core/Kbd';
import {ColorModeToggle} from './ui/ColorModeToggle';
import {LanguageMenu} from './ui/LanguageMenu';
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Layout adapted from the Astryx shell-side-nav template; see ASTRYX-TEMPLATES-LICENSE.

import {AppShell} from '@astryxdesign/core/AppShell';
import {Divider} from '@astryxdesign/core/Divider';
import {DropdownMenu, DropdownMenuGroup, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';
import {Icon} from '@astryxdesign/core/Icon';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection, useSideNavCollapse} from '@astryxdesign/core/SideNav';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Text} from '@astryxdesign/core/Text';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {lazy, Suspense, useCallback, useContext, useRef, useState, type ComponentProps, type ReactNode} from 'react';
import {errorKey, type Connection} from './api';
import {docsHref} from './docs';
import {DraftContext} from './ui/draftGuard';
import {ExportDraftContext, type ExportDraft} from './ui/exportDraft';
import {useConfigExport} from './ConfigExport';
import {pageChunks} from './preload';
import {LocaleContext, useMessages} from './i18n';
import {finished, settle} from './operations';
import {useRead, useTask} from './state';
import {useNoticeToast} from './ui';
import {BrandMark} from './ui/BrandMark';
import {EditDialog} from './ui/EditDialog';
import {useCommand} from './ui/commands';
import {GlobeGrid, Layers, Link, Location, Path, Search, Settings} from './ui/icons';
import {ReportShortcut} from './ui/ReportShortcut';

const AboutDialog = lazy(() => import('./AboutDialog').then(module => ({default: module.AboutDialog})));

export type Screen = 'nodes' | 'groups' | 'subscriptions' | 'routing' | 'dns';
const sections = [
  {
    title: 'navigationProxy',
    items: [
      {id: 'groups', icon: Layers},
      {id: 'nodes', icon: Location},
      {id: 'subscriptions', icon: Link}
    ]
  },
  {
    title: 'navigationRules',
    items: [
      {id: 'routing', icon: Path},
      {id: 'dns', icon: GlobeGrid}
    ]
  }
] as const;

export function Shell(props: Parameters<typeof ShellContent>[0]) {
  const draft = useRef<ExportDraft | null>(null);
  return (
    <ExportDraftContext value={draft}>
      <ShellContent {...props} />
    </ExportDraftContext>
  );
}

function ShellContent({
  screen,
  busy,
  connection,
  children,
  onSettings,
  setBusy,
  onCommands
}: {
  screen: Screen;
  busy: boolean;
  connection: Connection;
  children: ReactNode;
  onSettings: () => void;
  setBusy: (busy: boolean) => void;
  onCommands: () => void;
}) {
  const t = useMessages();
  const parentDirty = useContext(DraftContext);
  const [dirty, setDirty] = useState(false);
  const trackDirty = useCallback(
    (dirty: boolean) => {
      setDirty(dirty);
      parentDirty(dirty);
    },
    [parentDirty]
  );
  const exporter = useConfigExport(connection, dirty);
  const touch = useMediaQuery('(hover: none) and (pointer: coarse)');
  const runtime = useRead(
    useCallback(
      (signal?: AbortSignal) => (connection.capabilities.resources.runtime.available ? connection.api.runtime(signal) : Promise.resolve(undefined)),
      [connection]
    ),
    busy
  );
  const states = {
    starting: 'backendStarting',
    running: 'ready',
    reloading: 'pending',
    suspended: 'backendSuspended',
    draining: 'backendDraining',
    degraded: 'backendDegraded',
    failed: 'shellFailed'
  } as const;
  const state = runtime.data?.lifecycle.state;
  const task = useTask(setBusy);
  useNoticeToast(task.notice);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const resources = connection.capabilities.resources;
  const applicable = (kind: 'suspend' | 'resume' | 'reload') =>
    resources.operations.available &&
    resources.runtime.available &&
    resources[kind]?.available &&
    !busy &&
    !runtime.loading &&
    !runtime.error &&
    (kind === 'resume'
      ? state === 'suspended'
      : kind === 'suspend'
        ? ['running', 'degraded'].includes(state ?? '')
        : ['running', 'degraded', 'failed'].includes(state ?? ''));
  const act = (kind: 'suspend' | 'resume' | 'reload') => {
    if (!applicable(kind)) return;
    void task.run(kind, async () => {
      const starts = {suspend: connection.api.startSuspend, resume: connection.api.startResume, reload: connection.api.startReload};
      try {
        finished(await settle(connection.api, await starts[kind]()), kind);
        await runtime.reload();
        setPauseOpen(false);
        return {key: kind === 'reload' ? 'reloadDone' : kind === 'suspend' ? 'pauseDone' : 'resumeDone'};
      } finally {
        await runtime.reload().catch(() => {});
      }
    });
  };
  const actions = (['suspend', 'resume', 'reload'] as const).filter(applicable).map(kind => ({
    label: t[kind === 'suspend' ? 'pauseBackend' : kind === 'resume' ? 'resumeBackend' : 'reloadBackend'],
    onClick: () => (kind === 'suspend' ? setPauseOpen(true) : act(kind))
  }));
  if (resources.config.available && !busy && !exporter.pending) actions.push({label: t.exportConfig, onClick: exporter.start});
  actions.push({label: t.about, onClick: () => setAboutOpen(true)});
  useCommand(command => {
    const kind = command.replace('backend:', '');
    if (command.startsWith('backend:') && ['suspend', 'resume', 'reload'].includes(kind) && applicable(kind as 'suspend' | 'resume' | 'reload')) {
      if (kind === 'suspend') setPauseOpen(true);
      else act(kind as 'resume' | 'reload');
    }
  });
  const statusKey = busy
    ? 'pending'
    : runtime.error
      ? 'shellDisconnected'
      : runtime.data?.last_reload?.status === 'failed'
        ? 'reloadFailed'
        : state
          ? states[state]
          : 'connected';
  // What the status leaves out: the failed read, the failed reload or the engine's degradations.
  const cause = runtime.error
    ? t[errorKey(runtime.error)]
    : statusKey === 'reloadFailed'
      ? runtime.data?.last_reload?.error?.message
      : statusKey === 'backendDegraded' || statusKey === 'shellFailed'
        ? runtime.data?.degradations?.map(item => item.message).join('\n')
        : undefined;
  const troubled = ['shellDisconnected', 'reloadFailed', 'backendDegraded', 'shellFailed'].includes(statusKey);
  const statusTone =
    busy || state === 'reloading'
      ? 'accent'
      : ['degraded', 'failed'].includes(state ?? '') || runtime.error || runtime.data?.last_reload?.status === 'failed'
        ? 'warning'
        : state === 'running'
          ? 'success'
          : 'neutral';
  return (
    <AppShell
      className="lite-shell"
      variant="section"
      contentPadding={0}
      sideNav={
        <SideNav
          collapsible
          aria-label={t.navigation}
          resizable={{defaultWidth: 224, minWidth: 200, maxWidth: 320, autoSaveId: 'doona-lite-nav'}}
          header={
            <SideNavHeading
              heading={t.app}
              headingHref="#nodes"
              style={{paddingInlineStart: 0}}
              icon={<Icon icon={BrandMark} size="lg" style={{width: 'var(--spacing-8)', height: 'var(--spacing-8)', margin: 'var(--spacing-0-5)'}} />}
            />
          }
          footerIcons={
            <>
              <ColorModeToggle />
              <LanguageMenu />
              <ReportShortcut />
            </>
          }
          footer={
            <SideNavSection title={t.settings} isHeaderHidden>
              <BackendStatus
                address={connection.address === 'mock' ? t.demoName : connection.address}
                label={runtime.loading && !runtime.data && !busy ? t.loading : t[statusKey]}
                tone={statusTone}
                cause={cause}
                docs={troubled}
                actions={actions}
                pending={task.busy !== null || runtime.loading}
              />
              <SideNavItem label={t.settings} icon={<Icon icon={Settings} size="sm" />} isDisabled={busy} onClick={onSettings} />
            </SideNavSection>
          }
        >
          <SideNavSection title={t.globalSearch} isHeaderHidden>
            <NavigationItem
              label={t.globalSearch}
              endContent={touch ? undefined : <Kbd keys="mod+k" />}
              icon={<Icon icon={Search} size="sm" />}
              isDisabled={busy}
              onClick={onCommands}
            />
          </SideNavSection>
          <Divider />
          {sections.map(({title, items}) => (
            <SideNavSection key={title} title={t[title]}>
              {items.map(({id, icon}) => (
                <NavigationItem
                  onPointerEnter={() => void pageChunks[id]()}
                  onFocus={() => void pageChunks[id]()}
                  key={id}
                  label={t[id]}
                  href={`#${id}`}
                  icon={<Icon icon={icon} size="sm" />}
                  isSelected={screen === id}
                  isDisabled={busy}
                />
              ))}
            </SideNavSection>
          ))}
        </SideNav>
      }
    >
      <DraftContext value={trackDirty}>{children}</DraftContext>
      {exporter.dialog}
      {aboutOpen && (
        <Suspense fallback={null}>
          <AboutDialog connection={connection} close={() => setAboutOpen(false)} />
        </Suspense>
      )}
      <EditDialog
        open={pauseOpen}
        title={t.pauseBackend}
        close={() => setPauseOpen(false)}
        pending={task.busy !== null}
        notice={task.notice}
        label={t.pauseBackend}
        destructive
        disabled={!applicable('suspend')}
        confirm={() => act('suspend')}
      >
        <Text>{t.pauseHelp}</Text>
      </EditDialog>
    </AppShell>
  );
}

function NavigationItem(props: ComponentProps<typeof SideNavItem>) {
  const {isCollapsed} = useSideNavCollapse();
  const item = <SideNavItem {...props} />;
  return isCollapsed ? (
    <Tooltip content={props.label} placement="end">
      {item}
    </Tooltip>
  ) : (
    item
  );
}

function BackendStatus({
  address,
  label,
  tone,
  cause,
  docs,
  actions,
  pending
}: {
  address: string;
  label: string;
  tone: ComponentProps<typeof StatusDot>['variant'];
  cause?: string;
  docs: boolean;
  actions: Array<{label: string; onClick: () => void}>;
  pending: boolean;
}) {
  const t = useMessages();
  const locale = useContext(LocaleContext);
  const {isCollapsed} = useSideNavCollapse();
  const status = (
    <VStack gap={0} align="start">
      <Text>{label}</Text>
      <Text type="supporting" color="secondary" style={{overflowWrap: 'anywhere'}}>
        {address}
      </Text>
    </VStack>
  );
  const dot = <Icon icon={() => <StatusDot label={label} variant={tone} />} size="sm" />;
  return (
    <DropdownMenu
      menuWidth={240}
      renderTrigger={props =>
        isCollapsed ? (
          <Tooltip content={<Text color="inherit" style={{whiteSpace: 'pre-line'}}>{`${label}\n${address}`}</Text>} placement="end">
            <SideNavItem
              {...props}
              onClick={event => props.onClick(event as React.MouseEvent<HTMLElement>)}
              label=""
              data-backend-status
              aria-label={t.backendActions}
              icon={dot}
              isDisabled={pending}
            />
          </Tooltip>
        ) : (
          <Button
            {...props}
            label={t.backendActions}
            data-backend-status
            variant="ghost"
            width="100%"
            style={{height: 'auto', justifyContent: 'start', paddingBlock: 'var(--spacing-2)', textAlign: 'start'}}
            icon={dot}
            isDisabled={pending}
          >
            {status}
          </Button>
        )
      }
    >
      <DropdownMenuGroup
        title={
          <VStack gap={1} align="start">
            {status}
            {cause && (
              <Text type="supporting" color="secondary" style={{whiteSpace: 'pre-line', overflowWrap: 'anywhere'}}>
                {cause}
              </Text>
            )}
          </VStack>
        }
      >
        {actions.map(action => (
          <DropdownMenuItem key={action.label} {...action} />
        ))}
        {docs && <DropdownMenuItem label={t.docsLink} href={docsHref(locale, 'no-native-api')} target="_blank" />}
      </DropdownMenuGroup>
    </DropdownMenu>
  );
}
