import type {Connection, Node} from '../../api/model';
import {healthMillis, preferredObservation} from '../../api/selectors';
import {percentile} from '../../ui/charts/layout';
import {compareNames} from '../../i18n/format';

export type NodeSample = {node: string; name: string; value: number; connections: number};

// Every node with a TCP data-path latency, once, fastest first, taken from the observation the Nodes page shows.
// Connections carry no latency, but when their chains name a leaf node, that node is in use and counts them; honk
// without flow recording sends empty chains, and then no node is marked. P50 and P90 count each node once; the
// weighted median counts each connection through a plotted node at its node's latency, and `unplaced` counts the
// connections whose node has none or is not listed. Null when the backend lists no nodes or no health samples.
export function pathLatency(rows: Array<Pick<Connection, 'chain'>>, nodes: Array<Pick<Node, 'id' | 'name' | 'health'>>) {
  if (!nodes.some(node => node.health?.length)) return null;
  const samples: NodeSample[] = [];
  let missing = 0;
  for (const node of nodes) {
    const value = healthMillis(preferredObservation(node.health ?? []));
    if (value === undefined) missing++;
    else samples.push({node: node.id, name: node.name, value, connections: 0});
  }
  samples.sort((a, b) => a.value - b.value || compareNames(a.name, b.name));
  const byId = new Map(samples.map(sample => [sample.node, sample]));
  const chains = rows.some(row => row.chain?.length);
  let unplaced = 0;
  for (const row of rows) {
    const leaf = row.chain?.at(-1);
    if (leaf === undefined) continue;
    const sample = byId.get(leaf);
    if (sample) sample.connections++;
    else unplaced++;
  }
  // Nearest rank over the connections, as `percentile` does over values.
  const connections = samples.reduce((sum, sample) => sum + sample.connections, 0);
  let seen = 0;
  const weighted = samples.find(sample => (seen += sample.connections) >= Math.max(1, Math.ceil(connections / 2)));
  const sorted = samples.map(sample => sample.value);
  return {
    samples,
    chains,
    missing,
    unplaced,
    used: samples.filter(sample => sample.connections).length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    weightedP50: connections ? weighted!.value : null
  };
}
export type PathLatency = NonNullable<ReturnType<typeof pathLatency>>;
