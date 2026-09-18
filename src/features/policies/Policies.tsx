import {useT} from '../../i18n';
import {useCallback, useEffect, useMemo, useState} from 'react';
import Refresh from '../../ui/icons/Refresh';
import {useGroupControl, useGroups, useNodes} from '../../api/store';
import {groupConfigFields, groupLeaf, policyKindLabels, preferredHealth, probeSummary} from '../../api/selectors';
import type {HealthObservation} from '../../api/model';
import {Badge, Button, Disclosure, DisclosureGroup, ErrorMessage, Light, Loading, Kv, Segmented, Switch, errorText, toast} from '../../ui/ui';
import {NodeGrid} from './Nodes';
import type {PageProps} from '../types';

function PolicyCard({
  id,
  health,
  leaves,
  refreshGroups,
  refreshNodes,
  onLoaded
}: {
  id: string;
  health: Map<string, HealthObservation | undefined>;
  leaves: Map<string, string | undefined>;
  refreshGroups: () => void;
  refreshNodes: () => void;
  onLoaded: (id: string) => void;
}) {
  const t = useT();
  const control = useGroupControl(id, refreshGroups, refreshNodes);
  // A failed control toasts once; a failed load shows inline and does not repeat on every poll.
  useEffect(() => {
    if (control.actionError) toast('negative', errorText(control.actionError));
  }, [control.actionError]);
  const g = control.data;
  // Settled either way: the scroll to a linked card waits for every card to have its final height.
  const settled = !!g || !!control.error;
  useEffect(() => {
    if (settled) onLoaded(id);
  }, [settled, id, onLoaded]);
  const members = useMemo(() => g?.members.map(m => ({...m, health: health.get(m.id), leaf: leaves.get(m.id)})) ?? [], [g, health, leaves]);
  const tcp = g?.runtime.selection.tcp?.member_id;
  const udp = g?.runtime.selection.udp?.member_id;
  const selected = control.network === 'tcp' ? tcp : control.network === 'udp' ? udp : tcp === udp ? tcp : undefined;
  const selectable = g?.policy.kind === 'selector' && g.capabilities.can_select;
  // An automatic policy that accepts a pin: tiles pick like a selector, and a pinned pick can be released.
  const overridable = !selectable && (g?.capabilities.can_override ?? false);
  const pinned = overridable && [g?.runtime.selection.tcp, g?.runtime.selection.udp].some(item => item?.source === 'override');
  const interruptable = g?.capabilities.mutable_config.includes('interrupt_connections') ?? false;
  const healthy = members.filter(m => m.health?.state === 'healthy').length;
  const unavailable = members.filter(m => m.health?.state === 'unavailable').length;
  return (
    <section className="rp-card" id={'group-' + id} aria-label={g?.name ?? id}>
      <ErrorMessage error={control.error} />
      {!g ? (
        control.error ? null : (
          <Loading>{t('policy.loading', {id})}</Loading>
        )
      ) : (
        <>
          <div className="rp-row">
            <span className="rp-cluster">
              <h3 className="rp-h3">{g.name}</h3>
              <Badge>{t(policyKindLabels[g.policy.kind])}</Badge>
              <Light small tone="ok">
                {t('policy.healthy', {n: healthy})}
              </Light>
              {unavailable > 0 && (
                <Light small tone="err">
                  {t('policy.down', {n: unavailable})}
                </Light>
              )}
            </span>
            <Button
              isPending={control.busy === 'probe'}
              isDisabled={!!control.busy || !control.canProbe}
              tip={!control.canProbe ? t('policy.noProbe') : undefined}
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
          <Disclosure id={id} title={t('ui.config')}>
            <Kv
              items={groupConfigFields(g)
                .filter(([key]) => !(interruptable && key === 'policy.cfg.interruptConnections'))
                .map(([key, value]): [string, string] => [
                  typeof key === 'string' ? t(key) : t(key.key, key.params),
                  typeof value === 'string' ? value : t(value.key, value.params)
                ])}
            />
          </Disclosure>
          <div className="rp-toolbar">
            {(selectable || overridable || g.runtime.selection.tcp?.member_id !== g.runtime.selection.udp?.member_id) && (
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
            {overridable && (
              <Light small tone={pinned ? 'neutral' : 'ok'}>
                {t(pinned ? 'policy.overridden' : 'policy.automatic')}
              </Light>
            )}
            {pinned && (
              <Button
                isPending={control.busy === 'selection'}
                isDisabled={!!control.busy}
                onPress={() => {
                  void control.clearOverride().then(result => {
                    if (result) toast('positive', t('policy.backToAutomatic', {name: g.name, member: result.member_id}));
                  });
                }}
              >
                {t('policy.releaseOverride')}
              </Button>
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
          <NodeGrid
            nodes={members}
            selected={selected}
            cur={selected}
            isDisabled={!!control.busy}
            onSelect={
              selectable || overridable
                ? memberId => {
                    void control.select(memberId).then(result => {
                      if (result)
                        toast(
                          'positive',
                          t(
                            result.source === 'override'
                              ? 'policy.pinned'
                              : result.connections_interrupted
                                ? 'policy.selectedInterrupted'
                                : 'policy.selectedKept',
                            {name: g.name, member: result.member_id}
                          )
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
export function Policies({query}: PageProps) {
  const t = useT();
  const groups = useGroups();
  const nodes = useNodes();
  // `?group=` (from search) brings that card into view once every card has its full height, so the cards above
  // it no longer grow after the scroll.
  const focus = new URLSearchParams(query).get('group');
  const [loadedIds, setLoadedIds] = useState<ReadonlySet<string>>(new Set());
  const onLoaded = useCallback((id: string) => setLoadedIds(prev => (prev.has(id) ? prev : new Set(prev).add(id))), []);
  const ready = !!groups.data && groups.data.every(g => loadedIds.has(g.id));
  useEffect(() => {
    if (focus && ready) document.getElementById('group-' + focus)?.scrollIntoView({block: 'start'});
  }, [focus, ready]);
  const health = useMemo(() => new Map((nodes.data ?? []).map(n => [n.id, preferredHealth(n)])), [nodes.data]);
  // Every group's current exit node, so headers and nested member tiles carry the flag the traffic actually leaves under.
  const leaves = useMemo(() => new Map((groups.data ?? []).map(g => [g.id, groupLeaf(g.id, groups.data ?? [], nodes.data ?? [])])), [groups.data, nodes.data]);
  return (
    <div className="rp-page">
      <p className="rp-note">{t('policy.note')}</p>
      <ErrorMessage error={groups.error ?? nodes.error} />
      {groups.loading && !groups.data && <Loading />}
      {groups.data?.length === 0 && <p className="rp-empty">{t('policy.empty')}</p>}
      <DisclosureGroup>
        {groups.data?.map(g => (
          <PolicyCard key={g.id} id={g.id} health={health} leaves={leaves} refreshGroups={groups.refetch} refreshNodes={nodes.refetch} onLoaded={onLoaded} />
        ))}
      </DisclosureGroup>
    </div>
  );
}
