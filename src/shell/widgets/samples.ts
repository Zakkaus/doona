import type {CpuSample} from '../../features/shared/widgetSeries';
import type {ApiEvent} from '../../api/model';
const now = Date.now();
export const sampleCpu: CpuSample[] = [12, 18, 15, 27, 22, 19, 24].map((value, i) => ({time: now - (6 - i) * 10000, value}));
const sampleNotices: ApiEvent[] = [{id: 'sample-ready', event: 'stream.ready', data: {instance_id: 'sample-engine', observed_at: new Date(now).toISOString()}}];

async function createSamples() {
  const {createMockApi} = await import('../../../mock');
  const api = createMockApi({isolated: true});
  const [
    capabilities,
    runtime,
    runtimeMemory,
    runtimeOutbounds,
    datapath,
    nodes,
    groups,
    providers,
    connections,
    dnsLog,
    config,
    trafficHistory,
    memoryHistory
  ] = await Promise.all([
    api.capabilities(),
    api.runtime(),
    api.runtimeMemory(),
    api.runtimeOutbounds(),
    api.datapath(),
    api.nodes({limit: 8}),
    api.groups(),
    api.providers(),
    api.connections({detail: 'full', limit: 1000}),
    api.dnsLog({limit: 4}),
    api.config(),
    api.trafficHistory({window_seconds: 120}),
    api.memoryHistory({window_seconds: 120})
  ]);
  const group = await api.group(groups[0].id);
  return {
    capabilities,
    runtime,
    runtimeMemory,
    runtimeOutbounds,
    datapath,
    nodes: nodes.nodes,
    groups,
    providers,
    connections,
    dnsLog,
    config,
    trafficHistory,
    memoryHistory,
    group,
    notices: sampleNotices
  };
}
export type PreviewSamples = Awaited<ReturnType<typeof createSamples>>;
let pending: Promise<PreviewSamples> | undefined;
export const loadSamples = () => (pending ??= createSamples());
