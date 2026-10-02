import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {SearchTarget} from '../../shell/routes';

// The group editor opens from a link with `new=1`; creating a group writes the main configuration.
export const policiesTargets = (resources: Capabilities['resources'] | undefined): SearchTarget[] =>
  offered(resources, 'groups', {whileLoading: false}) && resources?.config.writable === true
    ? [{id: 'policies:new', titleKey: 'group.newGroup', parentKey: 'nav.policies', route: 'policies', params: {new: '1'}, aliases: ['group editor']}]
    : [];
