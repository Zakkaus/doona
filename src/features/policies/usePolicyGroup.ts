import {useEffect, useMemo} from 'react';
import {useT} from '../../i18n';
import {useGroupControl} from '../../store';
import type {HealthObservation} from '../../api/model';
import type {MainSourceEdit} from '../config/mainSource';
import type {GroupEntry} from '../../dae/groups';
import {memberHealth} from './health';
import {memberViews, policyCardView, probeSummary} from './view';
import {usePolicyEdit} from './usePolicyEdit';
import {errorText, toast} from '../../ui/ui';
export type PolicyGroupInput = {
  id: string;
  name: string;
  health: Map<string, HealthObservation | undefined>;
  refreshGroups: () => void;
  refreshNodes: () => void;
  source: MainSourceEdit;
  entry: GroupEntry | undefined;
};
export function usePolicyGroup(input: PolicyGroupInput) {
  const {id, health, refreshGroups, refreshNodes, source, entry} = input;
  const t = useT();
  const control = useGroupControl(id, refreshGroups, refreshNodes);
  useEffect(() => {
    if (control.actionError) toast('negative', errorText(control.actionError));
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
        tcp && udp && tcp !== udp ? `TCP ${memberName(tcp)} · UDP ${memberName(udp)}` : tcp || udp ? memberName((tcp ?? udp)!) : t('policy.noneSelected');
      toast('positive', t('policy.backToAutomatic', {name: g.name, member}));
    });
  const interrupt = (value: boolean) =>
    void control.setInterrupt(value).then(saved => {
      if (saved && g) toast('positive', t('policy.updated', {name: g.name}));
    });
  const select =
    card && (card.selectable || card.overridable)
      ? (memberId: string) =>
          void control.select(memberId).then(result => {
            if (result && g)
              toast(
                'positive',
                t(result.source === 'override' ? 'policy.pinned' : result.connections_interrupted ? 'policy.selectedInterrupted' : 'policy.selectedKept', {
                  name: g.name,
                  member: memberName(result.member_id)
                })
              );
          })
      : undefined;
  return {
    card,
    edit,
    members,
    error: control.error,
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
