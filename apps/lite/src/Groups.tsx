import {useAfterPaint, useProgressiveRows} from './ui/useProgressiveRows';
import {useExportDraft} from './ui/exportDraft';
import {CollectionLoading, RowPlaceholder} from './ui/CollectionLoading';
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Layout adapted from the Astryx incident-console template (row queue plus inspector),
// with the table-filter toolbar and detail sheet; see ASTRYX-TEMPLATES-LICENSE.

import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, LayoutPanel, VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {LoadingText} from './ui/LoadingText';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';
import * as stylex from '@stylexjs/stylex';
import {Suspense, lazy, startTransition, useMemo, useCallback, useEffect, useRef, useState, type KeyboardEvent} from 'react';
import type {ConfigSource, Group, GroupSelectionRequest} from '../../../src/api/model';
import {readGroupEntries, type GroupEntry} from '../../../src/dae/groups';
import {applyContent, groupProbeSize, groupSnapshot, probeGroup, readGroups, readMain, readProviders, selectMember, type Connection} from './api';
import {canWrite, readNodes, validateContent} from './config';
import {describeGroupChanges, describeGroupFilters, phraseText} from './describe';
import {deleteGroup, emptyGroups, groupChanges} from './groupDraft';
import {GroupEditor} from './GroupEditor';
import {GroupEditPanel} from './GroupEditPanel';
import {groupStatus, healthFallback, memberName, type GroupStatus} from './groupHealth';
import {GroupInspector, GroupInspectorPlaceholder} from './GroupInspector';
import {GroupTextDialog} from './GroupTextDialog';
import {useMessages} from './i18n';
import {readBackUnconfirmed} from './operations';
import {useFocusRefresh, useRead, useTask} from './state';
import {Feedback, ReadState, useNoticeToast} from './ui';
import {CollectionToolbar} from './ui/CollectionToolbar';
import {usePageCommand, useSearchTarget} from './ui/commands';
import {DraftBar} from './ui/DraftBar';
import {useDraftGuard} from './ui/draftGuard';
import {EditDialog} from './ui/EditDialog';
import {policyLabel} from './ui/groupLabels';
import {Close, Search} from './ui/icons';
import {groupListMinRem, MEDIA} from './ui/metrics.stylex';
import {Crossfade, RowEntrance} from './ui/motion';
import {DraftPresence} from './ui/motion/DraftPresence';
import {revealRow} from './ui/motion/revealRow';
import {PageFrame, pageRhythm} from './ui/PageFrame';
import {ReviewDialog} from './ui/ReviewDialog';
import {useKnownCount} from './ui/useExpectedCount';

const CopyMembers = lazy(() => import('./CopyMembers'));
type Network = GroupSelectionRequest['network'];
type Row = {name: string; group?: Group; entry?: GroupEntry};

const styles = stylex.create({
  // The inspector scrolls inside its panel, as the incident-console inspector does.
  inspector: {contain: 'inline-size layout style', height: '100%', minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable', scrollbarWidth: 'thin'},
  row: {contain: 'inline-size layout style', paddingInlineStart: 'var(--spacing-4)', paddingInlineEnd: 'var(--spacing-4)'},
  latency: {minWidth: 'var(--spacing-12)', textAlign: 'end'},
  wrap: {overflowWrap: 'anywhere', minWidth: 0}
});
const healthKeys = {healthy: 'groupHealthy', warning: 'groupWarning', unavailable: 'groupUnavailable', unknown: 'groupUnknown'} as const;
const dots: Record<GroupStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  healthy: 'success',
  warning: 'warning',
  unavailable: 'error',
  unknown: 'neutral'
};

export function Groups({connection, setBusy}: {connection: Connection; setBusy: (busy: boolean) => void}) {
  const t = useMessages();
  const phone = useMediaQuery(MEDIA.phone);
  const wide = useMediaQuery(MEDIA.wide);
  const {api, capabilities} = connection;
  const read = useRead(useCallback((signal?: AbortSignal) => readGroups(api, signal), [api]));
  const resources = useRead(
    useCallback(
      async (signal?: AbortSignal) => {
        const [source, nodes, providers, config] = await Promise.all([
          capabilities.resources.config.available ? readMain(api, signal) : undefined,
          capabilities.resources.nodes.available ? readNodes(connection, signal) : [],
          capabilities.resources.providers.available ? readProviders(api, signal) : [],
          capabilities.resources.config.available ? api.config(signal) : undefined
        ]);
        return {source, nodes, providers, config};
      },
      [connection, api, capabilities]
    )
  );
  const ready = read.data !== undefined && (resources.data !== undefined || !resources.loading);
  const inspectorReady = useAfterPaint(ready);
  const [sheetMounted, setSheetMounted] = useState(false);
  const [mode, setMode] = useState('switch');
  const expectedCount = useKnownCount(connection.api, 'groups', read.data?.length);
  const task = useTask(setBusy);
  useNoticeToast(task.notice);
  const [draft, setDraft] = useState<{source: ConfigSource; content: string} | undefined>();
  const [reviewing, setReviewing] = useState(false);
  const dirty = !!draft && draft.source.content !== draft.content;
  useDraftGuard(dirty, () => setDraft(undefined));
  useExportDraft(draft?.source, dirty, () => draft!.content);
  const reloadGroups = read.reload;
  const reloadResources = resources.reload;
  useFocusRefresh(
    useCallback(() => Promise.all([reloadGroups(), reloadResources()]), [reloadGroups, reloadResources]),
    ready && !dirty && task.busy === null
  );
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetDialog = useRef<HTMLDialogElement | null>(null);
  useEffect(
    () => () => {
      // Activity can pause an exit before BottomSheet closes its native modal.
      sheetDialog.current?.close();
      setSheetOpen(false);
      setSheetMounted(false);
    },
    []
  );
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [groupText, setGroupText] = useState<{name: string; duplicate: boolean} | null>(null);
  const [pendingMember, setPendingMember] = useState<string | null>(null);
  const [panelBounds, setPanelBounds] = useState({min: 480, max: 880});
  const panel = useResizable({defaultSize: 640, minSize: wide ? 480 : panelBounds.min, maxSize: wide ? 880 : panelBounds.max});
  const watchPanel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || wide) return;
      const row = node.parentElement!;
      const update = () => {
        const width = row.getBoundingClientRect().width;
        if (!width) return;
        const min = width * 0.45;
        const listMin = groupListMinRem * parseFloat(getComputedStyle(document.documentElement).fontSize);
        setPanelBounds({min, max: Math.min(880, Math.max(min, width - listMin))});
      };
      const observer = new ResizeObserver(update);
      observer.observe(row);
      update();
      return () => observer.disconnect();
    },
    [wide]
  );
  const list = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState<{name: string; added: boolean} | null>(null);

  const source = resources.data?.source;
  const content = draft?.content ?? source?.content ?? '';
  const original = draft?.source.content ?? source?.content ?? '';
  const others = resources.data?.config?.sources.filter(item => item.id !== source?.id).map(item => item.content) ?? [];
  const entries = useMemo(() => (source ? readGroupEntries(content) : []), [source, content]);
  const groups = ready ? (read.data ?? []) : [];
  const nodes = useMemo(() => resources.data?.nodes ?? [], [resources.data]);
  const initialGroup = inspectorReady ? undefined : groupSnapshot(api)?.[0];
  const initialLeafCount = initialGroup && resources.data ? nodes.filter(node => node.group_ids.includes(initialGroup.id)).length : undefined;
  const providers = resources.data?.providers ?? [];
  const fallback = useMemo(() => healthFallback(nodes, read.data ?? []), [nodes, read.data]);
  const writable = !!capabilities.resources.config.writable && canWrite(connection, source);
  const rows: Row[] = [
    ...groups.filter(group => !draft || entries.some(entry => entry.name === group.name)).map(group => ({name: group.name, group})),
    ...(ready ? entries.filter(entry => !groups.some(group => group.name === entry.name)).map(entry => ({name: entry.name})) : [])
  ]
    .map(row => ({...row, entry: entries.find(entry => entry.name === row.name)}))
    .filter(row => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const visibleRows = useProgressiveRows(rows);
  useEffect(() => {
    if (!reveal || creating || copyFrom) return;
    const frame = requestAnimationFrame(() => {
      const row = list.current?.querySelector<HTMLElement>(`[data-group-row="${CSS.escape(reveal.name)}"]`);
      if (!row) return;
      revealRow(row, reveal.added);
      setReveal(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal, creating, copyFrom, visibleRows]);
  if (sheetOpen && !sheetMounted) setSheetMounted(true);
  const sheetRef = useCallback((panel: HTMLDivElement | null) => {
    const dialog = panel?.closest('dialog');
    if (!dialog) return;
    sheetDialog.current = dialog;
    const closed = () => setSheetMounted(false);
    dialog.addEventListener('close', closed);
    return () => dialog.removeEventListener('close', closed);
  }, []);
  const current = rows.find(row => row.name === selected) ?? (phone ? undefined : rows[0]);
  const disabled = task.busy !== null || read.loading || read.error !== undefined;
  const switchDisabled = disabled || dirty || capabilities.resources.groups.selection === false;
  const stage = (next: string) => source && setDraft(value => ({source: value?.source ?? source, content: next}));
  const open = (name: string) => {
    setSelected(name);
    if (phone) setSheetOpen(true);
  };

  usePageCommand('add-group', ready && !disabled, () => setCreating(true));
  useSearchTarget('group', ready, target => {
    const group = read.data?.find(item => item.id === target.id);
    setMode('switch');
    setSearch('');
    if (group) open(group.name);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-member-row]')?.focus({preventScroll: true}));
  });
  // 在策略组中使用… from search: the first group that can pick this node, focused on its row.
  useSearchTarget('member', ready, target => {
    const group =
      read.data?.find(item => (item.capabilities.can_select || item.capabilities.can_override) && item.members.some(member => member.id === target.id)) ??
      read.data?.find(item => item.members.some(member => member.id === target.id));
    setSearch('');
    if (!group) {
      setMode('edit');
      return;
    }
    setMode('switch');
    open(group.name);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-member-row="${CSS.escape(target.id)}"]`)?.focus({preventScroll: false}))
    );
  });
  const focusAfterSelection = useRef<string | null>(null);
  useEffect(() => {
    if (task.busy !== null || focusAfterSelection.current === null) return;
    const member = focusAfterSelection.current;
    focusAfterSelection.current = null;
    document.querySelector<HTMLElement>(member ? `[data-member-row="${CSS.escape(member)}"]` : '[data-member-row]')?.focus({preventScroll: true});
  }, [task.busy, read.data]);
  const choose = async (group: Group, id: string | null, network: Network) => {
    focusAfterSelection.current = id ?? '';
    setPendingMember(id ?? 'automatic');
    await task.run(`quick:${group.id}`, async () => {
      if (id === null) {
        await api.clearGroupOverride(group.id, network).catch(readBackUnconfirmed(read.reload));
        await read.reload();
        return {key: 'automaticDone'};
      }
      const key = await selectMember(api, group, id, network, read.reload);
      const values = {group: group.name, name: memberName(group, id, id)};
      return {key: key === 'pinned' ? 'pinnedTo' : key === 'selectedInterrupted' ? 'switchedToInterrupted' : 'switchedTo', values};
    });
  };
  const canProbe = (group: Group) =>
    capabilities.resources.probes.available &&
    capabilities.resources.operations.available &&
    capabilities.resources.probes.targets?.includes('group') &&
    capabilities.resources.probes.kinds?.includes('http') &&
    capabilities.resources.probes.transports?.includes('tcp') &&
    groupProbeSize(capabilities) > 0 &&
    group.members.length > 0 &&
    group.capabilities.probe_transports.includes('tcp');
  const probe = (group: Group) => {
    setPendingMember('probe');
    void task.run(`quick:${group.id}`, async () => {
      await probeGroup(connection, group);
      await Promise.all([read.reload(), resources.reload()]);
      return {key: 'probeDone'};
    });
  };
  const listKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[data-group-row] button') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    buttons[next]?.focus();
  };
  const changes = draft ? groupChanges(draft.source.content, draft.content) : [];
  const empty = draft ? emptyGroups(draft.content) : [];
  const blocked = empty.length ? t.emptyGroupBlocked.replace('{name}', empty.join(t.listSep)) : null;
  const description = (row: Row) => {
    if (mode === 'edit' && row.entry)
      return describeGroupFilters(row.entry.filters)
        .map(item => phraseText(item, t))
        .join(t.listSep);
    if (!row.group) return t.stagedGroup;
    const {tcp, udp} = row.group.runtime.selection;
    const name = memberName(row.group, tcp?.member_id, t.unknown);
    const shown = tcp?.member_id === udp?.member_id ? name : `TCP: ${name} / UDP: ${memberName(row.group, udp?.member_id, t.unknown)}`;
    return [tcp, udp].some(item => item?.source === 'override') ? t.labelValue.replace('{label}', t.pinnedLabel).replace('{value}', shown) : shown;
  };

  const inspector = !current ? (
    <EmptyState isCompact title={t.selectGroup} description={t.selectGroupHelp} />
  ) : mode === 'edit' ? (
    current.entry && source ? (
      <GroupEditPanel
        key={current.name}
        name={current.name}
        content={content}
        original={original}
        others={others}
        nodes={nodes}
        providers={providers}
        writable={writable && !disabled}
        sheet={phone}
        stage={stage}
        renamed={setSelected}
        menu={[
          {label: t.editAsText, onClick: () => setGroupText({name: current.name, duplicate: false})},
          {label: t.duplicate, onClick: () => setGroupText({name: current.name, duplicate: true})},
          {label: t.copyMembersTo, onClick: () => setCopyFrom(current.name)},
          {label: t.delete, onClick: () => setDeleting(current.name)}
        ]}
      />
    ) : (
      <EmptyState isCompact title={t.readOnly} />
    )
  ) : current.group ? (
    <GroupInspector
      key={current.group.id}
      group={current.group}
      nodes={nodes}
      providers={providers}
      fallback={fallback}
      disabled={switchDisabled}
      pending={task.busy === `quick:${current.group.id}` ? pendingMember : null}
      select={(id, network) => void choose(current.group!, id, network)}
      probe={canProbe(current.group) ? () => probe(current.group!) : undefined}
      edit={capabilities.resources.config.available ? () => setMode('edit') : undefined}
      jump={id => {
        const name = read.data?.find(group => group.id === id)?.name;
        if (name) {
          setSearch('');
          open(name);
        }
      }}
      sheet={phone}
    />
  ) : (
    <EmptyState
      isCompact
      title={t.stagedGroup}
      description={t.stagedGroupHelp}
      actions={<Button label={t.editMode} variant="secondary" onClick={() => setMode('edit')} />}
    />
  );
  const body = (
    <Crossfade swapKey={`${mode}:${current?.name ?? ''}`} gap={pageRhythm.section}>
      {inspector}
    </Crossfade>
  );

  return (
    <>
      <PageFrame
        title={t.groups}
        description={t.groupsDescription}
        ready={ready}
        refreshing={!!read.data && read.loading}
        actions={
          <>
            <SegmentedControl label={t.groupView} value={mode} onChange={value => startTransition(() => setMode(value))} size="md">
              <SegmentedControlItem value="switch" label={t.switchMode} />
              <SegmentedControlItem value="edit" label={t.editMode} isDisabled={!capabilities.resources.config.available} />
            </SegmentedControl>
            <Button
              label={t.createGroup}
              variant={dirty ? 'secondary' : 'primary'}
              isDisabled={disabled || !writable}
              onClick={() => startTransition(() => setCreating(true))}
            />
          </>
        }
        footer={
          <DraftPresence>
            {dirty && draft ? (
              <DraftBar
                count={changes.length || 1}
                blocked={blocked}
                discard={() => setDraft(undefined)}
                pending={task.busy !== null}
                review={() =>
                  void task.run('validate', async () => {
                    await validateContent(connection, draft.source, draft.content);
                    setReviewing(true);
                    return undefined;
                  })
                }
              />
            ) : undefined}
          </DraftPresence>
        }
        content={
          <VStack gap={pageRhythm.toolbarToCollection}>
            <CollectionToolbar
              start={
                <TextInput
                  label={t.searchGroups}
                  isLabelHidden
                  placeholder={t.searchGroups}
                  width="100%"
                  startIcon={Search}
                  value={search}
                  onChange={setSearch}
                  hasClear
                />
              }
            />
            {!capabilities.resources.config.writable && (
              <Text type="supporting" color="secondary">
                {t.readOnly}
              </Text>
            )}
            <ReadState error={read.error ?? resources.error} reload={() => Promise.all([read.reload(), resources.reload()])} />
            {task.notice && 'error' in task.notice && <Feedback notice={task.notice} />}
            <CollectionLoading loading={!ready && (read.loading || resources.loading)} name="groups" prepared={expectedCount !== undefined}>
              {showPlaceholder => (
                <VStack gap={0} data-collection ref={list} onKeyDown={listKeys}>
                  <RowEntrance>
                    <List density="compact" hasDividers>
                      {showPlaceholder &&
                        (groupSnapshot(api) ?? []).slice(0, 30).map(summary => (
                          <ListItem
                            key={summary.id}
                            data-skeleton-row
                            xstyle={styles.row}
                            label={<RowPlaceholder />}
                            description={<RowPlaceholder supporting />}
                            startContent={
                              <StatusDot
                                variant="neutral"
                                label={t.loading}
                                style={{background: 'var(--color-background-muted)', color: 'var(--color-text-secondary)'}}
                              />
                            }
                            endContent={
                              <HStack gap={3} vAlign="center" style={{width: 'auto'}}>
                                <LoadingText type="supporting" color="secondary" loading>
                                  {policyLabel(summary.policy.native || summary.policy.kind, t)}
                                </LoadingText>
                                {mode === 'switch' && (
                                  <LoadingText type="supporting" color="secondary" hasTabularNumbers xstyle={styles.latency} loading children="—" />
                                )}
                              </HStack>
                            }
                          />
                        ))}
                      {visibleRows.map(row => {
                        const health = row.group ? groupStatus(row.group, fallback) : null;
                        const policy = row.group?.policy.native || row.group?.policy.kind || row.entry?.policy || 'select';
                        return (
                          <ListItem
                            key={row.name}
                            data-group-row={row.name}
                            tabIndex={-1}
                            xstyle={styles.row}
                            label={row.name}
                            description={description(row)}
                            isSelected={row.name === current?.name && (!phone || sheetOpen)}
                            onClick={() => open(row.name)}
                            startContent={
                              <StatusDot variant={health ? dots[health.status] : 'neutral'} label={t[health ? healthKeys[health.status] : 'stagedGroup']} />
                            }
                            endContent={
                              <HStack gap={3} vAlign="center" style={{width: 'auto'}}>
                                <Text type="supporting" color="secondary">
                                  {policyLabel(policy, t)}
                                </Text>
                                {mode === 'switch' && (
                                  <Text type="supporting" color="secondary" hasTabularNumbers xstyle={styles.latency}>
                                    {health?.latency == null ? '—' : `${Math.round(health.latency)} ms`}
                                  </Text>
                                )}
                              </HStack>
                            }
                          />
                        );
                      })}
                    </List>
                  </RowEntrance>
                </VStack>
              )}
            </CollectionLoading>
            {ready && !rows.length && <EmptyState title={search ? t.noMatches : t.emptyGroups} />}
          </VStack>
        }
        end={
          phone ? undefined : (
            <>
              <ResizeHandle resizable={panel.props} isReversed isAlwaysVisible={false} label={t.resizeInspector} />
              <LayoutPanel ref={watchPanel} resizable={panel.props} hasDivider padding={0} label={t.groupDetails}>
                <VStack gap={0} xstyle={styles.inspector}>
                  <CollectionLoading loading={!inspectorReady} name="group-inspector" prepared={expectedCount !== undefined}>
                    {showPlaceholder =>
                      inspectorReady ? (
                        body
                      ) : showPlaceholder ? (
                        <GroupInspectorPlaceholder
                          count={initialGroup?.member_count ?? 0}
                          nestedCount={initialGroup && initialLeafCount !== undefined ? initialGroup.member_count - initialLeafCount : 0}
                        />
                      ) : null
                    }
                  </CollectionLoading>
                </VStack>
              </LayoutPanel>
            </>
          )
        }
      />
      {phone && (sheetOpen || sheetMounted) && (
        <BottomSheet
          ref={sheetRef}
          isOpen={sheetOpen && !!current}
          onOpenChange={value => !value && setSheetOpen(false)}
          label={current?.name ?? t.groupDetails}
          height="tall"
        >
          {sheetMounted || sheetOpen ? (
            <VStack gap={0}>
              <HStack hAlign="end" paddingInline={3} paddingBlockStart={2} data-sheet-close>
                <IconButton
                  label={t.close}
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={Close} size="sm" />}
                  style={{position: 'relative', zIndex: 2}}
                  onClick={() => setSheetOpen(false)}
                />
              </HStack>
              {body}
            </VStack>
          ) : null}
        </BottomSheet>
      )}
      {creating && source && (
        <GroupEditor
          content={content}
          others={others}
          taken={groups.map(group => group.name)}
          writable={writable}
          close={() => setCreating(false)}
          stage={(next, name) => {
            stage(next);
            toast({body: t.groupCreated.replace('{name}', name), type: 'info'});
            setMode('edit');
            setSearch('');
            open(name);
            setReveal({name, added: true});
          }}
        />
      )}
      {copyFrom && source && (
        <Suspense fallback={null}>
          <CopyMembers
            source={source}
            name={copyFrom}
            draft={draft}
            stage={(base, next, name) => {
              setDraft({source: base, content: next});
              setSearch('');
              setReveal({name, added: false});
            }}
            close={() => setCopyFrom(null)}
          />
        </Suspense>
      )}
      {groupText && source && (
        <GroupTextDialog
          content={content}
          others={others}
          original={groupText.name}
          duplicate={groupText.duplicate}
          stage={stage}
          close={() => setGroupText(null)}
        />
      )}
      <EditDialog
        open={deleting !== null}
        title={t.deleteGroup}
        close={() => setDeleting(null)}
        pending={task.busy !== null}
        label={t.delete}
        destructive
        notice={task.notice}
        confirm={() =>
          void task.run('delete', async () => {
            if (!deleting) return undefined;
            stage(deleteGroup(content, others, deleting));
            setDeleting(null);
            setSelected(null);
            return undefined;
          })
        }
      >
        <Text weight="medium" xstyle={styles.wrap}>
          {deleting}
        </Text>
        <Text>{t.deleteDescription}</Text>
      </EditDialog>
      <ReviewDialog
        open={reviewing}
        close={() => setReviewing(false)}
        pending={task.busy !== null}
        notice={task.notice}
        warning={blocked}
        summary={describeGroupChanges(changes).map(item => phraseText(item, t))}
        before={draft?.source.content ?? ''}
        after={draft?.content ?? ''}
        confirm={() =>
          void task.run('apply', async () => {
            if (!draft) return undefined;
            await applyContent(connection, draft.source, draft.content);
            setDraft(undefined);
            try {
              await Promise.all([read.reload(), resources.reload()]);
            } finally {
              setReviewing(false);
            }
            return {key: 'changesSaved'};
          })
        }
      />
    </>
  );
}
