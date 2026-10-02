import type {BulkCloseQuery, Connection} from '../../api/model';
import {tagId} from '../shared/taggedId';
import {enumLabel} from '../../i18n/enum';
import {chainLabel, chainNames, connectionStates, sourceIp, addressPort, type MessageRef, type OutboundNames} from '../../api/selectors';
import {localTime, formatBytes, formatRate} from '../../i18n/format';
import type {Key, Translator as LabelFn} from '../../i18n';
import {word} from '../../api/labels';
import type {Help} from '../../ui/ui';
import {csvLine} from '../../ui/ui';
import {ruleHref, traceQuery} from '../shared/link';
import {within} from '../../shell/route';
import type {connectionsView} from './tableRows';

const observers: Record<Connection['observed_by'], Key> = {userspace: 'conn.observed.userspace', ebpf: 'conn.observed.ebpf', mixed: 'conn.observed.mixed'};
// Where the chain came from: captured when the connection was routed, rebuilt from retained records, or not known.
const chainSources: Record<Connection['chain_source'], Key> = {
  evaluation: 'conn.chainSource.evaluation',
  reconstructed: 'conn.chainSource.reconstructed',
  unknown: 'ui.unknown'
};
export function connectionDetails(c: Connection, locale: string): Array<[Key, string | MessageRef]> {
  // A backend that predates the field leaves it out, and the row with it.
  const chainSource: Array<[Key, string | MessageRef]> = c.chain_source
    ? [['conn.f.chainSource', chainSources[c.chain_source] ? {key: chainSources[c.chain_source]} : c.chain_source]]
    : [];
  return [
    ['ui.device', c.src ?? '—'],
    ['conn.f.dst', c.dst ?? '—'],
    ['ui.domain', c.domain ?? '—'],
    ['conn.f.ingress', word(c.ingress)],
    ['conn.f.domainSource', word(c.domain_source)],
    ...chainSource,
    ['ui.process', c.pname ?? '—'],
    ['conn.f.observedBy', observers[c.observed_by] ? {key: observers[c.observed_by]} : c.observed_by],
    ['ui.upload', formatBytes(c.upload_bytes, locale)],
    ['ui.download', formatBytes(c.download_bytes, locale)],
    ['conn.f.uploadRate', formatRate(c.upload_bytes_per_second, locale)],
    ['conn.f.downloadRate', formatRate(c.download_bytes_per_second, locale)],
    ['conn.f.started', localTime(c.started_at, locale)]
  ];
}

// A phone folds the secondary filters into one menu: a row per filter showing its choice, each opening that filter's
// choices, and each with an entry that lifts it. The count of filters in force labels the menu's button.
export function filterMenu(
  lists: ReturnType<typeof connectionsView>,
  filters: {network: string; out: string; src: string | undefined; rule: string},
  t: LabelFn
) {
  const [devices, rules] = lists.picks;
  // Each row names the filter it sets, so the page binds its handler by name rather than by position.
  const one = (
    filter: 'network' | 'out' | 'src' | 'rule',
    title: string,
    items: Array<{id: string; label: string; desc?: string}>,
    value: string,
    searchLabel?: string
  ) => ({
    filter,
    label: title,
    sections: [{title, items, value}],
    searchLabel
  });
  return {
    active: [filters.network !== 'all', filters.out !== 'all', !!filters.src, filters.rule !== 'all'].filter(Boolean).length,
    submenus: [
      one(
        'network',
        t('ui.network'),
        lists.networks.map(([id, label]) => ({id, label})),
        filters.network
      ),
      one('out', t('ui.outbound'), lists.outbounds, filters.out, t('ui.filterOutbounds')),
      one('src', devices.title, [{id: tagId('src', ''), label: t('conn.allDevices')}, ...devices.items], devices.value, t('ui.filterDevices')),
      one('rule', rules.title, [{id: tagId('rule', 'all'), label: t('conn.allRules')}, ...rules.items], rules.value, t('ui.filterRules'))
    ]
  };
}

// The states before a connection is established say little by name, so each is explained beside the status: the
// three steps are listed together because a connection held at one of them is read against the others.
const pendingStates = {
  observed: ['conn.state.observed', 'conn.stateHelp.observed'],
  routing: ['conn.state.routing', 'conn.stateHelp.routing'],
  dialing: ['conn.state.dialing', 'conn.stateHelp.dialing']
} as const satisfies Record<string, [Key, Key]>;
export function connectionStateHelp(state: Connection['state'], t: LabelFn): Help | null {
  if (!Object.hasOwn(pendingStates, state)) return null;
  return {title: t('ui.state'), text: Object.values(pendingStates).map(([label, help]) => t('ui.valuePair', {label: t(label), value: t(help)}))};
}

export function connectionDetail(
  current: (Connection & {network: string}) | undefined,
  locale: string,
  t: LabelFn,
  names: OutboundNames,
  rulesListed: boolean
) {
  return current
    ? {
        id: current.id,
        title: current.domain || current.dst || current.id,
        tone: current.state === 'blocked' || current.state === 'failed' ? ('err' as const) : current.state === 'active' ? ('ok' as const) : ('info' as const),
        status: t('ui.aside', {text: enumLabel(connectionStates, current.state, t), note: current.network.toUpperCase()}),
        chain: chainLabel(current, t, names),
        outbound: current.outbound,
        rule: {expression: current.rule_expression, href: ruleHref(current.rule_id, rulesListed)},
        fields: connectionDetails(current, locale).map(
          ([key, value]) => [t(key), typeof value === 'string' ? value : t(value.key, value.params)] as [string, string]
        ),
        flowQuery: within('', {tab: 'records', ...(current.flow_id ? {id: current.flow_id} : {connection_id: current.id})}),
        // The trace of this connection's target, from its source and process; null when it has neither a domain nor an
        // address.
        traceQuery:
          current.domain || sourceIp(current.dst)
            ? traceQuery({
                network: current.network === 'udp' ? 'udp' : 'tcp',
                domain: current.domain ?? '',
                dst_ip: sourceIp(current.dst),
                dst_port: addressPort(current.dst),
                src_ip: sourceIp(current.src),
                src_port: addressPort(current.src),
                pname: current.pname ?? ''
              })
            : null,
        source: current.src ? (sourceIp(current.src) ?? current.src) : null,
        closable: current.state === 'active' || current.state === 'dialing' || current.state === 'routing',
        // An ebpf-only observation is kernel-forwarded: the backend has no userspace transport to cancel.
        closeReason: current.observed_by === 'ebpf' ? t('conn.notClosable') : null,
        stateHelp: connectionStateHelp(current.state, t)
      }
    : null;
}

export function connectionsExport(shown: Array<Connection & {network: string}>, names: OutboundNames) {
  return (
    [
      csvLine(['id', 'target', 'domain', 'source', 'network', 'state', 'outbound', 'chain', 'rule', 'upload_bytes', 'download_bytes', 'started_at']),
      ...shown.map(c =>
        csvLine([
          c.id,
          c.dst,
          c.domain,
          c.src,
          c.network,
          c.state,
          c.outbound,
          chainNames(c.chain, names).join(' > '),
          c.rule_expression,
          c.upload_bytes,
          c.download_bytes,
          c.started_at
        ])
      )
    ].join('\n') + '\n'
  );
}

// The contract's bulk close selects every live connection of a network and source; anything narrower (an
// outbound, rule or text filter, or a truncated list) closes the listed ids one by one. The ids travel with the
// bulk query so a 413 from the advertised limit can fall back to them without widening the confirmed scope.
export type CloseSelection = {ids: string[]; query?: NonNullable<BulkCloseQuery>};
export function closeSelection(
  shown: Connection[],
  scope: {network: string; src: string | undefined; narrowed: boolean; truncated: boolean; bulkLimit: number | null | undefined}
): CloseSelection {
  const ids = shown.map(c => c.id);
  const overLimit = scope.bulkLimit != null && ids.length > scope.bulkLimit;
  return scope.narrowed || scope.truncated || overLimit ? {ids} : {ids, query: {type: scope.network as 'all' | 'tcp' | 'udp', src: scope.src, all: true}};
}
