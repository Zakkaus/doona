import type {
  Version,
  Capabilities,
  Runtime,
  RuntimeOutbounds,
  TrafficHistory,
  TrafficHistoryQuery,
  Datapath,
  DatapathDetail,
  RuntimeMemory,
  NodeList,
  NodeQuery,
  Group,
  GroupSummary,
  GroupSelectionRequest,
  GroupSelectionResult,
  JsonPatch,
  ProbeRequest,
  ConnectionList,
  ConnectionQuery,
  FlowList,
  FlowDetail,
  FlowQuery,
  DnsCacheList,
  DnsCacheQuery,
  DnsQueryResponse,
  DnsRecordType,
  DeleteCount,
  DeleteMatchingCount,
  OperationAccepted,
  OperationState,
  EventOptions
} from './model';
import type {RoutingTraceRequest, RoutingTraceResponse} from './model';
import type {components} from './types';

export interface Api {
  discovery(signal?: AbortSignal): Promise<components['schemas']['Discovery']>;
  version(signal?: AbortSignal): Promise<Version>;
  capabilities(signal?: AbortSignal): Promise<Capabilities>;
  runtime(signal?: AbortSignal): Promise<Runtime>;
  runtimeOutbounds(signal?: AbortSignal): Promise<RuntimeOutbounds>;
  trafficHistory(query?: TrafficHistoryQuery, signal?: AbortSignal): Promise<TrafficHistory>;
  datapath(detail?: DatapathDetail, signal?: AbortSignal): Promise<Datapath>;
  runtimeMemory(signal?: AbortSignal): Promise<RuntimeMemory>;
  nodes(query?: NodeQuery, signal?: AbortSignal): Promise<NodeList>;
  groups(signal?: AbortSignal): Promise<GroupSummary[]>;
  group(id: string, signal?: AbortSignal): Promise<Group>;
  selectGroup(groupId: string, selection: GroupSelectionRequest, signal?: AbortSignal): Promise<GroupSelectionResult>;
  patchGroup(groupId: string, ops: JsonPatch, ifMatch: string, signal?: AbortSignal): Promise<Group | OperationAccepted>;
  startProbe(request: ProbeRequest, signal?: AbortSignal): Promise<OperationAccepted>;
  connections(query?: ConnectionQuery, signal?: AbortSignal): Promise<ConnectionList>;
  flows(query?: FlowQuery, signal?: AbortSignal): Promise<FlowList>;
  flow(id: string, signal?: AbortSignal): Promise<FlowDetail>;
  dnsCache(query?: DnsCacheQuery, signal?: AbortSignal): Promise<DnsCacheList>;
  dnsQuery(domain: string, types: DnsRecordType[], signal?: AbortSignal): Promise<DnsQueryResponse>;
  deleteDnsEntry(entryId: string, signal?: AbortSignal): Promise<DeleteCount>;
  flushDnsCache(signal?: AbortSignal): Promise<DeleteMatchingCount>;
  routingTrace(request: RoutingTraceRequest, signal?: AbortSignal): Promise<RoutingTraceResponse>;
  startReload(signal?: AbortSignal): Promise<OperationAccepted>;
  startSuspend(signal?: AbortSignal): Promise<OperationAccepted>;
  startResume(signal?: AbortSignal): Promise<OperationAccepted>;
  operation(id: string, signal?: AbortSignal): Promise<OperationState>;
  pollOperation(accepted: OperationAccepted, signal?: AbortSignal): Promise<OperationState>;
  /** Resolves when the stream ends or the signal aborts; reconnects on its own until then. */
  subscribeEvents(options: EventOptions): Promise<void>;
  /** Mock-only generation dictionary; native servers have no rule-list endpoint. */
}
