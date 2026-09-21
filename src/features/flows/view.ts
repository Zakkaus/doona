import type {FlowStep} from '../../api/model';
import type {Key} from '../../i18n/messages';
import {connectionStates, type MessageRef} from '../../api/selectors';
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
export const traceGaps: Record<string, Key> = {
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

export function flowStepFields(step: FlowStep): Array<[Key | MessageRef, string | MessageRef]> | null {
  const text = (value: unknown) => (value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  switch (step.stage) {
    case 'input':
      return Object.entries(step.data.values)
        .filter(([, value]) => value != null && value !== '')
        .map(([name, value]) => {
          const label = inputLabels[name];
          const labelRef: Key | MessageRef =
            label === undefined || !label.includes('.') ? {key: 'flow.f.input', params: {name: label ?? name}} : (label as Key);
          return [labelRef, typeof value === 'string' ? word(value) : text(value)];
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
            .join(' · ') || '—'
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
