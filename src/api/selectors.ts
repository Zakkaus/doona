import type {ConnectionList, HealthObservation, Node} from './model';
import {addU64, pctU64} from './u64';

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
