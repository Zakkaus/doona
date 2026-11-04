import type {Node} from '../../../api/model';
import {preferredHealth} from '../../../api/selectors';
import {nestedIn} from '../../../dae/groups';
import {compileFilters} from '../../../dae/groupFilters';
import type {Translator} from '../../../i18n';
import type {NodeStatus} from '../../../ui/ui';
import {healthStatus} from '../../shared/groupText';

// Member choices follow the draft filters, including before a new group exists on the backend. Only the group dialog
// needs them, so they live apart from shared/groupText.ts: the nodes view pulls that module into the startup bundle,
// and the filter compiler with its regex converter stays out of it.
export function draftMembers(filters: string[], nodes: Node[], t: Translator): Array<{name: string; nodeName: boolean; status: NodeStatus}> {
  const admits = compileFilters(filters);
  return [
    ...nestedIn({filters}).map(name => ({name, nodeName: false, status: {text: '', badge: t('ui.group')}})),
    ...nodes.filter(admits).map(node => ({name: node.name, nodeName: true, status: healthStatus(preferredHealth(node), t)}))
  ];
}
