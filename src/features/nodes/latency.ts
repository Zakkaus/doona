import type {GroupSummary, Node} from '../../api/model';
import {preferredHealth} from '../../api/selectors';

export type LatencyBy = 'group' | 'protocol';
export type LatencyRow = {id: string; name: string; latest: number; moving: number | null; avg10: number | null};
export type LatencyMissing = {id: string; name: string; state: 'unavailable' | 'unmeasured'};
export type LatencyGroup = {id: string; label: string | null; rows: LatencyRow[]; missing: LatencyMissing[]};

// Each node's latest latency and its two averages, from the same preferred observation the node table shows,
// grouped by policy group (a node in several groups appears in each) or by protocol; fastest first.
export function latencyGroups(nodes: Node[], groups: GroupSummary[] | undefined, by: LatencyBy): LatencyGroup[] {
  const names = new Map((groups ?? []).map(group => [group.id, group.name]));
  const buckets = new Map<string, LatencyGroup>();
  const bucket = (id: string, label: string | null) => {
    let found = buckets.get(id);
    if (!found) buckets.set(id, (found = {id, label, rows: [], missing: []}));
    return found;
  };
  for (const node of nodes) {
    const health = preferredHealth(node);
    const keys: Array<[string, string | null]> =
      by === 'protocol'
        ? [['protocol:' + (node.protocol ?? ''), node.protocol ?? null]]
        : node.group_ids.length
          ? node.group_ids.map(id => ['group:' + id, names.get(id) ?? id])
          : [['group:', null]];
    for (const [id, label] of keys) {
      const target = bucket(id, label);
      if (health?.state === 'healthy' && health.latency_ms !== null)
        target.rows.push({id: node.id, name: node.name, latest: health.latency_ms, moving: health.moving_avg_ms, avg10: health.avg10_ms});
      else target.missing.push({id: node.id, name: node.name, state: health?.state === 'unavailable' ? 'unavailable' : 'unmeasured'});
    }
  }
  const list = [...buckets.values()];
  for (const group of list) {
    group.rows.sort((a, b) => a.latest - b.latest || a.name.localeCompare(b.name));
    group.missing.sort((a, b) => a.name.localeCompare(b.name));
  }
  // Named groups in name order; the unnamed bucket (no group, unknown protocol) last.
  return list.sort((a, b) => (a.label === null ? 1 : 0) - (b.label === null ? 1 : 0) || (a.label ?? '').localeCompare(b.label ?? ''));
}

// The axis end: the greatest value drawn, rounded up to a readable step.
export function latencyMax(groups: LatencyGroup[]): number {
  const values = groups.flatMap(group => group.rows.flatMap(row => [row.latest, row.moving ?? 0, row.avg10 ?? 0]));
  const top = Math.max(10, ...values);
  const step = top <= 100 ? 20 : top <= 500 ? 100 : top <= 2000 ? 500 : 1000;
  return Math.ceil(top / step) * step;
}
