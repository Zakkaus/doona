import * as stylex from '@stylexjs/stylex';
import {AddNodeToGroup} from './AddNodeToGroup';
import {NodeLatency, NodeProbeButton, ProbeFeedback, useNodeProbes} from './NodeProbes';
import {useFeatureDraft} from './useFeatureDraft';
import {CollectionLoading, RowPlaceholder} from './ui/CollectionLoading';
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Layout adapted from the Astryx table-filter template; see ASTRYX-TEMPLATES-LICENSE.

import {Selector} from '@astryxdesign/core/Selector';
import {useTableGroupedRows, useTableSelection, useTableSelectionState, type TablePlugin} from '@astryxdesign/core/Table';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {useToast} from '@astryxdesign/core/Toast';
import {CollectionToolbar} from './ui/CollectionToolbar';
import {PageFrame, pageRhythm} from './ui/PageFrame';
import {usePageCommand, useSearchTarget} from './ui/commands';
import {useExpectedCount} from './ui/useExpectedCount';

import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {LoadingText, loadingControl} from './ui/LoadingText';
import {RowMenu as MoreMenu} from './ui/RowMenu';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {pixel, proportional, Table, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import type {Node} from '../../../src/api/model';
import {nodeReferenced, readNodeEntries, writeNodeEntry, type NodeEntry} from '../../../src/dae/nodes';
import {quote} from '../../../src/dae/text';
import {applyContent, configSnapshot, mainSnapshot, providerSnapshot, LiteError, errorKey, type Connection} from './api';
import {appendEntry, canWrite, inspectLinks, linkInfo, nodeSnapshot, readNodePage, removeEntry, type ImportRow} from './config';
import {useMessages} from './i18n';
import {useFocusRefresh, useRead, useTask} from './state';
import {ReadState, useNoticeToast} from './ui';
import {EditDialog} from './ui/EditDialog';
import {MEDIA} from './ui/metrics.stylex';
import {RowEntrance} from './ui/motion';
import {revealRow} from './ui/motion/revealRow';
import {usePaged} from './ui/usePaged';
import {focusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {usePinnedColumns} from './ui/usePinnedColumns';

const ShareDialog = lazy(() => import('./ShareDialog'));
let LoadedNodeForm: typeof import('./NodeForm').default | undefined;
const loadNodeForm = async () => (LoadedNodeForm ??= (await import('./NodeForm')).default);

type Row = Node & Record<string, unknown>;
export function Nodes({connection, setBusy}: {connection: Connection; setBusy: (busy: boolean) => void}) {
  const t = useMessages();
  const toast = useToast();
  const compact = useMediaQuery(MEDIA.phone);
  const [formReady, setFormReady] = useState(!!LoadedNodeForm);
  const NodeForm = formReady ? LoadedNodeForm : undefined;
  const read = useRead(useCallback((signal?: AbortSignal) => readNodePage(connection, signal), [connection]));
  const ready = read.data !== undefined;
  const expectedCount = useExpectedCount(connection.api, 'nodes', (read.data?.nodes ?? nodeSnapshot(connection.api))?.length);
  const task = useTask(setBusy);
  const probes = useNodeProbes(connection);
  const groupDraft = useFeatureDraft(connection, read.data?.source, setBusy, async () => void (await read.reload()));
  const [groupNode, setGroupNode] = useState<Node | null>(null);
  useNoticeToast(task.notice);
  useFocusRefresh(read.reload, !!read.data && task.busy === null && !groupDraft.dirty);
  const [share, setShare] = useState<{name: string; link: string} | null>(null);
  const [search, setSearch] = useState('');
  const [protocol, setProtocol] = useState('all');
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>());
  const [bulkDelete, setBulkDelete] = useState(false);
  const [dialog, setDialog] = useState<'add' | 'edit' | 'delete' | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  useEffect(() => {
    void loadNodeForm()
      .then(() => setFormReady(true))
      .catch(() => {});
  }, []);
  const openForm = async (kind: 'add' | 'edit') => {
    if (kind === 'add') {
      setAddTab('paste');
      setManualOpened(false);
      startTransition(() => setDialog(kind));
      return;
    }
    setFormLoading(true);
    await task.run('form', async () => {
      await loadNodeForm();
      setFormReady(true);
      setDialog(kind);
      return undefined;
    });
    setFormLoading(false);
  };
  const [entry, setEntry] = useState<NodeEntry | null>(null);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ImportRow[] | null>(null);
  const [addTab, setAddTab] = useState('paste');
  const [manualOpened, setManualOpened] = useState(false);
  const [parseError, setParseError] = useState<unknown>();
  const [added, setAdded] = useState<string[]>([]);
  const nodeSource = read.data?.source;
  useEffect(() => {
    if (dialog !== 'add' || addTab !== 'paste' || !input.trim() || !nodeSource) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void inspectLinks(connection, nodeSource, input).then(
        rows => {
          if (current) setPreview(rows);
        },
        error => {
          if (current) setParseError(error);
        }
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [input, dialog, addTab, connection, nodeSource]);
  const lineNumbers = input.split(/\r?\n/).flatMap((line, i) => (line.trim() ? [i + 1] : []));
  const invalidLine = preview?.findIndex(row => !row.valid) ?? -1;
  const validCount = preview?.filter(row => row.valid).length ?? 0;
  const pasteBlocker = !input.trim()
    ? t.pasteRequired
    : parseError !== undefined
      ? t[errorKey(parseError)]
      : !preview
        ? t.parsingLinks
        : invalidLine >= 0
          ? t.invalidLinkLine.replace('{n}', String(lineNumbers[invalidLine]))
          : '';
  const returnTarget = useRef<{id: string; row: boolean} | null>(null);
  const close = () => {
    const target = returnTarget.current;
    returnTarget.current = null;
    if (target)
      requestAnimationFrame(() => {
        const name = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(target.id)}"]`);
        (target.row ? name?.closest('tr') : name)?.focus();
      });
    setDialog(null);
    setInput('');
    setLink('');
    setEntry(null);
    setPreview(null);
    setParseError(undefined);
  };
  const layoutSource = read.data?.source ?? mainSnapshot(connection.api);
  const layoutConfig = read.data?.config ?? configSnapshot(connection.api);
  const entries = useMemo(() => (layoutSource ? readNodeEntries(layoutSource.content) : []), [layoutSource]);
  const entryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const source of layoutConfig?.sources ?? []) {
      for (const item of readNodeEntries(source.content)) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
    }
    return counts;
  }, [layoutConfig]);
  const writable = canWrite(connection, read.data?.source) && connection.capabilities.resources.config_validate.modes?.includes('full');
  const groupDisabled = !writable || read.loading || task.busy !== null || groupDraft.busy;
  const disabled = groupDisabled || groupDraft.dirty;
  usePageCommand('add-node', !disabled, () => {
    setName('');
    setLink('');
    void openForm('add');
  });
  const manual = (node: Node) =>
    (read.data?.providers ?? providerSnapshot(connection.api))?.find(provider => provider.id === node.provider_id)?.kind === 'inline';
  const find = (node: Node) => (!manual(node) || entryCounts.get(node.name) !== 1 ? undefined : entries.find(item => item.name === node.name));
  const show = (kind: 'edit' | 'delete', item: NodeEntry) => {
    setEntry(item);
    setName(item.name);
    setLink(item.link);
    if (kind === 'edit') void openForm(kind);
    else setDialog(kind);
  };
  useSearchTarget('node', ready, target => {
    setProtocol('all');
    const node = read.data?.nodes.find(node => node.id === target.id);
    if (!node) {
      setSearch(target.id);
      return;
    }
    setSearch(node.name || node.id);
    const entry = find(node);
    if (entry && writable) {
      returnTarget.current = {id: node.id, row: false};
      show('edit', entry);
    } else
      requestAnimationFrame(() => {
        const item = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(node.id)}"]`);
        item?.scrollIntoView({block: 'center'});
        item?.focus();
      });
  });
  const filtered = (read.data?.nodes ?? nodeSnapshot(connection.api) ?? []).filter(
    node =>
      `${node.name} ${node.protocol ?? ''} ${node.subscription_tag ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (protocol === 'all' || node.protocol === protocol)
  );
  const selectedNodes = (read.data?.nodes ?? []).filter(node => selectedKeys.has(node.id));
  const bulkReferenced = selectedNodes.some(node => read.data?.config?.sources.some(source => nodeReferenced(source.content, node.name)));
  const columns: TableColumn<Row>[] = [
    {
      key: 'name',
      header: compact ? (
        <HStack gap={2} hAlign="between">
          <LoadingText loading={!ready} className="lite-loading-header" children={t.name} />
          <LoadingText loading={!ready} className="lite-loading-header" children={t.latency} />
        </HStack>
      ) : (
        t.name
      ),
      width: proportional(2, {minWidth: compact ? 0 : 180}),
      renderCell: item => (
        <VStack gap={1}>
          <LoadingText loading={!ready} weight="medium" textWrap="wrap" tabIndex={-1} data-node-id={item.id} children={item.name || item.id} />
          {compact && (
            <HStack gap={2} vAlign="center">
              <LoadingText loading={!ready} type="supporting" color="secondary" maxLines={1} style={{flexGrow: 1, minWidth: 0}}>
                {item.protocol ?? t.unknown} / {manual(item) ? t.manualLabel : (item.subscription_tag ?? t.unknown)}
              </LoadingText>
              <NodeLatency node={item} probes={probes} compact loading={!ready} />
            </HStack>
          )}
        </VStack>
      )
    },
    {
      key: 'protocol',
      header: t.protocol,
      width: pixel(120),
      renderCell: item => <LoadingText loading={!ready} children={item.protocol ?? t.unknown} />
    },
    {
      key: 'address',
      header: t.address,
      width: proportional(2, {minWidth: 180}),
      renderCell: item =>
        manual(item) ? (
          <LoadingText loading={!ready} textWrap="wrap" children={linkInfo(entries.find(entry => entry.name === item.name)?.link ?? '').address || t.unknown} />
        ) : null
    },
    {
      key: 'origin',
      header: t.origin,
      width: proportional(1, {minWidth: 150}),
      renderCell: item => <LoadingText loading={!ready} textWrap="wrap" children={manual(item) ? t.manualLabel : (item.subscription_tag ?? t.unknown)} />
    },
    {key: 'latency', header: t.latency, width: pixel(152), align: 'end', renderCell: item => <NodeLatency node={item} probes={probes} loading={!ready} />},
    {
      key: 'actions',
      header: '',
      width: pixel(72),
      align: 'end',
      renderCell: item => (
        <HStack hAlign="end" vAlign="center">
          <MoreMenu
            {...loadingControl(!ready, 'icon')}
            label={`${t.actions}: ${item.name || item.id}`}
            variant="ghost"
            size="sm"
            alignment="end"
            placement="above"
            isDisabled={task.busy !== null}
            items={[
              {label: t.addNodeToGroup, isDisabled: groupDisabled, onClick: () => setGroupNode(item)},
              ...(find(item)
                ? [
                    {label: t.share, onClick: () => setShare({name: item.name, link: find(item)!.link})},
                    {label: t.edit, isDisabled: disabled, onClick: () => show('edit', find(item)!)},
                    {label: t.delete, isDisabled: disabled, onClick: () => show('delete', find(item)!)}
                  ]
                : [])
            ]}
          />
        </HStack>
      )
    }
  ];
  const nodeTable = (
    <NodeTable
      key={added.join('\n')}
      rows={filtered}
      loading={!ready}
      columns={compact ? columns.filter(column => ['name', 'actions'].includes(column.key)) : columns}
      manual={manual}
      find={find}
      disabled={disabled}
      selectedKeys={selectedKeys}
      setSelectedKeys={setSelectedKeys}
      edit={(item, id) => {
        returnTarget.current = {id, row: true};
        show('edit', item);
      }}
      added={added}
    />
  );
  const referenced = entry && read.data?.config?.sources.some(source => nodeReferenced(source.content, entry.name));
  const save = () =>
    void task.run('save', async () => {
      if (!read.data?.source || !read.data.config || disabled) throw new LiteError('readOnly');
      let content = read.data.source.content;
      const adding = dialog === 'add';
      const addedRows = adding ? (addTab === 'paste' ? (preview ?? []) : [{name: name.trim(), link: link.trim()}]) : [];
      if (adding && addTab === 'paste') {
        if (!preview?.length || preview.some(item => !item.valid)) throw new LiteError('invalidField');
        for (const row of preview) content = appendEntry(content, 'node', `${quote(row.name)}: ${quote(row.link)}`);
      } else if (dialog === 'add') {
        if (!name.trim() || read.data.nodes.some(node => node.name === name.trim())) throw new LiteError('invalidField');
        content = appendEntry(content, 'node', `${quote(name.trim())}: ${quote(link.trim())}`);
      } else if (dialog === 'edit' && entry) {
        const checked = await inspectLinks(connection, read.data.source, link);
        if (checked.length !== 1 || !checked[0].valid) throw new LiteError('invalidField');
        if (
          name.trim() !== entry.name &&
          (read.data.nodes.some(node => node.name === name.trim()) ||
            read.data.config.sources.some(source => source.id !== read.data!.source!.id && nodeReferenced(source.content, entry.name)))
        )
          throw new LiteError('referenced');
        content = writeNodeEntry(content, entry, {name: name.trim(), link: link.trim()});
      } else if (dialog === 'delete' && entry && !referenced) content = removeEntry(content, entry);
      else throw new LiteError('invalidField');
      await applyContent(connection, read.data.source, content);
      await read.reload().catch(() => {
        throw new LiteError('writtenNotRead');
      });
      close();
      if (adding) {
        setSearch('');
        setProtocol('all');
        setAdded(addedRows.map(row => row.name));
        const first = addedRows[0];
        toast({
          body: addedRows.length === 1 ? t.nodeAdded.replace('{name}', first.name) : t.nodesAdded.replace('{n}', String(addedRows.length)),
          endContent: addedRows.length === 1 ? <Button label={t.share} variant="ghost" size="sm" onClick={() => setShare(first)} /> : undefined
        });
        return undefined;
      }
      return {key: 'changesSaved'};
    });
  const page = (
    <PageFrame
      title={t.nodes}
      description={t.nodesDescription}
      ready={ready}
      refreshing={!!read.data && read.loading}
      actions={
        <>
          <NodeProbeButton probes={probes} nodes={filtered} disabled={!ready} />
          <Button
            label={t.addNode}
            isLoading={formLoading}
            onPointerEnter={() => void loadNodeForm().catch(() => {})}
            onFocus={() => void loadNodeForm().catch(() => {})}
            variant={groupDraft.dirty ? 'secondary' : 'primary'}
            isDisabled={disabled}
            onClick={() => {
              setName('');
              setLink('');
              void openForm('add');
            }}
          />
        </>
      }
      footer={groupDraft.footer}
      toolbar={
        selectedKeys.size > 0 ? (
          <CollectionToolbar>
            <Button label={t.deleteSelected} variant="secondary" isDisabled={disabled} onClick={() => setBulkDelete(true)} />
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {t.selectedCount.replace('{n}', String(selectedKeys.size))}
            </Text>
            <Button label={t.clearSelection} variant="ghost" onClick={() => setSelectedKeys(new Set())} />
          </CollectionToolbar>
        ) : (
          <CollectionToolbar>
            <TextInput
              label={t.searchNodes}
              isLabelHidden
              placeholder={t.searchNodes}
              value={search}
              onChange={setSearch}
              width={320}
              isDisabled={task.busy !== null}
              hasClear
            />
            <Selector
              label={t.protocol}
              isLabelHidden
              value={protocol}
              options={[
                {value: 'all', label: t.allProtocols},
                ...[...new Set((read.data?.nodes ?? []).map(node => node.protocol))]
                  .filter((value): value is string => !!value)
                  .map(value => ({value, label: value}))
              ]}
              onChange={setProtocol}
            />
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {(filtered.length === 1 ? t.resultCountOne : t.resultCount).replace('{n}', String(filtered.length))}
            </Text>
            {(search || protocol !== 'all') && (
              <Button
                label={t.clearAll}
                variant="ghost"
                size="md"
                onClick={() => {
                  setSearch('');
                  setProtocol('all');
                }}
              />
            )}
          </CollectionToolbar>
        )
      }
      content={
        <VStack gap={pageRhythm.section}>
          {!writable && read.data && <Text color="secondary">{t.readOnly}</Text>}

          <ReadState error={read.error} reload={read.reload} />
          <CollectionLoading loading={!ready && read.loading} name="nodes">
            <RowEntrance>
              {!ready && read.loading && !filtered.length && (
                <Table
                  idKey="id"
                  data={Array.from({length: Math.min(expectedCount, 20)}, (_, i) => ({id: String(i)}))}
                  dividers="rows"
                  columns={(compact ? columns.filter(column => ['name', 'actions'].includes(column.key)) : columns).map(column => ({
                    ...column,
                    renderCell: () =>
                      column.key === 'actions' ? (
                        <HStack hAlign="end" vAlign="center">
                          <Skeleton className="lite-loading-shape lite-loading-icon" />
                        </HStack>
                      ) : (
                        <RowPlaceholder lines={column.key === 'name' && compact ? 2 : 1} width={column.key === 'protocol' ? '8ch' : undefined} />
                      )
                  }))}
                />
              )}
              {(read.data || filtered.length > 0) &&
                (filtered.length ? nodeTable : <EmptyState title={search || protocol !== 'all' ? t.noMatches : t.emptyNodes} />)}
            </RowEntrance>
          </CollectionLoading>
          <ProbeFeedback probes={probes} />
        </VStack>
      }
    />
  );
  return (
    <>
      {page}
      {groupDraft.review}
      {groupNode && (
        <AddNodeToGroup
          node={groupNode}
          providers={read.data?.providers ?? []}
          content={groupDraft.content}
          stage={groupDraft.stage}
          close={() => setGroupNode(null)}
        />
      )}
      <EditDialog
        open={bulkDelete}
        title={t.deleteSelected}
        close={() => setBulkDelete(false)}
        pending={task.busy !== null}
        label={t.delete}
        destructive
        disabled={disabled || bulkReferenced || !selectedNodes.length}
        disabledReason={bulkReferenced ? t.referenced : disabled ? t.readOnly : t.selectNodeReason}
        notice={task.notice}
        confirm={() =>
          void task.run('bulk-delete', async () => {
            if (!read.data?.source || disabled || bulkReferenced) throw new LiteError('referenced');
            let content = read.data.source.content;
            for (const node of selectedNodes) {
              const current = readNodeEntries(content).find(item => item.name === node.name);
              if (!current || !find(node)) throw new LiteError('invalidField');
              content = removeEntry(content, current);
            }
            await applyContent(connection, read.data.source, content);
            await read.reload();
            setSelectedKeys(new Set());
            setBulkDelete(false);
            return {key: 'changesSaved'};
          })
        }
      >
        <Text>{bulkReferenced ? t.referenced : t.deleteDescription}</Text>
        <Text>{selectedNodes.map(node => node.name).join(', ')}</Text>
      </EditDialog>
      {share && (
        <Suspense fallback={null}>
          <ShareDialog {...share} close={() => setShare(null)} />
        </Suspense>
      )}
      <EditDialog
        title={dialog === 'add' ? t.addNode : dialog === 'edit' ? t.editNode : t.deleteNode}
        open={dialog !== null}
        close={close}
        pending={task.busy !== null}
        notice={task.notice}
        label={
          dialog === 'add'
            ? addTab === 'paste' && validCount > 1
              ? t.addNodes.replace('{n}', String(validCount))
              : t.add
            : dialog === 'delete'
              ? t.delete
              : t.save
        }
        destructive={dialog === 'delete'}
        disabled={disabled || (dialog === 'add' && addTab === 'paste' ? !!pasteBlocker : dialog === 'delete' ? !!referenced : !name.trim() || !link.trim())}
        disabledReason={
          disabled
            ? t.readOnly
            : dialog === 'add' && addTab === 'paste'
              ? pasteBlocker
              : dialog === 'delete'
                ? t.referenced
                : !name.trim()
                  ? t.enterName
                  : t.invalidField
        }
        confirm={save}
      >
        {dialog === 'add' && (
          <TabList
            role="tablist"
            overflow="visible"
            aria-label={t.addNode}
            value={addTab}
            onChange={value => {
              if (task.busy !== null) return;
              setAddTab(value);
              if (value === 'manual') setManualOpened(true);
            }}
            hasDivider
          >
            <Tab id="node-paste-tab" value="paste" label={t.pasteLinks} panelId="node-paste-panel" />
            <Tab id="node-manual-tab" value="manual" label={t.manualEntry} panelId="node-manual-panel" />
          </TabList>
        )}
        {dialog === 'add' && (
          <VStack
            style={{display: addTab !== 'paste' ? 'none' : undefined}}
            hidden={addTab !== 'paste'}
            role="tabpanel"
            id="node-paste-panel"
            aria-labelledby="node-paste-tab"
            gap={4}
          >
            <TextArea
              label={t.shareLinks}
              description={t.shareLinksHelp}
              value={input}
              onChange={value => {
                setInput(value);
                setPreview(null);
                setParseError(undefined);
              }}
              rows={6}
              width="100%"
              isDisabled={task.busy !== null}
              hasSpellCheck={false}
            />
            {!!preview?.length && (
              <RowEntrance>
                <VStack as="ul" gap={2} aria-live="polite">
                  {preview.map((row, i) => (
                    <VStack as="li" key={i}>
                      <Text textWrap="wrap" style={row.valid ? undefined : {color: 'var(--color-error)'}}>
                        {row.valid
                          ? t.recognizedLink.replace('{protocol}', linkInfo(row.link).protocol.toUpperCase()).replace('{address}', linkInfo(row.link).address)
                          : t.invalidLinkDetail.replace('{n}', String(lineNumbers[i])).replace('{error}', t.parseFailed)}
                      </Text>
                    </VStack>
                  ))}
                </VStack>
              </RowEntrance>
            )}
          </VStack>
        )}
        {(dialog === 'edit' || dialog === 'add') && (
          <VStack
            hidden={dialog === 'add' && addTab !== 'manual'}
            style={{display: dialog === 'add' && addTab !== 'manual' ? 'none' : undefined}}
            role={dialog === 'add' ? 'tabpanel' : undefined}
            id="node-manual-panel"
            aria-labelledby={dialog === 'add' ? 'node-manual-tab' : undefined}
          >
            {NodeForm && (dialog === 'edit' || manualOpened) && (
              <NodeForm
                key={entry?.link ?? 'new'}
                original={entry?.link}
                originalName={entry?.name}
                name={name}
                setName={setName}
                change={setLink}
                disabled={task.busy !== null}
              />
            )}
          </VStack>
        )}
        {dialog === 'delete' && (
          <>
            <Text weight="medium">{entry?.name}</Text>
            <Text>{referenced ? t.referenced : t.deleteDescription}</Text>
          </>
        )}
      </EditDialog>
    </>
  );
}

function NodeTable({
  rows,
  loading,
  columns,
  manual,
  find,
  disabled,
  selectedKeys,
  setSelectedKeys,
  edit,
  added
}: {
  rows: Node[];
  loading: boolean;
  columns: TableColumn<Row>[];
  manual: (node: Node) => boolean | undefined;
  find: (node: Node) => NodeEntry | undefined;
  disabled: boolean;
  selectedKeys: Set<string>;
  setSelectedKeys: Dispatch<SetStateAction<Set<string>>>;
  edit: (entry: NodeEntry, id: string) => void;
  added: string[];
}) {
  const t = useMessages();
  const narrow = useMediaQuery(MEDIA.orchestrate);
  const root = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set<string>());
  const rank = (node: Node) => {
    const index = added.indexOf(node.name);
    return index < 0 ? added.length : index;
  };
  const ordered = [...rows].sort((a, b) => Number(!!manual(b)) - Number(!!manual(a)) || rank(a) - rank(b));
  const {pageRows, pager} = usePaged(ordered);
  const groupKey = (node: Node) => (manual(node) ? 'manual' : `subscription:${node.provider_id ?? node.subscription_tag ?? ''}`);
  const grouped = useTableGroupedRows<Row>({
    data: pageRows as Row[],
    groupBy: groupKey,
    getRowKey: item => item.id,
    collapsedGroups,
    onToggleGroup: key =>
      setCollapsedGroups(previous => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    renderGroupHeader: key => {
      const members = rows.filter(node => groupKey(node) === key);
      const isManual = key === 'manual';
      return (
        <VStack gap={1} xstyle={styles.groupHeading}>
          <LoadingText weight="medium" textWrap="wrap" loading={loading}>
            {t.nodeSectionCount
              .replace('{name}', isManual ? t.manuallyAdded : (members[0]?.subscription_tag ?? t.unknown))
              .replace('{n}', String(members.length))}
          </LoadingText>
          {!isManual && <LoadingText type="supporting" color="secondary" textWrap="wrap" loading={loading} children={t.subscriptionNodesHelp} />}
        </VStack>
      );
    }
  });
  const sticky = usePinnedColumns<Row>(narrow ? ['__selection'] : ['__selection', 'name'], ['actions']);
  const {selectionConfig} = useTableSelectionState<Row>({
    data: pageRows as Row[],
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
    getIsItemSelectable: item => !!find(item),
    getIsItemEnabled: () => !disabled
  });
  const selection = useTableSelection<Row>({...selectionConfig, getRowLabel: item => item.name || item.id});
  const interaction: TablePlugin<Row> = {
    transformBodyCell(props, _column, item, index) {
      if (!item.id || index !== 0) return props;
      return {...props, xstyle: [styles.focusAnchor, ...props.xstyle, styles.focusOutline]};
    },
    transformBodyRow(props, item) {
      if (!item.id) return props;
      const entry = find(item);
      return {
        ...props,
        xstyle: [...props.xstyle, styles.rowFocus, ...(entry ? [] : [styles.static])],
        htmlProps: {
          ...props.htmlProps,
          'aria-disabled': entry ? disabled : undefined,
          onClick: event => {
            if (
              entry &&
              !disabled &&
              event.currentTarget.contains(event.target as HTMLElement) &&
              !(event.target as HTMLElement).closest('button, input, label, a')
            )
              edit(entry, item.id);
          },
          onKeyDown: event => {
            if (entry && !disabled && event.target === event.currentTarget && event.key === 'Enter' && !event.nativeEvent.isComposing) edit(entry, item.id);
          },
          tabIndex: entry ? 0 : undefined
        }
      };
    }
  };
  useEffect(() => {
    if (!added.length || revealed.current) return;
    const frame = requestAnimationFrame(() => {
      const name = root.current?.querySelector<HTMLElement>(`[data-node-id]`);
      const row = name?.closest('tr');
      if (row && added.includes(name?.textContent ?? '')) {
        revealed.current = true;
        revealRow(row, true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [added, pageRows]);
  return (
    <VStack ref={root} gap={4} style={{containerType: 'inline-size'}}>
      <RowEntrance>
        <Table
          data-collection
          data={grouped.data}
          columns={columns}
          idKey={grouped.idKey}
          dividers="rows"
          hasHover
          textOverflow="wrap"
          plugins={{sticky, selection, interaction, grouped: grouped.plugin}}
        />
      </RowEntrance>
      {pager}
    </VStack>
  );
}

const styles = stylex.create({
  rowFocus: {
    // Keep native focus-visible modality, but paint the ring above the pinned cells.
    outlineStyle: 'none',
    '--lite-row-focus-display': {default: 'none', ':focus-visible': 'block'},
    '--lite-row-focus-z': {default: '1', ':focus-visible': '2'}
  },
  focusAnchor: {position: 'relative'},
  focusOutline: {
    zIndex: 'var(--lite-row-focus-z)',
    overflow: 'visible',
    // The selection cell stays pinned at the visible start. Its one overlay spans
    // the table viewport (NodeTable's inline-size container), including actions.
    '::after': {
      content: '""',
      display: 'var(--lite-row-focus-display)',
      position: 'absolute',
      inset: 0,
      width: '100cqi',
      zIndex: 2,
      pointerEvents: 'none',
      // Replace this cell's unused sticky-edge shadow, not its opaque background.
      transform: 'none',
      opacity: 1,
      backgroundImage: 'none',
      transition: 'none',
      outlineWidth: focusVars['--focus-outline-width'],
      outlineStyle: focusVars['--focus-outline-style'],
      outlineColor: focusVars['--focus-outline-color'],
      outlineOffset: `calc(-1 * ${focusVars['--focus-outline-width']})`
    }
  },
  groupHeading: {
    minWidth: 0,
    // Leave room for the grouped-row chevron and its cell padding and gaps.
    maxWidth: 'calc(100cqi - var(--spacing-4) - var(--spacing-5))'
  },
  // A subscription's node opens nothing, so it takes no hover highlight.
  static: {backgroundColor: null}
});
