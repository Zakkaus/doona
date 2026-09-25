import type {Capabilities} from '../../api/model';
import {offered} from '../../api/capabilities';
import type {Key} from '../../i18n';

// What the log says comes first and is the default, then the log itself; a query is an occasional action.
export function dnsTabs(resources: Capabilities['resources'] | undefined): Array<{id: 'stats' | 'log' | 'query' | 'cache'; titleKey: Key}> {
  return [
    ...(offered(resources, 'dns_log', {whileLoading: true}) ? [{id: 'stats' as const, titleKey: 'dns.tab.stats' as const}] : []),
    ...(offered(resources, 'dns_log', {whileLoading: true}) ? [{id: 'log' as const, titleKey: 'dns.log' as const}] : []),
    ...(offered(resources, 'dns_query', {whileLoading: true}) ? [{id: 'query' as const, titleKey: 'dns.query' as const}] : []),
    ...(offered(resources, 'dns_cache', {whileLoading: true}) ? [{id: 'cache' as const, titleKey: 'ui.cache' as const}] : [])
  ];
}
