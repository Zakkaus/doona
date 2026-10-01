import type {GroupSummary, Node} from '../../api/model';
import {preferredHealth} from '../../api/selectors';
import {percentile} from '../../ui/charts/layout';
import {compareNames} from '../../i18n/format';

export type LatencyBy = 'group' | 'protocol';
export type LatencyRow = {id: string; name: string; latest: number; moving: number | null; avg10: number | null};
export type LatencyMissing = {id: string; name: string; state: 'unavailable' | 'unmeasured'};
export type LatencyGroup = {id: string; label: string | null; rows: LatencyRow[]; missing: LatencyMissing[]};

// Each node's latest latency and its two averages, from the same preferred observation the node table shows,
// grouped by policy group (a node in several groups appears in each) or by protocol; fastest first.
export function latencyGroups(nodes: Node[], groups: GroupSummary[] | undefined, by: LatencyBy, locale: string): LatencyGroup[] {
  const byName = compareNames(locale);
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
    group.rows.sort((a, b) => a.latest - b.latest || byName(a.name, b.name));
    group.missing.sort((a, b) => byName(a.name, b.name));
  }
  // Named groups in name order; the unnamed bucket (no group, unknown protocol) last.
  return list.sort((a, b) => (a.label === null ? 1 : 0) - (b.label === null ? 1 : 0) || byName(a.label ?? '', b.label ?? ''));
}

// A node is slower than usual when its latest latency passes the higher average by this ratio and these milliseconds.
export const slowerThanUsual = {ratio: 1.3, ms: 20};

// The range a node's two averages span, a single value when only one is reported, null with none.
export function usualRange(row: LatencyRow): [number, number] | null {
  const averages = [row.moving, row.avg10].filter((value): value is number => value !== null);
  return averages.length ? [Math.min(...averages), Math.max(...averages)] : null;
}

// The ring: the 10-sample average, or the moving one when only that is reported.
export function latencyAverage(row: LatencyRow): number | null {
  return row.avg10 ?? row.moving;
}

// The line: from the least to the greatest of the latest value and the averages, null without an average to join.
export function latencyRange(row: LatencyRow): [number, number] | null {
  if (row.moving === null && row.avg10 === null) return null;
  const values = [row.latest, row.moving, row.avg10].filter((value): value is number => value !== null);
  return [Math.min(...values), Math.max(...values)];
}

export function isSlowerThanUsual(row: LatencyRow): boolean {
  const range = usualRange(row);
  return range !== null && row.latest > range[1] * slowerThanUsual.ratio && row.latest - range[1] >= slowerThanUsual.ms;
}

// Which averages the backend reports. honk leaves both null on an unavailable row and on a backend without them,
// so a chart names only the ones some row has.
export function latencyAverages(groups: LatencyGroup[]) {
  const rows = groups.flatMap(group => group.rows);
  return {moving: rows.some(row => row.moving !== null), avg10: rows.some(row => row.avg10 !== null)};
}

// The axis end: past most of the values rather than the single slowest, so one outlier does not push every other
// node to the left edge; values beyond it are drawn on the edge with their number.
export function latencyMax(groups: LatencyGroup[]): number {
  const values = groups.flatMap(group => group.rows.flatMap(row => [row.latest, row.moving ?? row.latest, row.avg10 ?? row.latest])).sort((a, b) => a - b);
  const top = Math.max(10, (percentile(values, 90) ?? 0) * 1.25);
  const step = top <= 100 ? 20 : top <= 500 ? 100 : top <= 2000 ? 500 : 1000;
  return Math.ceil(top / step) * step;
}
