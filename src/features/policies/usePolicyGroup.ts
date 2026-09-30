import {useEffect, useEffectEvent, useMemo, useState} from 'react';
import {useT} from '../../i18n';
import {groupConflict, useGroupControl} from '../../store';
import type {GroupSummary, HealthObservation} from '../../api/model';
import type {MainSourceEdit} from '../../store/mainSource';
import {memberHealth} from './health';
import {actionErrorText, groupActionsReason, memberViews, policyCardView, probeSummary, untestedHelp} from './view';
import {usePolicyEdit, type PolicyDeclaration} from './usePolicyEdit';
import type {OutboundCatalogue} from './view';
import {useCheckEdit} from './useCheckEdit';
import {toast} from '../../ui/ui';
import {requestIdOf} from '../../api/error';
export type PolicyGroupInput = {
  id: string;
  name: string;
  health: Map<string, HealthObservation | undefined>;
  // What the edit dialog's final outbound can name.
  outbounds: OutboundCatalogue;
  refreshGroups: () => void;
  refreshNodes: () => void;
  source: MainSourceEdit;
  declaration: PolicyDeclaration;
  members: number;
  // The selection the groups list last reported.
  selection: GroupSummary['selection'];
  // An off-screen card keeps what it shows and stops polling until it scrolls back.
  paused: boolean;
  // The group a link opened, which shows its members at once.
  focused: boolean;
};
export function usePolicyGroup(input: PolicyGroupInput) {
  const {id, health, outbounds, refreshGroups, refreshNodes, source, declaration, selection, paused, focused} = input;
  const t = useT();
  const control = useGroupControl(id, refreshGroups, refreshNodes, paused);
  // A language switch does not repeat the toast.
  const report = useEffectEvent((error: Error) =>
    toast('negative', t('policy.actionFailed', {name: control.data?.name ?? input.name, error: actionErrorText(error, t, false)}), {
      requestId: requestIdOf(error)
    })
  );
  useEffect(() => {
    if (control.actionError) report(control.actionError);
  }, [control.actionError]);
  const g = control.data;
  // The list polls faster than each group, so a selection it reports that this group does not show yet reads the group again.
  const {refetch} = control;
  const shown = g?.runtime.selection;
  const behind =
    !paused && !!shown && (selection.tcp_member_id !== (shown.tcp?.member_id ?? null) || selection.udp_member_id !== (shown.udp?.member_id ?? null));
  useEffect(() => {
    if (behind) refetch();
  }, [behind, selection, refetch]);
  const members = useMemo(() => memberViews(memberHealth(g, health), t), [g, health, t]);
  const card = g ? policyCardView(g, members, control.network, t) : null;
  // Pinning opens members once; each new visit from a link opens them again.
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState(false);
  const [wasFocused, setWasFocused] = useState(focused);
  if (wasFocused !== focused) {
    setWasFocused(focused);
    if (focused) setExpanded(true);
  }
  if (!opened && card && (card.pinned || focused)) {
    setOpened(true);
    setExpanded(true);
  }
  const declared = usePolicyEdit(g?.name ?? input.name, source, declaration, {g, members, outbounds});
  // The dialog shows the group's configuration, so opening it reads the group again rather than waiting for its poll.
  const edit = {
    ...declared,
    show: () => {
      refetch();
      declared.show();
    },
    view: () => {
      refetch();
      declared.view();
    }
  };
  const conflict = groupConflict(control.actionError);
  const check = useCheckEdit(g, control.patchConfig, !!control.busy, conflict);
  const memberName = (id: string) => members.find(member => member.id === id)?.name ?? id;
  const probe = () =>
    void control.probe().then(result => {
      if (result && g) {
        const summary = probeSummary(result);
        toast('positive', t('ui.valuePair', {label: g.name, value: t(summary.key, summary.params)}));
      }
    });
  const release = () =>
    void control.clearOverride(card?.automatic && !expanded ? 'both' : control.network).then(result => {
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
    void declared
      .refreshOrigin(() => control.setInterrupt(value))
      .then(saved => {
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
    check,
    members,
    error: control.error,
    retry: control.refetch,
    loading: !g && !control.error,
    loadingText: t('policy.loading', {groupId: id}),
    busy: !!control.busy,
    probing: control.busy === 'probe',
    probeDisabled: !!control.busy || !control.canProbe,
    probeTip: !control.canProbe ? t('policy.noProbe') : undefined,
    expanded,
    setExpanded,
    // What the dialog shows beside the declaration, and alone when it opens read-only: the group's configuration as
    // the backend reports it, and the interrupt switch, which writes to the group directly rather than to the file.
    details: card
      ? {
          fields: card.fields,
          heading: edit.editing ? t('policy.liveConfig') : null,
          reason: edit.editing ? null : (edit.tip ?? null),
          interrupt: card.interruptable
            ? {selected: card.interrupt, unset: card.interruptUnset, isDisabled: !!control.busy || edit.busy, change: interrupt}
            : null
        }
      : null,
    // Why the group's actions are locked, which the card gives as the lock beside its name.
    actionsReason: groupActionsReason(
      {shown: source.writable, busy: source.busy, blocked: edit.tip ?? null},
      {busy: !!control.busy, canProbe: !!control.canProbe},
      t
    ),
    untestedHelp: untestedHelp(card?.untested ?? null, !!control.canProbe, t),
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
