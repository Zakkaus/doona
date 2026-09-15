import type {Connection, ConnectionList, FlowStep, Group, HealthObservation, Node, ProbeResult} from './model';
import {addU64, formatBytes, formatRate, pctU64} from './u64';

/** Prefer TCP data probes, then the newest observation with the same dimensions. */
export function preferredHealth(node: Node): HealthObservation | undefined {
  let best: HealthObservation | undefined, rank = -1;
  for (const observation of node.health) {
    const score = (observation.transport === 'tcp' ? 4 : 0) + (observation.purpose === 'data' ? 2 : 0) + (observation.sample_source === 'probe' ? 1 : 0);
    if (score > rank || (score === rank && observation.observed_at > (best?.observed_at ?? ''))) { best = observation; rank = score; }
  }
  return best;
}

export function outboundUsage(snapshot: ConnectionList) {
  const totals = new Map<string, bigint | null>();
  for (const connection of [...snapshot.tcp, ...snapshot.udp]) {
    const outbound = connection.outbound ?? '—';
    totals.set(outbound, addU64(totals.has(outbound) ? totals.get(outbound)! : 0n, connection.download_bytes));
  }
  const total = addU64(...totals.values());
  const rows = [...totals].map(([name, bytes]) => ({name, bytes, percent: pctU64(bytes, total)}));
  rows.sort((a, b) => a.bytes === b.bytes ? 0 : a.bytes === null ? 1 : b.bytes === null ? -1 : a.bytes > b.bytes ? -1 : 1);
  return {rows, total};
}

export const connectionStates: Record<Connection['state'], string> = {observed: '觀測中', routing: '路由中', dialing: '撥號中', active: '進行中', closed: '已關閉', blocked: '已封鎖', failed: '失敗', unknown: '未知'};
const relativeTime = new Intl.RelativeTimeFormat('zh-Hant', {numeric: 'auto'});
export function relativeStart(startedAt: string | null, now = Date.now()): string {
  if (!startedAt) return '—';
  const seconds = Math.floor((Date.parse(startedAt) - now) / 1000);
  if (!Number.isFinite(seconds)) return '—';
  if (Math.abs(seconds) < 60) return relativeTime.format(seconds, 'second');
  if (Math.abs(seconds) < 3600) return relativeTime.format(Math.trunc(seconds / 60), 'minute');
  if (Math.abs(seconds) < 86400) return relativeTime.format(Math.trunc(seconds / 3600), 'hour');
  return relativeTime.format(Math.trunc(seconds / 86400), 'day');
}

export function connectionRows(snapshot: ConnectionList | undefined) {
  return snapshot ? [...snapshot.tcp.map(c => ({...c, network: 'tcp'})), ...snapshot.udp.map(c => ({...c, network: 'udp'}))] : [];
}

export function connectionDetails(c: Connection): Array<[string, string]> {
  return [['來源', c.src ?? '—'], ['目標位址', c.dst ?? '—'], ['域名', c.domain ?? '—'], ['程序名稱', c.pname ?? '—'], ['觀測來源', c.observed_by], ['上傳', formatBytes(c.upload_bytes)], ['下載', formatBytes(c.download_bytes)], ['上傳速率', formatRate(c.upload_bytes_per_second)], ['下載速率', formatRate(c.download_bytes_per_second)], ['開始時間', c.started_at ?? '—']];
}

export function flowStepFields(step: FlowStep): Array<[string, string]> | null {
  const text = (value: unknown) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  switch (step.stage) {
    case 'input': return Object.entries(step.data.values).map(([key, value]) => [key, text(value)]);
    case 'route': return [['chain', step.data.chain], ['plane', step.data.plane], ['規則', step.data.rules.filter(rule => rule.result === 'matched').map(rule => rule.expression ?? rule.rule_id).join('；') || '—'], ['outbound', text(step.data.outbound)], ['must', text(step.data.must)]];
    case 'dial_mode': return [['撥號目標', step.data.configured + ' → ' + step.data.effective_target], ['verification', step.data.verification]];
    case 'dns': return [['name', step.data.name], ['source / cache', step.data.source + ' / ' + step.data.cache], ['upstream', text(step.data.upstream)], ['selected_ip', text(step.data.selected_ip)]];
    case 'outbound': return [['出站', text(step.data.routed_outbound) + ' → ' + text(step.data.effective_outbound)], ['選擇路徑', step.data.selection_path.map(p => p.group_id + ' → ' + text(p.member_id)).join('；') || '—'], ['leaf_node_id', text(step.data.leaf_node_id)], ['target', text(step.data.target)], ['status', step.data.status]];
    case 'connection': return [['狀態', connectionStates[step.data.state] ?? step.data.state], ['milestone', step.data.milestone], ['reason', step.data.reason]];
    case 'datapath': return [['plane', step.data.plane], ['action', step.data.action], ['reason', step.data.reason]];
    case 'reroute': return [['performed', text(step.data.performed)], ['reason', step.data.reason]];
    default: return null;
  }
}

export function groupConfigFields(group: Group): Array<[string, string]> {
  return Object.entries(group.config).filter(([, value]) => value !== null).map(([key, value]) => [key, String(value)]);
}

export function probeSummary(result: ProbeResult): string {
  const members = new Map<string, 'healthy' | 'unavailable' | 'unknown'>();
  for (const item of result.results) {
    const previous = members.get(item.member_id);
    if (previous !== 'unavailable' && (previous !== 'unknown' || item.state === 'unavailable')) members.set(item.member_id, item.state);
  }
  const states = [...members.values()];
  const unknown = states.filter(s => s === 'unknown').length;
  return states.filter(s => s === 'healthy').length + ' 個可用，' + states.filter(s => s === 'unavailable').length + ' 個無法使用' + (unknown ? '，' + unknown + ' 個狀態未知' : '') + '；' + (result.selection_changed.tcp || result.selection_changed.udp ? '選擇已變更' : '選擇未變更');
}
