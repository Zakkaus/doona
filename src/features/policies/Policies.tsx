import {useT} from '../../i18n';
import {useMemo} from 'react';
import Refresh from '../../ui/icons/Refresh';
import {useGroupControl, useGroups, useNodes} from '../../api/store';
import {groupConfigFields, preferredHealth, probeSummary} from '../../api/selectors';
import type {HealthObservation} from '../../api/model';
import {Badge, Button, Kv, Segmented, Switch, toast} from '../../ui/ui';
import {NodeGrid} from './Nodes';

function PolicyCard({
  id,
  health,
  refreshGroups,
  refreshNodes
}: {
  id: string;
  health: Map<string, HealthObservation | undefined>;
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
  const g = control.data;
  const members = useMemo(() => g?.members.map(m => ({...m, health: health.get(m.id)})) ?? [], [g, health]);
  const tcp = g?.runtime.selection.tcp?.member_id;
  const udp = g?.runtime.selection.udp?.member_id;
  const selected = control.network === 'tcp' ? tcp : control.network === 'udp' ? udp : tcp === udp ? tcp : undefined;
  const selectable = g?.policy.kind === 'selector' && g.capabilities.can_select;
  const healthy = members.filter(m => m.health?.state === 'healthy').length;
  const unavailable = members.filter(m => m.health?.state === 'unavailable').length;
  return (
    <section className="rp-card" aria-label={g?.name ?? id}>
      {control.error && (
        <p role="alert" className="rp-note">
          {t('policy.error', {error: control.error.message})}
        </p>
      )}
      {!g ? (
        <p role="status">{t('policy.loading', {id})}</p>
      ) : (
        <>
          <div className="rp-row">
            <span className="rp-cluster">
              <h3 className="rp-h3">{g.name}</h3>
              <Badge>{g.policy.kind}</Badge>
              <span className="rp-label">{t('policy.members', {n: members.length})}</span>
            </span>
            <Button
              small
              isDisabled={!!control.busy || !g.capabilities.probe_transports.includes('tcp')}
              tip={!g.capabilities.probe_transports.includes('tcp') ? t('policy.noProbe') : undefined}
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
            inline
            items={[
              [t('policy.tcpSelection'), tcp ?? '—'],
              [t('policy.udpSelection'), udp ?? '—'],
              [t('policy.health'), t('policy.healthCounts', {healthy, unavailable})],
              [t('ui.revision'), g.config_revision]
            ]}
          />
          <details>
            <summary>{t('ui.config')}</summary>
            <Kv items={groupConfigFields(g)} />
          </details>
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
            {g.capabilities.mutable_config.includes('interrupt_connections') && (
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
      )}
    </section>
  );
}
export function Policies() {
  const t = useT();
  const groups = useGroups();
  const nodes = useNodes();
  const health = useMemo(() => new Map((nodes.data ?? []).map(n => [n.id, preferredHealth(n)])), [nodes.data]);
  return (
    <div className="rp-page">
      <p className="rp-note">{t('policy.note')}</p>
      {(groups.error || nodes.error) && (
        <p role="alert" className="rp-note">
          {t('policy.loadFailed', {error: (groups.error ?? nodes.error)?.message ?? ''})}
        </p>
      )}
      {groups.loading && !groups.data && <p role="status">{t('ui.loading')}</p>}
      {groups.data?.length === 0 && <p className="rp-note">{t('policy.empty')}</p>}
      <div className="rp-col">
        {groups.data?.map(g => (
          <PolicyCard key={g.id} id={g.id} health={health} refreshGroups={groups.refetch} refreshNodes={nodes.refetch} />
        ))}
      </div>
    </div>
  );
}
