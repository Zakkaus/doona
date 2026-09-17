import {useT} from '../../i18n';
import {useEffect, useMemo} from 'react';
import Refresh from '../../ui/icons/Refresh';
import {useGroupControl, useGroups, useNodes} from '../../api/store';
import {groupConfigFields, preferredHealth, probeSummary} from '../../api/selectors';
import type {HealthObservation} from '../../api/model';
import {Badge, Button, Disclosure, DisclosureGroup, ErrorMessage, Loading, Kv, Segmented, Switch, errorText, toast} from '../../ui/ui';
import {PolicyMark} from './Flag';
import {NodeGrid} from './Nodes';

function PolicyCard({
  id,
  health,
  policies,
  refreshGroups,
  refreshNodes
}: {
  id: string;
  health: Map<string, HealthObservation | undefined>;
  policies: Map<string, string>;
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
  const members = useMemo(() => g?.members.map(m => ({...m, health: health.get(m.id), policy: policies.get(m.id)})) ?? [], [g, health, policies]);
  const tcp = g?.runtime.selection.tcp?.member_id;
  const udp = g?.runtime.selection.udp?.member_id;
  const selected = control.network === 'tcp' ? tcp : control.network === 'udp' ? udp : tcp === udp ? tcp : undefined;
  const selectable = g?.policy.kind === 'selector' && g.capabilities.can_select;
  const healthy = members.filter(m => m.health?.state === 'healthy').length;
  const unavailable = members.filter(m => m.health?.state === 'unavailable').length;
  return (
    <section className="rp-card" aria-label={g?.name ?? id}>
      <ErrorMessage error={control.error} />
      {!g ? (
        control.error ? null : (
          <Loading>{t('policy.loading', {id})}</Loading>
        )
      ) : (
        <>
          <div className="rp-row">
            <span className="rp-cluster">
              <PolicyMark kind={g.policy.kind} />
              <h3 className="rp-h3">{g.name}</h3>
              <Badge>{g.policy.kind}</Badge>
              <span className="rp-label">{t('policy.members', {n: members.length})}</span>
            </span>
            <Button
              small
              isPending={control.busy === 'probe'}
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
          <Disclosure id={id} title={t('ui.config')}>
            <Kv
              items={groupConfigFields(g).map(([key, value]) => [
                typeof key === 'string' ? t(key) : t(key.key, key.params),
                typeof value === 'string' ? value : t(value.key, value.params)
              ])}
            />
          </Disclosure>
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
  const policies = useMemo(() => new Map((groups.data ?? []).map(g => [g.id, g.policy.kind])), [groups.data]);
  return (
    <div className="rp-page">
      <p className="rp-note">{t('policy.note')}</p>
      <ErrorMessage error={groups.error ?? nodes.error} />
      {groups.loading && !groups.data && <Loading />}
      {groups.data?.length === 0 && <p className="rp-empty">{t('policy.empty')}</p>}
      <DisclosureGroup>
        {groups.data?.map(g => (
          <PolicyCard key={g.id} id={g.id} health={health} policies={policies} refreshGroups={groups.refetch} refreshNodes={nodes.refetch} />
        ))}
      </DisclosureGroup>
    </div>
  );
}
