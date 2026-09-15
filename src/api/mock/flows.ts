import type {Connection, FlowDetail, FlowStep} from '../model';
import {connections, instanceId, observedAt} from './fixtures';

function flow(connection: Connection, network: 'tcp' | 'udp'): FlowDetail {
  const input: FlowDetail['input'] = {src: connection.src ?? null, dst: connection.dst ?? null, domain: connection.domain ?? null, domain_source: connection.domain ? 'dns_mapping' : null, pid: null, process_path: null, src_mac: null, ingress: 'lan', domain_rule_ids: null, dscp: 0, mark: 0};
  const common = {observed_at: observedAt, elapsed_us: 0, generation_id: '40', evidence: 'observed' as const};
  const direct = connection.outbound === 'direct';
  const blocked = connection.state === 'blocked';
  const expression = blocked ? 'domain(suffix: doubleclick.net)' : direct ? 'dip(geoip:cn)' : 'domain(suffix: telegram.org)';
  const steps: FlowStep[] = [
    {...common, seq: 1, stage: 'input', data: {values: {...input, pname: connection.pname}, source: direct || blocked ? 'kernel' : 'socket'}},
    {...common, seq: 2, stage: 'route', data: {evaluation_id: 'eval-1', chain: 'traffic', plane: direct || blocked ? 'kernel' : 'userspace', rule_id: 'rule-1', rules: [{rule_id: 'rule-1', expression, result: 'matched', conditions: [], missing_inputs: []}], outbound: connection.outbound, must: blocked, mark: 0, input: null, dns_action: null}},
    {...common, seq: 3, stage: 'datapath', data: {plane: direct || blocked ? 'kernel' : 'userspace', action: blocked ? 'drop' : direct ? 'activate_direct' : 'redirect', reason: 'route_selected', error: null}}
  ];
  if (!direct && !blocked) steps.push(
    {...common, seq: 4, stage: 'dial_mode', data: {configured: 'domain', effective_target: 'domain', domain: input.domain, domain_source: input.domain_source, verification: 'matched', reason: 'dns_mapping_matches'}},
    {...common, seq: 5, stage: 'dns', data: {lookup_id: 'lookup-1', parent_lookup_id: null, attempt_id: null, purpose: 'dial_target', name: input.domain!, qtype: 'A', source: 'cache', upstream_transport: null, carrier_transport: null, cache: 'hit', cache_entry_id: 'c1', upstream: null, route_evaluation_ids: [], status: 'NOERROR', addresses: ['149.154.167.220'], selected_ip: '149.154.167.220', error: null}},
    {...common, seq: 6, stage: 'reroute', data: {performed: false, reason: 'no_new_routing_input', from_evaluation_id: 'eval-1', to_evaluation_id: null}},
    {...common, seq: 7, stage: 'outbound', data: {attempt_id: 'attempt-1', parent_attempt_id: null, kind: 'leaf', evaluation_id: 'eval-1', routing_source: 'evaluation', routed_outbound: connection.outbound, effective_outbound: connection.outbound, mode_override: 'none', selection_path: [{group_id: 'proxy', member_id: 'hk-01', policy: 'selector', reason: 'runtime_selection', selection: null}], leaf_node_id: 'hk-01', target: input.domain + ':443', target_kind: 'domain', dial_ip: '149.154.167.220', server_addr: '198.51.100.1:443', resolution_location: 'local_dns', status: 'succeeded', error: null}}
  );
  if (!blocked) steps.push({...common, seq: steps.length + 1, stage: 'connection', data: {state: 'active', reason: 'reply_received', milestone: 'first_reply', attempt_id: direct ? null : 'attempt-1', reply_received: true, error: null}});
  const timed = steps.map((step, i) => ({...step, elapsed_us: i * 1200, observed_at: new Date(Date.parse(connection.started_at ?? observedAt) + i * 1.2).toISOString()}));
  const summary = {id: blocked ? 'flow-blocked' : 'flow-' + connection.id, instance_id: instanceId, revision: 1, network, state: connection.state, pname: connection.pname, connection_id: blocked ? null : connection.id, outbound: connection.outbound, observed_by: connection.observed_by, started_at: connection.started_at, ended_at: blocked ? timed[timed.length - 1].observed_at : null, input};
  return direct
    ? {...summary, trace_status: 'partial', trace: {status: 'partial', missing: ['not_instrumented'], steps: timed}}
    : {...summary, trace_status: 'complete', trace: {status: 'complete', missing: [], steps: timed}};
}
export const flows = [flow(connections.tcp[0], 'tcp'), flow(connections.tcp[1], 'tcp'), flow(connections.udp[0], 'udp'), flow(connections.tcp[3], 'tcp')];
