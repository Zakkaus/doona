import type {FlowDetail, FlowList, FlowStep, FlowSummary} from '../../../api/model';
import type {Key} from '../../../i18n/messages';
import {formatList, formatNumber, LOCALE, type Lang, type Translator} from '../../../i18n';
import {chainLabel, connectionStates, localTime, outboundLabel, relativeStart, sourceIp, type MessageRef, type OutboundNames} from '../../../api/selectors';
import {millis, parseU64} from '../../../api/u64';
import {latencyTone} from '../../../ui/ui';
import {policyKindLabels} from '../../policies/view';
import type {RoutingTree, TreeBy, TreeItem} from './map';
import {treeIndex, treeRows} from './map';
import {href} from '../../../shell/route';
import {ruleSeedHref} from '../seed';
const flowWords: Record<string, Key> = {
  kernel: 'flow.v.kernel',
  userspace: 'flow.v.userspace',
  matched: 'flow.v.matched',
  other_family_trusted: 'flow.v.otherFamilyTrusted',
  failed: 'flow.v.failed',
  not_required: 'flow.v.notRequired',
  unavailable: 'flow.v.unavailable',
  pass: 'flow.v.pass',
  redirect: 'flow.v.redirect',
  hold: 'flow.v.hold',
  arm_direct: 'flow.v.armDirect',
  activate_direct: 'flow.v.activateDirect',
  activate_proxy: 'flow.v.activateProxy',
  drop: 'flow.v.drop',
  started: 'flow.v.started',
  succeeded: 'flow.v.succeeded',
  cancelled: 'flow.v.cancelled',
  transport_ready: 'flow.v.transportReady',
  target_request_sent: 'flow.v.targetRequestSent',
  target_confirmed: 'flow.v.targetConfirmed',
  first_reply: 'flow.v.firstReply',
  terminal: 'flow.v.terminal',
  unknown: 'ui.unknown',
  route_selected: 'flow.v.routeSelected',
  no_new_routing_input: 'flow.v.noNewRoutingInput',
  reply_received: 'flow.v.replyReceived',
  hit: 'flow.v.hit',
  miss: 'flow.v.miss',
  stale: 'flow.v.stale',
  bypass: 'flow.v.bypass',
  hosts: 'flow.v.hosts',
  coalesced: 'flow.v.coalesced',
  cache: 'flow.v.cache',
  upstream: 'ui.upstream',
  lan: 'flow.v.lan',
  wan: 'flow.v.wan',
  tls_sni: 'flow.v.tlsSni',
  http_host: 'flow.v.httpHost',
  quic_sni: 'flow.v.quicSni',
  dns_mapping: 'flow.v.dnsMapping',
  explicit: 'flow.v.explicit'
};
const traceGaps: Record<string, Key> = {
  not_instrumented: 'flow.m.notInstrumented',
  started_late: 'flow.m.startedLate',
  buffer_overflow: 'flow.m.bufferOverflow',
  sampled: 'flow.m.sampled',
  redacted: 'flow.m.redacted',
  evicted: 'flow.m.evicted'
};
// The routing inputs a trace records, labelled like the connection detail; kernel field names stay as they are.
const inputLabels: Record<string, Key | string> = {
  src: 'ui.source',
  dst: 'conn.f.dst',
  domain: 'ui.domain',
  domain_source: 'conn.f.domainSource',
  ingress: 'conn.f.ingress',
  pname: 'ui.process',
  network: 'ui.protocol',
  dscp: 'DSCP',
  mark: 'fwmark',
  uid: 'UID',
  pid: 'PID'
};
export const word = (value: string | null | undefined): string | MessageRef => (value == null ? '—' : flowWords[value] ? {key: flowWords[value]} : value);
const yesNo = (value: boolean | null | undefined): string | MessageRef => (value == null ? '—' : {key: value ? 'ui.yes' : 'ui.no'});

function flowStepFields(step: FlowStep): Array<[Key | MessageRef, string | MessageRef]> | null {
  const text = (value: unknown) => (value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  switch (step.stage) {
    case 'input':
      return Object.entries(step.data.values)
        .filter(([, value]) => value != null && value !== '')
        .map(([name, value]) => {
          const label = inputLabels[name];
          const labelRef: Key | MessageRef =
            label === undefined || !label.includes('.') ? {key: 'flow.f.input', params: {name: label ?? name}} : (label as Key);
          return [labelRef, typeof value === 'string' && (name === 'ingress' || name === 'domain_source') ? word(value) : text(value)];
        });
    case 'route':
      return [
        ['flow.f.chain', step.data.chain],
        ['flow.f.plane', word(step.data.plane)],
        [
          'ui.rule',
          step.data.rules
            .filter(rule => rule.result === 'matched')
            .map(rule => rule.expression ?? rule.rule_id)
            .join(', ') || '—'
        ],
        ['ui.outbound', text(step.data.outbound)],
        ['flow.f.must', yesNo(step.data.must)]
      ];
    case 'dial_mode':
      return [
        ['flow.f.dialTarget', step.data.configured + ' → ' + step.data.effective_target],
        ['flow.f.verification', word(step.data.verification)]
      ];
    case 'dns':
      return [
        ['ui.name', step.data.name],
        ['flow.f.source', word(step.data.source)],
        ['flow.f.cache', word(step.data.cache)],
        ['ui.upstream', text(step.data.upstream)],
        ['flow.f.selectedIp', text(step.data.selected_ip)]
      ];
    case 'outbound':
      return [
        ['ui.outbound', text(step.data.routed_outbound) + ' → ' + text(step.data.effective_outbound)],
        ['flow.f.selectionPath', step.data.selection_path.map(p => p.group_id + ' → ' + text(p.member_name ?? p.member_id)).join(' / ') || '—'],
        ['flow.f.leafNode', text(step.data.leaf_node_id)],
        ['ui.target', text(step.data.target)],
        ['ui.state', word(step.data.status)]
      ];
    case 'connection':
      return [
        ['ui.state', {key: connectionStates[step.data.state]}],
        ['flow.f.milestone', word(step.data.milestone)],
        ['flow.f.reason', word(step.data.reason)]
      ];
    case 'datapath':
      return [
        ['flow.f.plane', word(step.data.plane)],
        ['flow.f.action', word(step.data.action)],
        ['flow.f.reason', word(step.data.reason)]
      ];
    case 'reroute':
      return [
        ['flow.f.performed', yesNo(step.data.performed)],
        ['flow.f.reason', word(step.data.reason)]
      ];
    default:
      return null;
  }
}

type TileNote = {text: string; tone?: 'ok' | 'warn' | 'err'};
export type TileView = {
  id: string;
  stage: TreeBy | 'outbound' | 'node';
  name: string;
  badge?: string;
  notes: TileNote[];
  count: number;
  countText: string;
  label: string;
};
export function tileViews(tree: RoutingTree, t: Translator, lang: Lang): TileView[] {
  const unknown = (item: TreeItem, name: string) => (item.unknown ? t('flow.mapUnknown') : name);
  type Bare = Omit<TileView, 'label' | 'countText'>;
  const tiles: Bare[] = [
    ...tree.leaves.map<Bare>(leaf => ({
      id: leaf.id,
      stage: tree.by,
      name: unknown(leaf, leaf.label),
      badge: leaf.must ? 'must' : undefined,
      notes: [],
      count: leaf.count
    })),
    ...tree.outbounds.map<Bare>(outbound => ({
      id: outbound.id,
      stage: 'outbound',
      name: unknown(outbound, outboundLabel(outbound.label, t)),
      notes: [
        ...outbound.groups.slice(1).map(group => ({text: '› ' + group.name})),
        ...outbound.groups.slice(-1).map(group => ({text: group.policy || t(policyKindLabels[group.kind])})),
        ...(outbound.kind === 'group' && !outbound.node ? [{text: t('flow.treeNoNode')}] : [])
      ],
      count: outbound.count
    })),
    ...tree.nodes.map<Bare>(node => ({
      id: node.id,
      stage: 'node',
      name: unknown(node, node.label),
      notes:
        node.latency != null
          ? [{text: t('ui.latency', {n: millis(node.latency)}), tone: latencyTone(node.latency)}]
          : node.unavailable
            ? [{text: t('ui.unavailable'), tone: 'err'}]
            : [],
      count: node.count
    }))
  ];
  const names = new Map(tiles.map(tile => [tile.id, tile.name]));
  const {outgoing, incoming} = treeIndex(tree);
  return tiles.map(tile => {
    const to = (outgoing.get(tile.id) ?? []).map(link => names.get(link.target)!);
    // A node's groups are drawn only as connectors, so its name carries them for assistive technology.
    const from = tile.stage === 'node' ? (incoming.get(tile.id) ?? []).map(link => names.get(link.source)!) : [];
    const parts = [tile.name, ...(tile.badge ? [tile.badge] : []), ...tile.notes.map(note => note.text), t('flow.treeFlows', {n: tile.count})];
    if (from.length) parts.push(t('flow.treeFrom', {names: formatList(lang, from)}));
    if (to.length) parts.push(t('flow.treeTo', {names: formatList(lang, to)}));
    return {...tile, countText: formatNumber(tile.count, LOCALE[lang]), label: parts.join(t('ui.separator'))};
  });
}

const scopes: Record<string, Key> = {
  userspace_tcp: 'flow.userspaceTcp',
  userspace_udp: 'flow.userspaceUdp',
  kernel_direct: 'flow.kernelDirect',
  kernel_block: 'flow.kernelBlock',
  dns_intercept: 'flow.dnsIntercept',
  kernel_bypass: 'flow.kernelBypass'
};
const visibility: Record<string, Key> = {full: 'flow.full', partial: 'flow.partialVisibility', none: 'ui.none'};
export type CoverageView = {summary: string | null; detail: string; dropped: string | null};
export function coverageView(data: Pick<FlowList, 'coverage' | 'dropped_records'>, t: Translator, lang: Lang): CoverageView | null {
  const partial = Object.entries(data.coverage).filter(([, value]) => value !== 'full');
  const count = parseU64(data.dropped_records);
  const dropped = count ? t('flow.dropped', {n: formatNumber(count, LOCALE[lang])}) : null;
  if (!partial.length && !dropped) return null;
  return {
    summary: partial.length ? t('flow.coverageSummary', {n: partial.length}) : null,
    detail: formatList(
      lang,
      partial.map(([scope, value]) => t('ui.valuePair', {label: scopes[scope] ? t(scopes[scope]) : scope, value: t(visibility[value])}))
    ),
    dropped
  };
}

type RoutingMapView = {tree: RoutingTree; state: 'loading' | 'empty' | 'ready' | 'error'; pinLabel: string | null};
export function routingMapView(tree: RoutingTree, ready: boolean, failed: boolean, pinned: string | null, count: number, t: Translator): RoutingMapView {
  return {
    tree,
    state: !ready ? (failed ? 'error' : 'loading') : !tree.leaves.length && !tree.outbounds.length ? 'empty' : 'ready',
    pinLabel: pinned ? t('flow.viewPinned', {n: count}) : null
  };
}

const stages: Record<string, Key> = {
  input: 'flow.stage.input',
  route: 'flow.stage.route',
  dial_mode: 'flow.stage.dialMode',
  dns: 'flow.stage.dns',
  outbound: 'flow.stage.outbound',
  connection: 'flow.stage.connection',
  datapath: 'flow.stage.datapath',
  reroute: 'flow.stage.reroute'
};
const traceStates: Record<string, Key> = {complete: 'flow.status.complete', partial: 'flow.status.partial', disabled: 'flow.status.disabled'};
type FlowRow = {
  id: string;
  target: string;
  chain: string;
  expression: string | null;
  ruleId: string | null;
  recomputed: boolean;
  network: string;
  state: string;
  started: string;
};
type FlowDetailView = {
  title: string;
  status: string;
  tone: 'warn' | undefined;
  revision: string;
  fields: [string, string][];
  connectionHref: string | null;
  seedHref: string | null;
  steps: {id: number; stage: string; observed: string; elapsed: string; fields: [string, string][] | null; raw: string}[];
};
type FlowRecordsView = {rows: FlowRow[]; coverage: CoverageView | null; stateOptions: {id: string; label: string}[]};
export function flowRecordsView(flows: FlowSummary[], list: FlowList | undefined, names: OutboundNames, t: Translator, lang: Lang): FlowRecordsView {
  const locale = LOCALE[lang];
  return {
    rows: flows.map(flow => ({
      id: flow.id,
      target: flow.input?.domain || flow.input?.dst || flow.id,
      chain: chainLabel(flow, t, names),
      expression: flow.rule_expression,
      ruleId: flow.rule_id,
      recomputed: flow.rule_source === 'recomputed',
      network: flow.network.toUpperCase(),
      state: t(connectionStates[flow.state]),
      started: relativeStart(flow.started_at, locale)
    })),
    coverage: list ? coverageView(list, t, lang) : null,
    stateOptions: [{id: 'all', label: t('flow.allStates')}, ...Object.entries(connectionStates).map(([id, key]) => ({id, label: t(key)}))]
  };
}
// Kept apart from the rows, so selecting a flow or an update to it does not remap the list.
export function flowDetailView(detail: FlowDetail | undefined, canAdd: boolean, t: Translator, lang: Lang): FlowDetailView | null {
  if (!detail) return null;
  const locale = LOCALE[lang];
  const ip = sourceIp(detail.input.dst ?? undefined);
  const seed = detail.input.domain ? {kind: 'domainSuffix' as const, value: detail.input.domain} : ip ? {kind: 'dip' as const, value: ip} : null;
  return {
    title: detail.input.domain || detail.input.dst || detail.id,
    status: t(traceStates[detail.trace.status]),
    tone: detail.trace.status === 'complete' ? undefined : 'warn',
    revision: t('flow.revision', {n: detail.revision}),
    fields: [
      [t('ui.state'), t(connectionStates[detail.state])],
      [t('ui.outbound'), outboundLabel(detail.outbound, t)],
      ...(detail.trace.missing.length
        ? [
            [
              t('flow.missing'),
              formatList(
                lang,
                detail.trace.missing.map(gap => (traceGaps[gap] ? t(traceGaps[gap]) : gap))
              )
            ] as [string, string]
          ]
        : [])
    ],
    connectionHref: detail.connection_id ? href('connections', {id: detail.connection_id}) : null,
    seedHref: canAdd && seed ? ruleSeedHref(seed) : null,
    steps: [...detail.trace.steps]
      .sort((a, b) => a.seq - b.seq)
      .map(step => {
        const fields = flowStepFields(step);
        return {
          id: step.seq,
          stage: stages[step.stage] ? t(stages[step.stage]) : step.stage,
          observed: localTime(step.observed_at, locale),
          elapsed: step.elapsed_us == null ? '—' : t('ui.microseconds', {n: step.elapsed_us}),
          fields:
            fields?.map(([key, value]) => [
              typeof key === 'string' ? t(key) : t(key.key, key.params),
              typeof value === 'string' ? value : t(value.key, value.params)
            ]) ?? null,
          raw: fields ? '' : JSON.stringify(step.data, null, 2)
        };
      })
  };
}

export const TREE_STEP = 30;
// Narrow screens pan instead of compressing the diagram.
const MIN_WIDTH = 720;
const PITCH = 40;
const TILE = 32;
const GAP = 56;
const shares = [5, 4, 3];
type TreeStage = TreeBy | 'outbound' | 'node';
const columns: Record<TreeStage, number> = {rule: 0, client: 0, outbound: 1, node: 2};
export type TreePlacement = {top: number; left: number; width: number};

export function treeWindow(tree: RoutingTree, limit: number): RoutingTree {
  return tree.leaves.length <= limit ? tree : {...tree, leaves: tree.leaves.slice(0, limit)};
}

export function treeGeometry(tree: RoutingTree, measured: number | null, t: Translator, lang: Lang) {
  const width = measured === null ? undefined : Math.max(measured, MIN_WIDTH);
  const unit = ((width ?? 0) - 2 * GAP) / shares.reduce((sum, share) => sum + share);
  const column = (stage: TreeStage) => {
    const index = columns[stage];
    return {left: shares.slice(0, index).reduce((sum, share) => sum + share * unit + GAP, 0), width: shares[index] * unit};
  };
  const layout = treeRows(tree);
  const placed = tileViews(tree, t, lang).map(view => ({view, style: {top: layout.at.get(view.id)! * PITCH, ...column(view.stage)}}));
  const outbounds = new Map(tree.outbounds.map(outbound => [outbound.id, outbound]));
  const geometry = tree.links.flatMap(link => {
    if (!layout.at.has(link.source) || !layout.at.has(link.target)) return [];
    const from = link.source.startsWith('outbound:') ? 'outbound' : tree.by;
    const start = column(from);
    const x1 = start.left + start.width;
    const x2 = column(from === 'outbound' ? 'node' : 'outbound').left;
    const y1 = layout.at.get(link.source)! * PITCH + TILE / 2;
    const y2 = layout.at.get(link.target)! * PITCH + TILE / 2;
    const xm = (x1 + x2) / 2;
    return [
      {
        link,
        id: link.source + '>' + link.target,
        path: `M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2}`,
        width: Math.min(8, 1.5 + Math.log2(1 + link.count) * 1.25),
        dash: link.count ? undefined : '4 4',
        kind: from === 'outbound' ? 'node' : (outbounds.get(link.target)?.kind ?? 'group')
      }
    ];
  });
  return {
    width,
    height: layout.rows * PITCH - (PITCH - TILE),
    captions: [
      {stage: tree.by, label: t(tree.by === 'rule' ? 'flow.mapRule' : 'flow.stageClient'), style: column(tree.by)},
      {stage: 'outbound', label: t('flow.mapOutbound'), style: column('outbound')},
      {stage: 'node', label: t('flow.mapNode'), style: column('node')}
    ],
    placed,
    geometry
  };
}
