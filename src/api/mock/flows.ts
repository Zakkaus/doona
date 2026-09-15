import type {Connection, FlowDetail, FlowStep} from '../model';
import {connections, instanceId, observedAt} from './fixtures';

function flow(connection: Connection, network: 'tcp' | 'udp'): FlowDetail {
  const input: FlowDetail['input'] = {src: connection.src ?? null, dst: connection.dst ?? null, domain: connection.domain ?? null, domain_source: connection.domain ? 'dns_mapping' : null, pid: null, process_path: null, src_mac: null, ingress: 'lan', domain_rule_ids: null, dscp: 0, mark: 0};
  const common = {observed_at: observedAt, elapsed_us: 0, generation_id: '40', evidence: 'observed' as const};
  const direct = connection.outbound === 'direct';
  const steps: FlowStep[] = [
    {...common, seq: 1, stage: 'input', data: {values: {...input, pname: connection.pname}, source: 'socket'}},
    {...common, seq: 2, stage: 'route', data: {evaluation_id: 'eval-1', chain: 'traffic', plane: direct ? 'kernel' : 'userspace', rule_id: null, rules: [], outbound: connection.outbound, must: false, mark: 0, input: null, dns_action: null}},
    {...common, seq: 3, stage: 'datapath', data: {plane: direct ? 'kernel' : 'userspace', action: direct ? 'activate_direct' : 'redirect', reason: 'route_selected', error: null}},
    {...common, seq: 4, stage: 'dial_mode', data: {configured: 'domain', effective_target: input.domain ? 'domain' : 'ip', domain: input.domain, domain_source: input.domain_source, verification: 'not_required', reason: 'configured_mode'}},
    {...common, seq: 5, stage: 'dns', data: {lookup_id: 'lookup-1', parent_lookup_id: null, attempt_id: null, purpose: 'dial_target', name: input.domain ?? 'one.one.one.one.', qtype: 'A', source: 'cache', upstream_transport: null, carrier_transport: null, cache: 'hit', cache_entry_id: connection.id === '1' ? 'c1' : connection.id === '2' ? 'c2' : null, upstream: null, route_evaluation_ids: [], status: 'NOERROR', addresses: [connection.dst!.split(':')[0]], selected_ip: connection.dst!.split(':')[0], error: null}},
    {...common, seq: 6, stage: 'reroute', data: {performed: false, reason: 'no_new_routing_input', from_evaluation_id: 'eval-1', to_evaluation_id: null}},
    {...common, seq: 7, stage: 'outbound', data: {attempt_id: 'attempt-1', parent_attempt_id: null, kind: 'leaf', evaluation_id: 'eval-1', routing_source: 'evaluation', routed_outbound: connection.outbound, effective_outbound: connection.outbound, mode_override: 'none', selection_path: direct ? [] : [{group_id: 'proxy', member_id: 'hk-01', policy: 'selector', reason: 'runtime_selection', selection: null}], leaf_node_id: direct ? null : 'hk-01', target: connection.dst ?? null, target_kind: 'ip', dial_ip: connection.dst!.split(':')[0], server_addr: direct ? null : '198.51.100.1:443', resolution_location: 'original_ip', status: 'succeeded', error: null}},
    {...common, seq: 8, stage: 'connection', data: {state: 'active', reason: 'reply_received', milestone: 'first_reply', attempt_id: 'attempt-1', reply_received: true, error: null}}
  ];
  return {id: 'flow-' + connection.id, instance_id: instanceId, revision: 1, network, state: connection.state, pname: connection.pname, connection_id: connection.id, outbound: connection.outbound, observed_by: connection.observed_by, started_at: observedAt, ended_at: null, trace_status: 'partial', input, trace: {status: 'partial', missing: ['not_instrumented'], steps}};
}
export const flows = [flow(connections.tcp[0], 'tcp'), flow(connections.tcp[1], 'tcp'), flow(connections.udp[0], 'udp')];
