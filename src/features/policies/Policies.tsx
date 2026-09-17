import {useT} from '../../i18n';
import {useEffect, useMemo} from 'react';
import Refresh from '../../ui/icons/Refresh';
import {useGroupControl, useGroups, useNodes} from '../../api/store';
import {groupConfigFields, groupLeaf, preferredHealth, probeSummary} from '../../api/selectors';
import type {GroupSummary, HealthObservation} from '../../api/model';
import type {PageProps} from '../types';
import {Badge, Button, DataTable, ErrorMessage, Kv, Light, Loading, Segmented, Switch, TextTooltip, errorText, toast} from '../../ui/ui';
import {OutboundMark} from './Flag';
import {NodeGrid} from './Nodes';

type Row = GroupSummary & {leaf?: string; healthy: number; unavailable: number};

// One group's detail: what it currently selects, how it is configured, and its members as tiles the user can
// pick from when the group is a selector. Lives in the panel beside the group list.
function PolicyDetail({
  id,
  leaf,
  health,
  leaves,
  refreshGroups,
  refreshNodes
}: {
  id: string;
  leaf: string | undefined;
  health: Map<string, HealthObservation | undefined>;
  leaves: Map<string, string | undefined>;
  refreshGroups: () => void;
  refreshNodes: () => void;
}) {
  const t = useT();
  const labels = {
    timeout: t('policy.unavailable'),
    nested: t('policy.group'),
    cur: t('policy.current'),
    filter: t('policy.filter'),
    region: t('policy.region'),
    allRegions: t('policy.allRegions'),
    sort: t('policy.sort'),
    byLatency: t('policy.byLatency'),
    byName: t('policy.byName'),
    aliveOnly: t('policy.aliveOnly'),
    none: t('policy.none'),
    count: (n: number, down: number) => (down ? t('policy.membersDown', {n, down}) : t('policy.members', {n}))
  };
  const control = useGroupControl(id, refreshGroups, refreshNodes);
  useEffect(() => {
    if (control.error) toast('negative', errorText(control.error));
  }, [control.error]);
  const g = control.data;
  const members = useMemo(() => g?.members.map(m => ({...m, health: health.get(m.id), leaf: leaves.get(m.id)})) ?? [], [g, health, leaves]);
  if (!g) return control.error ? <ErrorMessage error={control.error} /> : <Loading>{t('policy.loading', {id})}</Loading>;
  const tcp = g.runtime.selection.tcp?.member_id;
  const udp = g.runtime.selection.udp?.member_id;
  const selected = control.network === 'tcp' ? tcp : control.network === 'udp' ? udp : tcp === udp ? tcp : undefined;
  const selectable = g.policy.kind === 'selector' && g.capabilities.can_select;
  const canProbe = g.capabilities.probe_transports.includes('tcp');
  const interruptable = g.capabilities.mutable_config.includes('interrupt_connections');
  const text = (value: string | {key: string; params?: Record<string, string | number>}) =>
    typeof value === 'string' ? value : t(value.key as never, value.params);
  return (
    <>
      <ErrorMessage error={control.error} />
      <div className="rp-row">
        <span className="rp-cluster">
          <OutboundMark name={leaf ?? null} />
          <h3 className="rp-h3">{g.name}</h3>
          <Badge>{g.policy.kind}</Badge>
          <span className="rp-label">{t('policy.members', {n: members.length})}</span>
        </span>
        <Button
          small
          isPending={control.busy === 'probe'}
          isDisabled={!!control.busy || !canProbe}
          tip={canProbe ? undefined : t('policy.noProbe')}
          onPress={() => {
            void control.probe().then(result => {
              if (result) {
                const summary = probeSummary(result);
                toast('positive', t('ui.valuePair', {label: g.name, value: t(summary.key, summary.params)}));
              }
            });
          }}
        >
          <Refresh />
          {control.busy === 'probe' ? t('policy.probing') : t('policy.probeAll')}
        </Button>
      </div>
      <Kv
        row
        items={[
          [t('policy.tcpSelection'), tcp ?? '—'],
          [t('policy.udpSelection'), udp ?? '—'],
          [t('ui.revision'), g.config_revision],
          // The interrupt setting is a switch below when it can be changed here, so the list does not repeat it.
          ...groupConfigFields(g)
            .filter(([key]) => !(interruptable && key === 'policy.cfg.interruptConnections'))
            .map(([key, value]): [string, string] => [typeof key === 'string' ? t(key) : t(key.key, key.params), text(value)])
        ]}
      />
      {(selectable || interruptable) && (
        <div className="rp-toolbar">
          {selectable && (
            <Segmented
              label={t('policy.network', {name: g.name})}
              value={control.network}
              onChange={value => {
                if (value === 'both' || value === 'tcp' || value === 'udp') control.setNetwork(value);
              }}
              items={[
                ['both', t('policy.both')],
                ['tcp', t('ui.tcp')],
                ['udp', t('ui.udp')]
              ]}
            />
          )}
          {interruptable && (
            <Switch
              isSelected={g.config.interrupt_connections}
              isDisabled={!!control.busy}
              onChange={value => {
                void control.setInterrupt(value).then(saved => {
                  if (saved) toast('positive', t('policy.updated', {name: g.name}));
                });
              }}
            >
              {t('policy.interrupt')}
            </Switch>
          )}
        </div>
      )}
      <NodeGrid
        labels={labels}
        nodes={members}
        selected={selected}
        cur={selected}
        isDisabled={!!control.busy}
        onSelect={
          selectable
            ? memberId => {
                void control.select(memberId).then(result => {
                  if (result)
                    toast(
                      'positive',
                      t(result.connections_interrupted ? 'policy.selectedInterrupted' : 'policy.selectedKept', {name: g.name, member: result.member_id})
                    );
                });
              }
            : undefined
        }
      />
    </>
  );
}

// Groups down the left, the picked group's members on the right, the way a policy screen reads in Surge: a
// config with a group per service stays one screen and the tiles keep the width they need. The first group is
// shown until one is picked; the pick is remembered in the URL. Health counts come from the node list, so
// nested groups are not counted.
export function Policies({go, query}: PageProps) {
  const t = useT();
  const groups = useGroups();
  const nodes = useNodes();
  const picked = useMemo(() => new URLSearchParams(query).get('group'), [query]);
  const select = (id: string | null) => {
    const params = new URLSearchParams(query);
    if (id) params.set('group', id);
    else params.delete('group');
    go('policies', params.toString());
  };
  const health = useMemo(() => new Map((nodes.data ?? []).map(n => [n.id, preferredHealth(n)])), [nodes.data]);
  const leaves = useMemo(() => new Map((groups.data ?? []).map(g => [g.id, groupLeaf(g.id, groups.data ?? [], nodes.data ?? [])])), [groups.data, nodes.data]);
  const rows = useMemo<Row[]>(
    () =>
      (groups.data ?? []).map(g => {
        const members = (nodes.data ?? []).filter(n => n.group_ids.includes(g.id));
        return {
          ...g,
          leaf: leaves.get(g.id),
          healthy: members.filter(n => health.get(n.id)?.state === 'healthy').length,
          unavailable: members.filter(n => health.get(n.id)?.state === 'unavailable').length
        };
      }),
    [groups.data, nodes.data, health, leaves]
  );
  const cur = rows.find(row => row.id === picked) ?? rows[0];
  return (
    <div className="rp-page">
      <p className="rp-note">{t('policy.note')}</p>
      <ErrorMessage error={groups.error ?? nodes.error} />
      <div className="rp-master">
        <DataTable
          label={t('nav.policies')}
          rows={rows}
          loading={groups.loading && !groups.data}
          empty={t('policy.empty')}
          selected={cur?.id ?? null}
          onSelect={id => id && select(id)}
          selectOnFocus
          height={640}
          cols={[
            {id: 'name', label: t('policy.group'), minWidth: 150, isRowHeader: true},
            {id: 'health', label: t('policy.health'), minWidth: 80, grow: 0, align: 'end'}
          ]}
          render={row => [
            <span className="rp-chain">
              <OutboundMark name={row.leaf ?? null} />
              <TextTooltip>{row.name}</TextTooltip>
            </span>,
            <Light small tone={row.unavailable ? 'warn' : row.healthy ? 'ok' : 'muted'}>
              <TextTooltip text={t('policy.healthCounts', {healthy: row.healthy, unavailable: row.unavailable})}>
                {row.unavailable ? `${row.healthy}/${row.healthy + row.unavailable}` : String(row.healthy)}
              </TextTooltip>
            </Light>
          ]}
        />
        <section className="rp-card" aria-label={cur?.name ?? t('nav.policies')}>
          {cur ? (
            <PolicyDetail
              key={cur.id}
              id={cur.id}
              leaf={cur.leaf}
              health={health}
              leaves={leaves}
              refreshGroups={groups.refetch}
              refreshNodes={nodes.refetch}
            />
          ) : (
            !groups.loading && <p className="rp-empty">{t('policy.empty')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
