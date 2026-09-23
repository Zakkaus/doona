import type {Connection} from '../../api/model';

export type TrafficPoint = {id: string; up: number; down: number; name: string};
export type TrafficSeries = {outbound: string | null; points: TrafficPoint[]};

// Upload against download per connection, one series per outbound in name order so colours stay put between
// polls. Connections without byte totals cannot be placed and are counted instead; zero is a real value.
export function trafficSeries(rows: Array<Pick<Connection, 'id' | 'outbound' | 'upload_bytes' | 'download_bytes' | 'domain' | 'dst'>>) {
  const byOutbound = new Map<string | null, TrafficPoint[]>();
  let unknown = 0;
  for (const row of rows) {
    if (row.upload_bytes === null || row.download_bytes === null) {
      unknown++;
      continue;
    }
    const point = {id: row.id, up: Number(row.upload_bytes), down: Number(row.download_bytes), name: row.domain || row.dst || row.id};
    byOutbound.set(row.outbound, [...(byOutbound.get(row.outbound) ?? []), point]);
  }
  const series: TrafficSeries[] = [...byOutbound]
    .map(([outbound, points]) => ({outbound, points}))
    .sort((a, b) => (a.outbound ?? '').localeCompare(b.outbound ?? ''));
  // Totals are compared exactly: past 2^53 bytes two different totals can be the same Number.
  let heaviest: (TrafficPoint & {outbound: string | null}) | undefined;
  let most = -1n;
  for (const row of rows) {
    if (row.upload_bytes === null || row.download_bytes === null) continue;
    const total = BigInt(row.upload_bytes) + BigInt(row.download_bytes);
    if (total > most) {
      most = total;
      heaviest = {id: row.id, up: Number(row.upload_bytes), down: Number(row.download_bytes), name: row.domain || row.dst || row.id, outbound: row.outbound};
    }
  }
  return {series, unknown, heaviest, placed: rows.length - unknown};
}
