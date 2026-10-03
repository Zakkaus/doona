import {getApi} from '../../../api';
import type {Go} from '../../../shell/routes';
import {groupQuery} from '../../shared/link';

// Opens a group the person just wrote on the Policies page. The list is read when they ask, after the reload that
// made the group, since a list polled before it would not hold a new one.
export function openGroup(go: Go, name: string) {
  void getApi()
    .groups()
    .then(
      groups => go('policies', groupQuery(groups, name)),
      () => go('policies')
    );
}
