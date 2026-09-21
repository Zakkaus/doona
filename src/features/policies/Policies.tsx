import {useT} from '../../i18n';
import {useCallback, useEffect, useMemo, useState} from 'react';
import Refresh from '../../ui/icons/Refresh';
import Close from '../../ui/icons/Close';
import {useGroupControl, useGroups, useNodes, useCapabilities} from '../../api/store';
import {groupConfigFields, policyKindLabels, preferredHealth, preferredObservation, probeSummary} from '../../api/selectors';
import type {HealthObservation} from '../../api/model';
import {useMainSourceEdit} from '../config/mainSource';
import {canonicalPolicy, policyNames, readGroupEntries, writeGroupEntry, type GroupEntry} from '../config/groups';
import type {MainSourceEdit} from '../config/mainSource';
import {
  Badge,
  Button,
  Disclosure,
  DisclosureGroup,
  ErrorMessage,
  LabeledSelect,
  Light,
  Loading,
  Kv,
  ModalDialog,
  Segmented,
  Switch,
  TextField,
  errorText,
  toast,
  Empty
} from '../../ui/ui';
import {NodeGrid} from './Nodes';
import type {PageProps} from '../types';

function PolicyCard({
  id,
  health,
  refreshGroups,
  refreshNodes,
  onLoaded,
  source,
  entry
}: {
  id: string;
  health: Map<string, HealthObservation | undefined>;
  refreshGroups: () => void;
  refreshNodes: () => void;
  onLoaded: (id: string) => void;
  source: MainSourceEdit;
  entry: GroupEntry | undefined;
}) {
  const t = useT();
  const [draft, setDraft] = useState<{policy: string; filters: string[]} | null>(null);
  const saveDraft = (close: () => void) => {
    if (!draft) return;
    const filters = draft.filters.map(f => f.trim()).filter(Boolean);
    void source
      .apply(
        text => writeGroupEntry(text, entry!.name, {filters, policy: draft.policy}),
        errors => toast('negative', t('policy.editInvalid', {n: errors}))
      )
      .then(
        written => {
          if (written) {
            toast('positive', t('policy.updated', {name: entry!.name}));
            close();
          }
        },
        error => toast('negative', errorText(error))
      );
  };
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
  // The group reports its members' health itself, nested groups included; the node list fills in when it does not.
  const members = useMemo(
    () => g?.members.map(m => ({...m, health: preferredObservation(g.runtime.health.filter(h => h.member_id === m.id)) ?? health.get(m.id)})) ?? [],
    [g, health]
  );
  // Toasts name the member; the backend answers with its id.
  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? id;
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
  // Members the backend has not measured yet: neither healthy nor down, so the counts add up.
  const untested = members.filter(m => !m.health || (m.health.state !== 'healthy' && m.health.state !== 'unavailable')).length;
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
              {untested > 0 && (
                <Light small tone="neutral">
                  {t('policy.untested', {n: untested})}
                </Light>
              )}
            </span>
            <span className="rp-cluster">
              {source.writable && entry && (
                <ModalDialog
                  title={t('policy.editTitle', {name: g.name})}
                  narrow
                  isOpen={draft !== null}
                  onOpenChange={isOpen => {
                    if (!isOpen) setDraft(null);
                  }}
                  trigger={
                    <Button quiet isDisabled={source.busy} onPress={() => setDraft({policy: canonicalPolicy(entry.policy), filters: entry.filters})}>
                      {t('policy.edit')}
                    </Button>
                  }
                  footer={close => (
                    <>
                      <Button onPress={close}>{t('ui.cancel')}</Button>
                      <Button accent isDisabled={!draft?.filters.some(f => f.trim())} isPending={source.busy} onPress={() => saveDraft(close)}>
                        {t('policy.save')}
                      </Button>
                    </>
                  )}
                >
                  {draft && (
                    <div className="rp-list">
                      <span className="rp-label">{t('policy.editHelp')}</span>
                      <LabeledSelect
                        label={t('policy.policy')}
                        value={draft.policy}
                        onChange={policy => setDraft({...draft, policy})}
                        items={policyNames.map(name => ({id: name, label: t(policyKindLabels[name]), desc: name}))}
                      />
                      {draft.filters.map((filter, i) => (
                        <TextField
                          key={i}
                          label={t('policy.filterN', {n: i + 1})}
                          value={filter}
                          placeholder="name(keyword: 'HK')"
                          spellCheck={false}
                          onChange={value => setDraft({...draft, filters: draft.filters.map((f, j) => (j === i ? value : f))})}
                          action={
                            <Button
                              quiet
                              icon
                              label={t('policy.removeFilter', {n: i + 1})}
                              onPress={() => setDraft({...draft, filters: draft.filters.filter((_, j) => j !== i)})}
                            >
                              <Close />
                            </Button>
                          }
                        />
                      ))}
                      <Button small quiet onPress={() => setDraft({...draft, filters: [...draft.filters, '']})}>
                        {t('policy.addFilter')}
                      </Button>
                    </div>
                  )}
                </ModalDialog>
              )}
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
            </span>
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
                    if (!result) return;
                    const tcp = result.selection.tcp?.member_id;
                    const udp = result.selection.udp?.member_id;
                    const member =
                      tcp && udp && tcp !== udp
                        ? `TCP ${memberName(tcp)} · UDP ${memberName(udp)}`
                        : tcp || udp
                          ? memberName((tcp ?? udp)!)
                          : t('policy.noneSelected');
                    toast('positive', t('policy.backToAutomatic', {name: g.name, member}));
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
                            {name: g.name, member: memberName(result.member_id)}
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
  const resources = useCapabilities().data?.resources;
  const groups = useGroups();
  const nodes = useNodes(resources?.nodes.available === true);
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
  const source = useMainSourceEdit();
  const entries = useMemo(() => readGroupEntries(source.main?.content ?? ''), [source.main?.content]);
  return (
    <div className="rp-page">
      <p className="rp-note">{t('policy.note')}</p>
      <ErrorMessage
        error={groups.error ?? nodes.error}
        onRetry={() => {
          groups.refetch();
          nodes.refetch();
        }}
      />
      {groups.loading && !groups.data && <Loading />}
      {groups.data?.length === 0 && <Empty>{t('policy.empty')}</Empty>}
      <DisclosureGroup>
        {groups.data?.map(g => (
          <PolicyCard
            key={g.id}
            id={g.id}
            health={health}
            refreshGroups={groups.refetch}
            refreshNodes={nodes.refetch}
            onLoaded={onLoaded}
            source={source}
            entry={entries.find(entry => entry.name === g.name)}
          />
        ))}
      </DisclosureGroup>
    </div>
  );
}
