import type {GroupSelectionResult} from '../../api/model';
import type {Translator} from '../../i18n';
import {toast} from '../../ui/ui';

// What a selection that went through did: pinned the member, or selected it with or without closing connections.
export const selectionNotice = (result: GroupSelectionResult, group: string, member: string, t: Translator) =>
  t(result.source === 'override' ? 'policy.pinned' : result.connections_interrupted ? 'policy.selectedInterrupted' : 'policy.selectedKept', {
    name: group,
    member
  });

// Selects a group member from any control that offers it and reports where the selection went. Pressing the member
// already in place would only repeat the request.
export function selectMember(
  select: (member: string) => Promise<GroupSelectionResult | undefined>,
  member: string,
  selected: string | undefined,
  group: string | undefined,
  nameOf: (member: string) => string,
  t: Translator
) {
  if (member === selected) return;
  void select(member).then(result => {
    if (result && group !== undefined) toast('positive', selectionNotice(result, group, nameOf(result.member_id), t));
  });
}
