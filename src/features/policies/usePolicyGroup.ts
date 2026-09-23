import {useEffect, useEffectEvent, useMemo} from 'react';
import {useT} from '../../i18n';
import {useGroupControl} from '../../store';
import type {HealthObservation} from '../../api/model';
import type {MainSourceEdit} from '../../store/mainSource';
import type {GroupEntry} from '../../dae/groups';
import {memberHealth} from './health';
import {actionErrorText, memberViews, policyCardView, probeSummary} from './view';
import {usePolicyEdit} from './usePolicyEdit';
import {toast} from '../../ui/ui';
export type PolicyGroupInput = {
  id: string;
  name: string;
  health: Map<string, HealthObservation | undefined>;
  refreshGroups: () => void;
  refreshNodes: () => void;
  source: MainSourceEdit;
  entry: GroupEntry | undefined;
  members: number;
  // An off-screen card keeps what it shows and stops polling until it scrolls back.
  paused: boolean;
};
export function usePolicyGroup(input: PolicyGroupInput) {
  const {id, health, refreshGroups, refreshNodes, source, entry, paused} = input;
  const t = useT();
  const control = useGroupControl(id, refreshGroups, refreshNodes, paused);
  // A language switch does not repeat the toast.
  const report = useEffectEvent((error: Error) => toast('negative', actionErrorText(error, t)));
  useEffect(() => {
    if (control.actionError) report(control.actionError);
  }, [control.actionError]);
  const g = control.data;
  const members = useMemo(() => memberViews(memberHealth(g, health), t), [g, health, t]);
  const card = g ? policyCardView(g, members, control.network, t) : null;
  const edit = usePolicyEdit(g?.name ?? input.name, source, entry);
  const memberName = (id: string) => members.find(member => member.id === id)?.name ?? id;
  const probe = () =>
    void control.probe().then(result => {
      if (result && g) {
        const summary = probeSummary(result);
        toast('positive', t('ui.valuePair', {label: g.name, value: t(summary.key, summary.params)}));
      }
    });
  const release = () =>
    void control.clearOverride().then(result => {
      if (!result || !g) return;
      const tcp = result.selection.tcp?.member_id,
        udp = result.selection.udp?.member_id;
      const member =
        tcp && udp && tcp !== udp
          ? t('policy.memberPerNetwork', {tcp: memberName(tcp), udp: memberName(udp)})
          : tcp || udp
            ? memberName((tcp ?? udp)!)
            : t('policy.noneSelected');
      toast('positive', t('policy.backToAutomatic', {name: g.name, member}));
    });
  const interrupt = (value: boolean) =>
    void control.setInterrupt(value).then(saved => {
      if (saved && g) toast('positive', t('policy.updated', {name: g.name}));
    });
  const select =
    card && (card.selectable || card.overridable)
      ? (memberId: string) => {
          // Pressing the member already in place would only repeat the request.
          if (memberId === card.selected) return;
          void control.select(memberId).then(result => {
            if (result && g)
              toast(
                'positive',
                t(result.source === 'override' ? 'policy.pinned' : result.connections_interrupted ? 'policy.selectedInterrupted' : 'policy.selectedKept', {
                  name: g.name,
                  member: memberName(result.member_id)
                })
              );
          });
        }
      : undefined;
  return {
    card,
    edit,
    members,
    error: control.error,
    retry: control.refetch,
    loading: !g && !control.error,
    loadingText: t('policy.loading', {id}),
    busy: !!control.busy,
    probing: control.busy === 'probe',
    probeDisabled: !!control.busy || !control.canProbe,
    probeTip: !control.canProbe ? t('policy.noProbe') : undefined,
    probeText: t(control.busy === 'probe' ? 'policy.probing' : 'policy.probeAll'),
    probe,
    release,
    releasing: control.busy === 'selection',
    interrupt,
    select,
    network: control.network,
    setNetwork: (value: string) => {
      if (value === 'both' || value === 'tcp' || value === 'udp') control.setNetwork(value);
    }
  };
}
