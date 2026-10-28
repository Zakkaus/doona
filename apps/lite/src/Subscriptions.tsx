import {AddNodeToGroup} from './AddNodeToGroup';
import {ProbeFeedback, useNodeProbes, useProbeUpdates} from './NodeProbes';
import {SubscriptionFormInterval, intervalSummary, intervalValue} from './SubscriptionFormInterval';
import {useFeatureDraft} from './useFeatureDraft';
import {CollectionLoading, RowPlaceholder} from './ui/CollectionLoading';
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Layout adapted from the Astryx table-collapsible template; see ASTRYX-TEMPLATES-LICENSE.

import {Badge} from '@astryxdesign/core/Badge';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {LoadingText, loadingControl} from './ui/LoadingText';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Grid} from '@astryxdesign/core/Grid';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Item} from '@astryxdesign/core/Item';
import {RowMenu as MoreMenu} from './ui/RowMenu';
import {RowTooltip as Tooltip} from './ui/RowTooltip';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {MEDIA} from './ui/metrics.stylex';
import {CollectionToolbar} from './ui/CollectionToolbar';
import {PageFrame, pageRhythm} from './ui/PageFrame';
import {usePageCommand, useSearchTarget} from './ui/commands';
import './ui/disclosure.css';
import {Refresh} from './ui/icons';
import {useDisclosureSet} from './ui/useDisclosureSet';
import {useExpectedCount} from './ui/useExpectedCount';

import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Section} from '@astryxdesign/core/Section';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {lazy, Suspense, useCallback, useContext, useEffect, useState} from 'react';
import type {Node, Provider} from '../../../src/api/model';
import {LiteError, readMain, readProviders, providerSnapshot, mainSnapshot, refreshProvider, type Connection} from './api';
import {LocaleContext, useMessages} from './i18n';
import {noticeText, useFocusRefresh, useRead, useTask} from './state';
import {Feedback, ReadState, useNoticeToast} from './ui';
import {DateStamp} from './ui/DateStamp';
import {StatusLabel} from './ui/StatusLabel';
import {RowEntrance} from './ui/motion';
import {revealRow} from './ui/motion/revealRow';
import {usePaged} from './ui/usePaged';

import {completeSubscriptionUrl, isSubscriptionUrl, readSubscriptionEntries} from '../../../src/dae/subscriptions';
import {isQuotable} from '../../../src/dae/text';
import {canWrite, readNodes} from './config';
import {refreshAdded, stageSubscription} from './subscriptionDraft';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {DialogActions} from './ui/DialogActions';

import {SubscriptionFeatureNodes} from './SubscriptionFeatureNodes';
const ShareDialog = lazy(() => import('./ShareDialog'));
const status = {
  ok: {key: 'providerOk', variant: 'success'},
  stale: {key: 'providerStale', variant: 'warning'},
  error: {key: 'providerError', variant: 'error'},
  never: {key: 'providerNever', variant: 'neutral'},
  empty: {key: 'providerEmpty', variant: 'warning'}
} as const;
const summaryKeys = {add: 'reviewSubscriptionAdded', edit: 'reviewSubscriptionChanged', delete: 'reviewSubscriptionRemoved'} as const;

export function Subscriptions({connection, setBusy}: {connection: Connection; setBusy: (busy: boolean) => void}) {
  const {api, capabilities} = connection;
  const t = useMessages();
  const locale = useContext(LocaleContext);
  const read = useRead(useCallback((signal?: AbortSignal) => readProviders(api, signal), [api]));
  const config = useRead(
    useCallback((signal?: AbortSignal) => (capabilities.resources.config.available ? readMain(api, signal) : Promise.resolve(undefined)), [api, capabilities])
  );
  const probes = useNodeProbes(connection);
  useProbeUpdates(probes);
  const [groupNode, setGroupNode] = useState<Node | null>(null);
  const draft = useFeatureDraft(connection, config.data, setBusy, async () => {
    const before = read.data ?? [];
    const providers = await reload();
    const notice = canRefresh ? await refreshAdded(connection, before, providers) : undefined;
    await read.reload();
    return notice;
  });
  const [interval, setInterval] = useState('');
  const [originalInterval, setOriginalInterval] = useState<number | null>(null);
  const resetInterval = (value: number | null = null) => {
    setOriginalInterval(value);
    setInterval('');
  };
  const ready = read.data !== undefined;
  const loading = !ready && read.loading;
  const compact = useMediaQuery(MEDIA.phone);
  const expectedCount = useExpectedCount(connection.api, 'subscriptions', read.data?.filter(provider => provider.kind === 'subscription').length);
  const [share, setShare] = useState<{name: string; link: string} | null>(null);
  const [expanded, setExpanded] = useDisclosureSet('doona-lite.subscriptions.open');
  const [dialog, setDialog] = useState<'add' | 'edit' | 'delete' | null>(null);
  const [dialogMounted, setDialogMounted] = useState(false);
  if (dialog && !dialogMounted) setDialogMounted(true);
  const attachDialog = useCallback((element: HTMLDialogElement | null) => {
    if (!element) return;
    const closed = () => setDialogMounted(false);
    element.addEventListener('close', closed);
    return () => element.removeEventListener('close', closed);
  }, []);
  const [original, setOriginal] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [reveal, setReveal] = useState<string | null>(null);
  const close = () => {
    setDialog(null);
    setUrl('');
  };
  const writable = canWrite(connection, config.data);
  const layoutSource = config.data ?? mainSnapshot(api);
  const entries = layoutSource ? readSubscriptionEntries(draft.dirty ? draft.content : layoutSource.content) : [];
  const edit = (item: Provider, kind: 'edit' | 'delete') => {
    const entry = entries.find(e => e.tag === item.name);
    if (!entry) return;
    setOriginal(entry.tag);
    setName(entry.tag);
    setUrl(entry.url);
    resetInterval(entry.interval);
    setDialog(kind);
  };
  const reload = async () => {
    const [providers] = await Promise.all([read.reload(), config.reload()]);
    return providers;
  };
  const task = useTask(setBusy);
  useNoticeToast(task.notice);
  useFocusRefresh(read.reload, !!read.data && task.busy === null && !draft.dirty);
  const [batch, setBatch] = useState<{done: number; failed: Provider[]} | null>(null);
  const [search, setSearch] = useState('');
  usePageCommand('add-subscription', ready && writable && !task.busy && !draft.busy, () => {
    setName('');
    setUrl('');
    setOriginal('');
    resetInterval();
    setDialog('add');
  });
  useSearchTarget('subscription', ready, target => {
    const provider = read.data?.find(item => item.id === target.id);
    setSearch(provider?.name ?? target.id);
    setExpanded(new Set([target.id]));
    requestAnimationFrame(() => {
      const item = document.querySelector<HTMLElement>(`[data-provider-id="${CSS.escape(target.id)}"]`);
      item?.scrollIntoView({block: 'center'});
      // Astryx 0.6.8 exposes no Collapsible trigger ref or imperative focus API.
      item?.querySelector<HTMLButtonElement>('.astryx-collapsible-trigger')?.focus();
    });
  });
  const canRefresh = capabilities.resources.providers.can_refresh === true && capabilities.resources.operations.available;
  const providers = [...(read.data ?? providerSnapshot(api) ?? [])];
  if (draft.dirty)
    for (const entry of entries) {
      if (!providers.some(provider => provider.kind === 'subscription' && provider.name === entry.tag))
        providers.push({
          id: `draft:${entry.tag}`,
          name: entry.tag,
          kind: 'subscription',
          url_redacted: entry.url,
          node_count: 0,
          updated_at: null,
          expires_at: null,
          traffic: null,
          status: 'stale',
          last_error: null
        });
    }
  const filtered = providers
    .filter(provider => provider.kind === 'subscription')
    .filter(provider => provider.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const {pageRows, pager} = usePaged(filtered);
  const allExpanded = filtered.length > 0 && filtered.every(item => expanded.has(item.id));
  const derivedName = subscriptionHost(url);
  const savedName = name.trim() || derivedName;
  const intervalSeconds = intervalValue(interval, originalInterval);
  const intervalInvalid =
    interval !== '' &&
    (intervalSeconds === null || !Number.isSafeInteger(intervalSeconds) || intervalSeconds < 0 || (/[mh]$/.test(interval) && intervalSeconds === 0));
  const invalid =
    dialog === 'delete'
      ? undefined
      : intervalInvalid
        ? t.intervalInvalid
        : !url.trim()
          ? t.subscriptionLinkRequired
          : !isSubscriptionUrl(url) || !derivedName
            ? t.subscriptionLinkInvalid
            : dialog === 'add' && (entries.some(e => e.tag === savedName) || read.data?.some(item => item.name === savedName))
              ? t.subscriptionNameUsed
              : !isQuotable(savedName)
                ? t.invalidField
                : undefined;
  useEffect(() => {
    if (!reveal || dialog) return;
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-provider-id="${CSS.escape(reveal)}"]`);
      if (!row) return;
      revealRow(row, true);
      setReveal(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal, dialog, pageRows]);
  return (
    <PageFrame
      title={t.subscriptions}
      description={t.subscriptionsDescription}
      ready={ready}
      refreshing={!!read.data && (read.loading || task.busy !== null)}
      actions={
        <>
          <Button
            label={batch?.failed.length ? t.retryFailed : t.refreshAll}
            variant="secondary"
            isLoading={task.busy === 'all'}
            isDisabled={!canRefresh || task.busy !== null || read.loading}
            onClick={() =>
              void task.run('all', async () => {
                const targets = batch?.failed.length ? batch.failed : (read.data ?? []).filter(provider => provider.kind === 'subscription');
                const failed: Provider[] = [];
                let done = 0;
                for (const provider of targets) {
                  try {
                    const result = await refreshProvider(api, provider.id);
                    if ('degraded' in result) failed.push(provider);
                    else done++;
                  } catch {
                    failed.push(provider);
                  }
                }
                setBatch({done, failed});
                await read.reload().catch(() => {});
                return {key: failed.length ? 'refreshPartial' : 'refreshed'};
              })
            }
          />
          <Button
            label={t.addSubscription}
            variant={draft.dirty ? 'secondary' : 'primary'}
            isDisabled={!writable || task.busy !== null || draft.busy}
            onClick={() => {
              setName('');
              setUrl('');
              resetInterval();
              setOriginal('');
              setDialog('add');
            }}
          />
        </>
      }
      footer={draft.footer}
      toolbar={
        <CollectionToolbar>
          <TextInput label={t.searchSubscriptions} isLabelHidden placeholder={t.searchSubscriptions} value={search} onChange={setSearch} width={320} hasClear />
          <Button
            label={allExpanded ? t.collapseAll : t.expandAll}
            variant="ghost"
            size="md"
            style={{marginInlineStart: compact ? 'calc(-1 * var(--spacing-3))' : 0}}
            isDisabled={!ready || !filtered.length}
            onClick={() => setExpanded(allExpanded ? new Set() : new Set(filtered.map(item => item.id)))}
          />
        </CollectionToolbar>
      }
      content={
        <VStack gap={pageRhythm.section}>
          {!writable && !config.loading && <Text color="secondary">{t.readOnly}</Text>}

          <ProbeFeedback probes={probes} />
          <ReadState error={read.error} reload={read.reload} />
          {task.notice && 'error' in task.notice && <Feedback notice={task.notice} />}
          <CollectionLoading loading={!ready && read.loading} name="subscriptions">
            <RowEntrance>
              <VStack as="ul" gap={0} data-collection>
                {!ready &&
                  read.loading &&
                  !pageRows.length &&
                  Array.from({length: expectedCount}, (_, i) => (
                    <VStack as="li" key={i} data-skeleton-row className="lite-subscription-row">
                      <Grid className="lite-disclosure-grid" style={compact ? {gridTemplateColumns: 'minmax(0, 1fr) fit-content(50%)'} : undefined}>
                        <Collapsible
                          className="lite-disclosure"
                          chevronPosition="start"
                          isOpen={false}
                          trigger={
                            <Item
                              className="lite-subscription-item"
                              style={{paddingBlockStart: 0}}
                              label={
                                <HStack gap={2} wrap="wrap" vAlign="center">
                                  <RowPlaceholder width="12ch" />
                                  <Badge {...loadingControl(true, 'label', noticeText(t.subscriptionNodeCount, {count: '0'}))} />
                                </HStack>
                              }
                              description={
                                <HStack gap={2} wrap="wrap" vAlign="center">
                                  <RowPlaceholder supporting width="18ch" />
                                  <RowPlaceholder supporting width="10ch" />
                                </HStack>
                              }
                            />
                          }
                        />
                        <HStack className="lite-disclosure-actions" gap={1} vAlign="center" hAlign="end" style={{minWidth: 0}}>
                          <StatusLabel label={t.providerOk} variant="success" loading />
                          {[0, 1].map(index => (
                            <Skeleton key={index} className="lite-loading-shape lite-loading-icon" />
                          ))}
                        </HStack>
                      </Grid>
                    </VStack>
                  ))}
                {pageRows.map(provider => {
                  const state =
                    provider.status === 'error' || (!provider.updated_at && provider.last_error)
                      ? status.error
                      : !provider.updated_at
                        ? status.never
                        : provider.node_count === 0
                          ? status.empty
                          : status[provider.status];
                  return (
                    <VStack as="li" key={provider.id} data-provider-id={provider.id} tabIndex={-1} className="lite-subscription-row">
                      <Grid className="lite-disclosure-grid" style={compact ? {gridTemplateColumns: 'minmax(0, 1fr) fit-content(50%)'} : undefined}>
                        <Collapsible
                          className="lite-disclosure"
                          chevronPosition="start"
                          isOpen={expanded.has(provider.id)}
                          onOpenChange={open =>
                            setExpanded(previous => {
                              const next = new Set(previous);
                              if (open) next.add(provider.id);
                              else next.delete(provider.id);
                              return next;
                            })
                          }
                          trigger={
                            <Item
                              className="lite-subscription-item"
                              style={{paddingBlockStart: 0}}
                              label={
                                <HStack gap={2} wrap="wrap" vAlign="center">
                                  <LoadingText weight="semibold" loading={loading} children={provider.name} />
                                  <Badge
                                    {...loadingControl(
                                      loading,
                                      'label',
                                      noticeText(provider.node_count === 1 ? t.subscriptionNodeCountOne : t.subscriptionNodeCount, {
                                        count: new Intl.NumberFormat(locale).format(provider.node_count)
                                      })
                                    )}
                                  />
                                </HStack>
                              }
                              description={
                                <HStack gap={2} wrap="wrap" vAlign="center">
                                  <LoadingText type="supporting" color="secondary" loading={loading}>
                                    {subscriptionHost(entries.find(e => e.tag === provider.name)?.url)}
                                  </LoadingText>
                                  {provider.updated_at && <DateStamp plain relative value={provider.updated_at} loading={loading} />}
                                  {!!entries.find(entry => entry.tag === provider.name)?.interval && (
                                    <LoadingText type="supporting" color="secondary" loading={loading}>
                                      {intervalSummary(entries.find(entry => entry.tag === provider.name)?.interval, t)}
                                    </LoadingText>
                                  )}
                                  {probes.running === provider.id ? (
                                    <Text type="supporting" role="status">
                                      {t.probeRunning}
                                    </Text>
                                  ) : (
                                    probes.summaries.has(provider.id) && (
                                      <Text type="supporting" hasTabularNumbers role="status" data-probe-summary={provider.id}>
                                        {t.probeAvailable
                                          .replace('{answered}', String(probes.summaries.get(provider.id)!.answered))
                                          .replace('{total}', String(probes.summaries.get(provider.id)!.total))}
                                        {probes.summaries.get(provider.id)!.unsupported > 0
                                          ? ` (${t.probeUnsupported}: ${probes.summaries.get(provider.id)!.unsupported})`
                                          : ''}
                                      </Text>
                                    )
                                  )}
                                </HStack>
                              }
                            />
                          }
                        >
                          {expanded.has(provider.id) && (
                            <Section variant="muted" padding={pageRhythm.inset}>
                              <SubscriptionFeatureNodes
                                loading={loading}
                                addToGroup={writable && !draft.busy && task.busy === null ? setGroupNode : undefined}
                                connection={connection}
                                provider={provider.id}
                                count={provider.node_count}
                                edit={writable ? () => edit(provider, 'edit') : undefined}
                                version={provider.updated_at ?? undefined}
                              />
                            </Section>
                          )}
                        </Collapsible>
                        <HStack className="lite-disclosure-actions" gap={1} vAlign="center" hAlign="end" style={{minWidth: 0}}>
                          <StatusLabel label={t[state.key]} variant={state.variant} loading={loading} />
                          <Tooltip content={t.refresh}>
                            <IconButton
                              label={`${t.refresh}: ${provider.name}`}
                              {...loadingControl(loading, 'icon', <Icon icon={Refresh} size="sm" />)}
                              variant="ghost"
                              size="sm"
                              isLoading={task.busy === provider.id}
                              isDisabled={!canRefresh || task.busy !== null || read.loading || provider.id.startsWith('draft:')}
                              onClick={() =>
                                void task.run(provider.id, async () => {
                                  try {
                                    const result = await refreshProvider(api, provider.id);
                                    return {key: 'degraded' in result ? 'degraded' : 'refreshed'};
                                  } finally {
                                    await read.reload().catch(() => {});
                                  }
                                })
                              }
                            />
                          </Tooltip>
                          <MoreMenu
                            {...loadingControl(loading, 'icon')}
                            label={`${t.actions}: ${provider.name}`}
                            size="sm"
                            variant="ghost"
                            items={[
                              {
                                label: t.testLatency,
                                isDisabled: !probes.available || probes.running !== null || task.busy !== null || provider.id.startsWith('draft:'),
                                onClick: () =>
                                  void task.run(`probe:${provider.id}`, async () => {
                                    const nodes = await readNodes(connection);
                                    await probes.run(
                                      nodes.filter(node => node.provider_id === provider.id),
                                      provider.id
                                    );
                                    return undefined;
                                  })
                              },
                              {
                                label: t.share,
                                isDisabled: !entries.some(e => e.tag === provider.name),
                                onClick: () => setShare({name: provider.name, link: entries.find(e => e.tag === provider.name)!.url})
                              },
                              {
                                label: t.edit,
                                isDisabled: !writable || task.busy !== null || draft.busy || read.loading || !entries.some(e => e.tag === provider.name),
                                onClick: () => edit(provider, 'edit')
                              },
                              {
                                label: t.delete,
                                isDisabled: !writable || task.busy !== null || draft.busy || read.loading || !entries.some(e => e.tag === provider.name),
                                onClick: () => edit(provider, 'delete')
                              }
                            ]}
                          />
                        </HStack>
                      </Grid>
                    </VStack>
                  );
                })}
              </VStack>
              {read.data && !filtered.length && <EmptyState title={search ? t.noMatches : t.emptyProviders} />}
            </RowEntrance>
          </CollectionLoading>
          {pager}
          {batch && (
            <Text type="supporting" color="secondary">
              {t.completed}: {new Intl.NumberFormat(locale).format(batch.done)}
              {batch.failed.length > 0 && `, ${t.notRefreshed}: ${batch.failed.map(item => item.name).join(', ')}`}
            </Text>
          )}
          {draft.review}
          {groupNode && (
            <AddNodeToGroup node={groupNode} providers={read.data ?? []} content={draft.content} stage={draft.stage} close={() => setGroupNode(null)} />
          )}
          {share && (
            <Suspense fallback={null}>
              <ShareDialog {...share} close={() => setShare(null)} />
            </Suspense>
          )}
          {dialogMounted && (
            <Dialog
              ref={attachDialog}
              isOpen={dialog !== null}
              width={640}
              maxHeight="85dvh"
              purpose={task.busy !== null ? 'required' : 'form'}
              onOpenChange={open => {
                if (!open && task.busy === null) close();
              }}
            >
              <Layout
                header={
                  <DialogHeader
                    title={dialog === 'add' ? t.addSubscription : dialog === 'edit' ? t.editSubscription : t.deleteSubscription}
                    onOpenChange={task.busy !== null ? undefined : close}
                  />
                }
                content={
                  <LayoutContent className="lite-dialog-content">
                    <VStack gap={4}>
                      {dialog === 'delete' ? (
                        <>
                          <Text weight="medium">{name}</Text>
                          <Text>{t.deleteDescription}</Text>
                        </>
                      ) : (
                        <>
                          <TextInput label={t.subscriptionUrl} value={url} onChange={setUrl} isDisabled={task.busy !== null} />
                          <TextInput
                            label={dialog === 'add' ? t.subscriptionNameOptional : t.name}
                            value={name}
                            placeholder={derivedName}
                            onChange={setName}
                            description={dialog === 'edit' ? t.subscriptionNameFixed : undefined}
                            isDisabled={dialog === 'edit' || task.busy !== null}
                          />
                          <SubscriptionFormInterval value={interval} original={originalInterval} change={setInterval} disabled={task.busy !== null} />
                        </>
                      )}
                      {task.notice && 'error' in task.notice && <Feedback notice={task.notice} />}
                    </VStack>
                  </LayoutContent>
                }
                footer={
                  <LayoutFooter>
                    <DialogActions
                      onCancel={close}
                      confirmLabel={dialog === 'delete' ? t.delete : t.save}
                      variant={dialog === 'delete' ? 'destructive' : 'primary'}
                      isPending={task.busy !== null}
                      isCancelDisabled={task.busy !== null}
                      isConfirmDisabled={!writable || !!invalid || task.busy !== null}
                      confirmTooltip={!writable ? t.readOnly : invalid}
                      onReset={
                        dialog === 'edit'
                          ? () => {
                              const entry = entries.find(item => item.tag === original);
                              if (entry) {
                                setName(entry.tag);
                                setUrl(entry.url);
                                resetInterval(entry.interval);
                              }
                            }
                          : undefined
                      }
                      onConfirm={() => {
                        const kind = dialog;
                        if (!kind) return;
                        void task.run('save', async () => {
                          if (!config.data || !writable) throw new LiteError('readOnly');
                          if (
                            !isQuotable(savedName) ||
                            (kind === 'add' && (entries.some(e => e.tag === savedName) || read.data?.some(item => item.name === savedName)))
                          )
                            throw new LiteError('invalidField');
                          const subject = kind === 'add' ? savedName : original;
                          await stageSubscription(
                            connection,
                            config.data,
                            draft,
                            {kind, name: subject, url, interval: interval === '' ? undefined : intervalSeconds},
                            noticeText(t[summaryKeys[kind]], {name: subject})
                          );
                          close();
                          if (kind === 'add') {
                            setSearch(savedName);
                            setReveal(`draft:${savedName}`);
                          }
                          return undefined;
                        });
                      }}
                    />
                  </LayoutFooter>
                }
              />
            </Dialog>
          )}
        </VStack>
      }
    />
  );
}

function subscriptionHost(url?: string) {
  if (!url) return '';
  try {
    return new URL(completeSubscriptionUrl(url)).host;
  } catch {
    return '';
  }
}
