import type {Node} from '../../../src/api/model';
import {supportsNodeProbe} from '../../../src/dae/probes';
import {probeIpVersion, type Connection} from './api';
import {finished, settle} from './operations';

type Result = number | 'timeout' | 'failed';
export function createNodeProbes(connection: Connection) {
  const {
    api,
    capabilities: {resources}
  } = connection;
  const ipVersion = probeIpVersion(connection.capabilities);
  const available = !!(
    ipVersion &&
    resources.probes.available &&
    resources.operations.available &&
    resources.probes.targets?.includes('node') &&
    resources.probes.kinds?.includes('http') &&
    resources.probes.transports?.includes('tcp')
  );
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => {
    version++;
    listeners.forEach(listener => listener());
  };
  const store = {
    available,
    active: true,
    supports: (node: Node) => available && supportsNodeProbe(node.protocol, 'http', ['tcp']),
    results: new Map<string, Result>(),
    summaries: new Map<string, {answered: number; total: number; unsupported: number}>(),
    running: null as string | null,
    error: undefined as unknown,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => version,
    async run(nodes: Node[], key = 'nodes') {
      if (store.running || !available) return;
      store.running = key;
      store.error = undefined;
      for (const node of nodes) store.results.delete(node.id);
      store.summaries.delete(key);
      emit();
      let answered = 0;
      let unsupported = 0;
      try {
        let next = 0;
        const worker = async () => {
          while (next < nodes.length && store.active) {
            const node = nodes[next++];
            if (!store.supports(node)) {
              unsupported++;
              continue;
            }
            try {
              const result = finished(
                await settle(
                  api,
                  await api.startProbe({
                    target: {type: 'node', node_id: node.id},
                    kind: 'http',
                    transport: ['tcp'],
                    ip_version: ipVersion,
                    warmth: 'cold'
                  })
                ),
                'probe'
              );
              const observations =
                result?.results.filter(item => item.transport === 'tcp' && (item.member_id === node.id || item.resolved_leaf_node_id === node.id)) ?? [];
              const observation = observations.find(item => item.state === 'healthy' && item.latency_ms !== null) ?? observations[0];
              if (observation?.state === 'healthy' && observation.latency_ms !== null) {
                store.results.set(node.id, observation.latency_ms);
                answered++;
              } else store.results.set(node.id, observation?.state === 'unavailable' ? 'timeout' : 'failed');
            } catch (error) {
              store.results.set(node.id, 'failed');
              store.error = error;
            }
            emit();
          }
        };
        await Promise.all(Array.from({length: Math.min(3, resources.probes.limits?.max_active_jobs ?? 1)}, worker));
        store.summaries.set(key, {answered, total: nodes.length, unsupported});
      } finally {
        store.running = null;
        emit();
      }
    }
  };
  return store;
}
