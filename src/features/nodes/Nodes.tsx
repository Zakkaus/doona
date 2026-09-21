import {useMemo, useState} from 'react';
import {useT, useLang, LOCALE, formatList, formatNumber} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {useCapabilities, useNodeManage, useNodeProbe, useNodes, useOutboundNames, useProviderRefresh, useProviders} from '../../api/store';
import type {Node, Provider} from '../../api/model';
import {addU64, formatBytes, millis} from '../../api/u64';
import {formatDuration, localTime, preferredHealth, relativeStart} from '../../api/selectors';
import {useMainSourceEdit} from '../config/mainSource';
import {readSubscriptions, writeInterval} from './subscriptions';
import {addNamesToGroup, namedIn, readGroupEntries} from '../config/groups';
import {
  Badge,
  Button,
  DataTable,
  ErrorMessage,
  LabeledSelect,
  Light,
  MenuButton,
  ModalDialog,
  TextField,
  TextTooltip,
  errorText,
  latencyTone,
  toast,
  type TableSort
} from '../../ui/ui';
import Refresh from '../../ui/icons/Refresh';
import Close from '../../ui/icons/Close';
import AddCircle from '../../ui/icons/AddCircle';
import SpeedFast from '../../ui/icons/SpeedFast';
import type {PageProps} from '../types';

// The row doona adds for configuration nodes when the backend lists no inline provider.
const INLINE = 'inline';
// The host of a redacted subscription URL; the backend blanks the query, not the origin.
function redactedHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
// The refresh intervals offered, in seconds; the engine's default is the last.
const INTERVALS = [3600, 21600, 43200, 86400];
// The menu entry that opens the new-group dialog; group names cannot start with a slash.
const NEW_GROUP = '/new';
const kinds: Record<Provider['kind'], Key> = {subscription: 'nodes.kind.subscription', file: 'nodes.kind.file', inline: 'nodes.kind.inline'};
const tones = {ok: 'ok', stale: 'warn', error: 'err'} as const;
const statuses: Record<Provider['status'], Key> = {ok: 'nodes.status.ok', stale: 'nodes.status.stale', error: 'nodes.status.error'};
// Names sort the way a person reads them: Chinese by pinyin, digits by value, case ignored.
const collator = new Intl.Collator(['zh-Hans-CN', 'en'], {numeric: true, sensitivity: 'base'});
const latencyOf = (node: Node) => {
  const health = preferredHealth(node);
  return health?.state === 'healthy' && health.latency_ms != null ? health.latency_ms : Infinity;
};

export function Nodes({go, query}: PageProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const n = (value: number) => formatNumber(value, locale);
  const resources = useCapabilities().data?.resources;
  const providers = useProviders(resources?.providers.available !== false);
  const nodes = useNodes(resources?.nodes.available !== false);
  const reload = () => {
    providers.refetch();
    nodes.refetch();
  };
  const refresh = useProviderRefresh(reload);
  const manage = useNodeManage(reload);
  // The refresh interval of a subscription is a line in the main source, keyed by the tag its nodes carry.
  const source = useMainSourceEdit();
  const entries = useMemo(() => readSubscriptions(source.main?.content ?? ''), [source.main?.content]);
  const intervals = useMemo(() => new Map(entries.map(e => [e.tag, e.interval])), [entries]);
  const intervalLabel = (seconds: number) =>
    seconds === 0
      ? t('nodes.manualOnly')
      : INTERVALS.includes(seconds)
        ? t('nodes.everyHours', {n: n(seconds / 3600)})
        : formatDuration(String(seconds), locale);
  const setInterval = (name: string, seconds: number) => {
    void source
      .apply(
        text => writeInterval(text, name, seconds),
        errors => toast('negative', t('nodes.writeInvalid', {n: n(errors)}))
      )
      .then(written => {
        if (written) toast('positive', t('nodes.intervalSet', {name, interval: intervalLabel(seconds)}));
      }, fail);
  };
  // Joining a group adds the node's name to that group's `name(...)` filter; a new group is created around it.
  const groupEntries = useMemo(() => readGroupEntries(source.main?.content ?? ''), [source.main?.content]);
  const joinGroup = (node: Node, group: string) => {
    void source
      .apply(
        text => addNamesToGroup(text, group, [node.name]),
        errors => toast('negative', t('nodes.writeInvalid', {n: n(errors)}))
      )
      .then(written => {
        if (written) toast('positive', t('nodes.joined', {name: node.name, group}));
      }, fail);
  };
  const probe = useNodeProbe(nodes.refetch);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const names = useOutboundNames();
  // Nodes written straight into the configuration have no provider. A backend that lists them under an
  // `inline` provider is taken as is; one that does not gets a row for them here, so they stay reachable.
  const {list, synthetic} = useMemo(() => {
    // Prefer each node's subscription tag over an opaque provider label. For providers without nodes, match by visible URL host, then by the sole unclaimed entry.
    const tags = new Map<string, string>();
    for (const node of nodes.data ?? []) if (node.provider_id && node.subscription_tag) tags.set(node.provider_id, node.subscription_tag);
    const byHost = (item: Provider) => {
      const hostname = redactedHost(item.url_redacted);
      const same = hostname ? entries.filter(entry => entry.host === hostname) : [];
      return same.length === 1 ? same[0].tag : undefined;
    };
    const named = new Map<string, string>();
    const subscriptions = (providers.data?.providers ?? []).filter(item => item.kind === 'subscription');
    for (const item of subscriptions) {
      const tag = tags.get(item.id) ?? byHost(item);
      if (tag) named.set(item.id, tag);
    }
    const unnamed = subscriptions.filter(item => !named.has(item.id));
    const unclaimed = entries.filter(entry => ![...named.values()].includes(entry.tag));
    if (unnamed.length === 1 && unclaimed.length === 1) named.set(unnamed[0].id, unclaimed[0].tag);
    const rows = (providers.data?.providers ?? []).map(item => (named.has(item.id) ? {...item, name: named.get(item.id)!} : item));
    const loose = (nodes.data ?? []).filter(node => node.provider_id === null).length;
    if (!loose || rows.some(item => item.kind === 'inline')) return {list: rows, synthetic: false};
    const inline: Provider = {
      id: INLINE,
      name: t('nodes.kind.inline'),
      kind: 'inline',
      url_redacted: null,
      node_count: loose,
      updated_at: null,
      expires_at: null,
      traffic: null,
      status: 'ok',
      last_error: null
    };
    return {list: [inline, ...rows], synthetic: true};
  }, [providers.data, nodes.data, entries, t]);
  const selectedId = params.get('provider') ?? list[0]?.id ?? null;
  const provider = list.find(item => item.id === selectedId) ?? null;
  // The row doona added stands for the nodes with no provider; a backend's own inline provider keeps its id.
  const ownerId = provider && synthetic && provider.id === INLINE ? null : provider?.id;
  const select = (id: string | null) => {
    const next = new URLSearchParams(query);
    if (id) next.set('provider', id);
    else next.delete('provider');
    go('nodes', next.toString());
  };
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  // A q arriving in the URL (a search-dialog jump) replaces the typed filter; a provider switch keeps the
  // same q and must not reset what was typed since.
  const linked = params.get('q');
  const [lastLinked, setLastLinked] = useState(linked);
  if (lastLinked !== linked) {
    setLastLinked(linked);
    if (linked !== null) setSearch(linked);
  }
  const [group, setGroup] = useState('');
  const [protocol, setProtocol] = useState('');
  const [sort, setSort] = useState<TableSort>({column: 'name', direction: 'ascending'});
  const [dialog, setDialog] = useState<
    {kind: 'provider'} | {kind: 'node'} | {kind: 'group'; item: Node} | {kind: 'removeProvider'; item: Provider} | {kind: 'removeNode'; item: Node} | null
  >(null);
  const [form, setForm] = useState({name: '', value: ''});
  const inlineId = list.find(item => item.kind === 'inline')?.id ?? null;
  const owned = useMemo(() => (nodes.data ?? []).filter(node => (provider ? node.provider_id === ownerId : true)), [nodes.data, provider, ownerId]);
  const groups = useMemo(
    () => [...new Set(owned.flatMap(node => node.group_ids))].sort((a, b) => collator.compare(names.get(a) ?? a, names.get(b) ?? b)),
    [owned, names]
  );
  const protocols = useMemo(() => [...new Set(owned.map(node => node.protocol ?? ''))].filter(Boolean).sort(collator.compare), [owned]);
  const members = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const kept = owned.filter(
      node => (!needle || node.name.toLowerCase().includes(needle)) && (!group || node.group_ids.includes(group)) && (!protocol || node.protocol === protocol)
    );
    const sign = sort.direction === 'ascending' ? 1 : -1;
    const by: Record<string, (a: Node, b: Node) => number> = {
      name: (a, b) => collator.compare(a.name, b.name),
      protocol: (a, b) => collator.compare(a.protocol ?? '', b.protocol ?? ''),
      latency: (a, b) => latencyOf(a) - latencyOf(b) || collator.compare(a.name, b.name)
    };
    return kept.sort((a, b) => sign * (by[sort.column] ?? by.name)(a, b));
  }, [owned, search, group, protocol, sort]);
  const usage = (item: Provider) =>
    item.traffic ? {used: addU64(item.traffic.upload_bytes, item.traffic.download_bytes), total: item.traffic.total_bytes} : null;
  const canManageProviders = !!resources?.providers.can_manage;
  const canManageNodes = !!resources?.nodes.can_manage;
  const canProbe = probe.canProbe;
  // The engine's own direct and block outbounds have nothing to connect to; a probe of them is refused.
  const probeable = (node: Node) => canProbe && node.protocol !== 'direct' && node.protocol !== 'block';
  const open = (next: NonNullable<typeof dialog>) => {
    setForm({name: '', value: ''});
    setDialog(next);
  };
  const fail = (error: unknown) => toast('negative', errorText(error));
  const submit = async (close: () => void) => {
    if (!dialog) return;
    try {
      if (dialog.kind === 'provider') {
        // The backend's label for a subscription may be opaque; the toast names it as the user did.
        const created = await manage.addProvider({name: form.name.trim(), kind: 'subscription', url: form.value.trim()});
        if (created) toast('positive', t('nodes.added', {name: form.name.trim()}));
      } else if (dialog.kind === 'node') {
        const created = await manage.addNode({name: form.name.trim(), link: form.value.trim()});
        if (created) toast('positive', t('nodes.added', {name: created.name}));
      } else if (dialog.kind === 'group') {
        joinGroup(dialog.item, form.name.trim());
      } else if (dialog.kind === 'removeProvider') {
        if (await manage.removeProvider(dialog.item.id)) toast('positive', t('nodes.removed', {name: dialog.item.name}));
      } else if (await manage.removeNode(dialog.item.id)) toast('positive', t('nodes.removed', {name: dialog.item.name}));
      close();
    } catch (error) {
      fail(error);
    }
  };
  // What the dialog is about: its title, whether it adds or removes, and when its form is complete.
  const removing = dialog?.kind === 'removeProvider' || dialog?.kind === 'removeNode';
  const dialogTitle =
    dialog === null
      ? ''
      : dialog.kind === 'provider'
        ? t('nodes.addProvider')
        : dialog.kind === 'node'
          ? t('nodes.addNode')
          : dialog.kind === 'group'
            ? t('nodes.newGroup')
            : t(dialog.kind === 'removeProvider' ? 'nodes.removeProviderTitle' : 'nodes.removeNodeTitle', {name: dialog.item.name});
  const formValid =
    dialog?.kind === 'provider'
      ? /^[\w.-]+$/.test(form.name.trim()) && /^https?:\/\/\S+$/.test(form.value.trim())
      : dialog?.kind === 'node'
        ? form.name.trim() !== '' && /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(form.value.trim())
        : dialog?.kind === 'group'
          ? form.name.trim() !== '' && !form.name.includes('{') && !form.name.includes('}')
          : true;
  return (
    <div className="rp-page">
      <p className="rp-note">{t('nodes.note')}</p>
      <ErrorMessage error={providers.error ?? nodes.error} onRetry={reload} />
      {canManageProviders && (
        <div className="rp-toolbar">
          <span className="rp-grow" />
          <Button small onPress={() => open({kind: 'provider'})}>
            {t('nodes.addProvider')}
          </Button>
        </div>
      )}
      <DataTable
        label={t('nodes.providers')}
        loading={providers.loading && !providers.data}
        rows={list}
        height={280}
        selected={selectedId}
        onSelect={id => id && select(id)}
        selectOnFocus
        empty={t('nodes.noProviders')}
        cols={[
          {id: 'name', label: t('nodes.provider'), minWidth: 140, grow: 2, isRowHeader: true},
          {id: 'kind', label: t('nodes.kindLabel'), minWidth: 110, grow: 0, drop: 5},
          {id: 'count', label: t('nodes.count'), minWidth: 80, grow: 0, align: 'end', drop: 6},
          {id: 'usage', label: t('nodes.usage'), minWidth: 200, drop: 2},
          {id: 'updated', label: t('nodes.updated'), minWidth: 140, drop: 3},
          {id: 'interval', label: t('nodes.interval'), minWidth: 130, grow: 0, drop: 4},
          {id: 'expires', label: t('nodes.expires'), minWidth: 140, drop: 1},
          {id: 'status', label: t('ui.state'), minWidth: 96, grow: 0},
          {id: 'actions', label: t('ui.actions'), minWidth: canManageProviders ? 112 : 88, grow: 0}
        ]}
        render={item => {
          const used = usage(item);
          const interval = item.kind === 'subscription' ? intervals.get(item.name) : undefined;
          return [
            <span className="rp-chain">
              <TextTooltip text={item.url_redacted ?? undefined}>{item.name}</TextTooltip>
            </span>,
            <Badge>{t(kinds[item.kind])}</Badge>,
            n(item.node_count),
            used ? (used.total ? t('nodes.used', {used: formatBytes(used.used), total: formatBytes(used.total)}) : formatBytes(used.used)) : '—',
            <TextTooltip text={item.updated_at ? localTime(item.updated_at, locale) : undefined}>{relativeStart(item.updated_at, locale)}</TextTooltip>,
            interval === undefined ? (
              '—'
            ) : source.writable ? (
              <MenuButton
                quiet
                label={t('nodes.intervalOf', {name: item.name})}
                value={String(interval)}
                isDisabled={source.busy}
                onChange={key => setInterval(item.name, Number(key))}
                items={[0, ...INTERVALS, ...(INTERVALS.includes(interval) || interval === 0 ? [] : [interval])].map(seconds => ({
                  id: String(seconds),
                  label: intervalLabel(seconds)
                }))}
              >
                {intervalLabel(interval)}
              </MenuButton>
            ) : (
              intervalLabel(interval)
            ),
            item.expires_at ? localTime(item.expires_at, locale) : '—',
            <Light small tone={tones[item.status]}>
              <TextTooltip text={item.last_error?.message}>{t(statuses[item.status])}</TextTooltip>
            </Light>,
            <span className="rp-chain">
              {item.kind === 'subscription' && resources?.providers.can_refresh && (
                <Button
                  small
                  quiet
                  icon
                  isPending={refresh.busy === item.id}
                  isDisabled={!!refresh.busy}
                  label={t('nodes.refresh', {name: item.name})}
                  onPress={() => {
                    void refresh.refresh(item.id).then(result => {
                      if (result) toast('positive', t('nodes.refreshed', {name: item.name, n: n(result.node_count)}));
                    }, fail);
                  }}
                >
                  <Refresh />
                </Button>
              )}
              {canManageProviders && item.kind !== 'inline' && (
                <Button
                  small
                  quiet
                  isDisabled={!!manage.busy}
                  label={t('nodes.remove', {name: item.name})}
                  onPress={() => open({kind: 'removeProvider', item})}
                >
                  <Close />
                </Button>
              )}
            </span>
          ];
        }}
      />
      <div className="rp-toolbar">
        <TextField label={t('nodes.search')} search value={search} width={220} onChange={setSearch} />
        <LabeledSelect
          label={t('nodes.group')}
          side
          value={group}
          onChange={setGroup}
          items={[{id: '', label: t('nodes.anyGroup')}, ...groups.map(id => ({id, label: names.get(id) ?? id}))]}
        />
        <LabeledSelect
          label={t('nodes.protocol')}
          side
          value={protocol}
          onChange={setProtocol}
          items={[{id: '', label: t('nodes.anyProtocol')}, ...protocols.map(id => ({id, label: id}))]}
        />
        <span className="rp-label">{t('nodes.shown', {n: n(members.length), total: n(owned.length)})}</span>
        <span className="rp-grow" />
        {canManageNodes && (
          <Button small onPress={() => open({kind: 'node'})}>
            {t('nodes.addNode')}
          </Button>
        )}
      </div>
      <DataTable
        label={provider ? t('nodes.of', {name: provider.name}) : t('nav.nodes')}
        loading={nodes.loading && !nodes.data}
        rows={members}
        height={520}
        empty={t('nodes.empty')}
        sort={sort}
        onSort={setSort}
        cols={[
          {id: 'name', label: t('nodes.node'), minWidth: 150, grow: 2, isRowHeader: true, sortable: true},
          {id: 'protocol', label: t('nodes.protocol'), minWidth: 120, grow: 0, drop: 2, sortable: true},
          {id: 'latency', label: t('nodes.latency'), minWidth: 96, grow: 0, align: 'end', sortable: true},
          {id: 'groups', label: t('nodes.groups'), minWidth: 200, drop: 1},
          {id: 'actions', label: t('ui.actions'), minWidth: canManageNodes ? 108 : 72, grow: 0}
        ]}
        render={(node: Node) => {
          const health = preferredHealth(node);
          return [
            <span className="rp-chain">
              <TextTooltip>{node.name}</TextTooltip>
            </span>,
            node.protocol ?? '—',
            health?.state === 'healthy' && health.latency_ms != null ? (
              <span className={'ms ' + latencyTone(health.latency_ms)}>{t('ui.latency', {n: millis(health.latency_ms)})}</span>
            ) : (
              <span className="ms err">{health?.state === 'unavailable' ? t('ui.unavailable') : '—'}</span>
            ),
            <TextTooltip>
              {node.group_ids.length
                ? formatList(
                    lang,
                    node.group_ids.map(id => names.get(id) ?? id)
                  )
                : '—'}
            </TextTooltip>,
            <span className="rp-chain">
              {probeable(node) && (
                <Button
                  small
                  quiet
                  icon
                  isPending={probe.busy === node.id}
                  isDisabled={!!probe.busy}
                  label={t('nodes.probe', {name: node.name})}
                  onPress={() => {
                    void probe.probe(node.id).then(result => {
                      if (!result) return;
                      const sample = result.results.find(item => item.member_id === node.id && item.state === 'healthy' && item.latency_ms != null);
                      toast(
                        sample ? 'positive' : 'negative',
                        sample ? t('nodes.probed', {name: node.name, n: n(sample.latency_ms!)}) : t('nodes.probeFailed', {name: node.name})
                      );
                    }, fail);
                  }}
                >
                  <SpeedFast />
                </Button>
              )}
              {source.writable && (
                <MenuButton
                  quiet
                  chevron={false}
                  label={t('nodes.joinGroup', {name: node.name})}
                  value=""
                  isDisabled={source.busy}
                  onChange={key => (key === NEW_GROUP ? open({kind: 'group', item: node}) : joinGroup(node, key))}
                  items={[
                    ...groupEntries
                      .filter(entry => !namedIn(entry).includes(node.name) && !node.group_ids.some(id => (names.get(id) ?? id) === entry.name))
                      .map(entry => ({id: entry.name, label: entry.name, desc: entry.policy ?? 'selector'})),
                    {id: NEW_GROUP, label: t('nodes.newGroup')}
                  ]}
                >
                  <AddCircle />
                </MenuButton>
              )}
              {canManageNodes && inlineId !== null && node.provider_id === (synthetic && inlineId === INLINE ? null : inlineId) && (
                <Button
                  small
                  quiet
                  isDisabled={!!manage.busy}
                  label={t('nodes.remove', {name: node.name})}
                  onPress={() => open({kind: 'removeNode', item: node})}
                >
                  <Close />
                </Button>
              )}
            </span>
          ];
        }}
      />
      <ModalDialog
        title={dialogTitle}
        narrow
        alert={removing}
        isOpen={dialog !== null}
        onOpenChange={isOpen => {
          if (!isOpen) setDialog(null);
        }}
        footer={close => (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button
              accent={!removing}
              negative={removing}
              isDisabled={!formValid}
              isPending={!!manage.busy || (dialog?.kind === 'group' && source.busy)}
              onPress={() => void submit(close)}
            >
              {removing ? t('nodes.remove', {name: dialog.item.name}) : dialog?.kind === 'group' ? t('nodes.join') : t('nodes.add')}
            </Button>
          </>
        )}
      >
        {dialog?.kind === 'provider' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.addProviderHelp')}</span>
            <TextField label={t('nodes.name')} value={form.name} placeholder="sub-a" onChange={name => setForm({...form, name})} />
            <TextField label={t('nodes.url')} value={form.value} placeholder="https://example.org/sub?token=…" onChange={value => setForm({...form, value})} />
          </div>
        )}
        {dialog?.kind === 'group' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.newGroupHelp', {name: dialog.item.name})}</span>
            <TextField label={t('nodes.name')} value={form.name} placeholder="hk" onChange={name => setForm({...form, name})} />
          </div>
        )}
        {dialog?.kind === 'node' && (
          <div className="rp-list">
            <span className="rp-label">{t('nodes.addNodeHelp')}</span>
            <TextField label={t('nodes.name')} value={form.name} placeholder="hk-03" onChange={name => setForm({...form, name})} />
            <TextField label={t('nodes.link')} value={form.value} placeholder="vless://…" onChange={value => setForm({...form, value})} />
          </div>
        )}
        {dialog?.kind === 'removeProvider' && <span className="rp-label">{t('nodes.removeProviderHelp')}</span>}
        {dialog?.kind === 'removeNode' && <span className="rp-label">{t('nodes.removeNodeHelp')}</span>}
      </ModalDialog>
    </div>
  );
}
