import type {Version, Capabilities, Runtime, NodeList, NodeQuery, Group, GroupSummary, ConnectionList, ConnectionQuery, FlowList, FlowDetail, FlowQuery, DnsCacheList, DnsCacheQuery, OperationAccepted, OperationState, EventOptions, MockHistory} from './model';

export interface Api {
  version(signal?: AbortSignal): Promise<Version>;
  capabilities(signal?: AbortSignal): Promise<Capabilities>;
  runtime(signal?: AbortSignal): Promise<Runtime>;
  nodes(query?: NodeQuery, signal?: AbortSignal): Promise<NodeList>;
  groups(signal?: AbortSignal): Promise<GroupSummary[]>;
  group(id: string, signal?: AbortSignal): Promise<Group>;
  connections(query?: ConnectionQuery, signal?: AbortSignal): Promise<ConnectionList>;
  flows(query?: FlowQuery, signal?: AbortSignal): Promise<FlowList>;
  flow(id: string, signal?: AbortSignal): Promise<FlowDetail>;
  dnsCache(query?: DnsCacheQuery, signal?: AbortSignal): Promise<DnsCacheList>;
  startReload(signal?: AbortSignal): Promise<OperationAccepted>;
  operation(id: string, signal?: AbortSignal): Promise<OperationState>;
  pollOperation(accepted: OperationAccepted, signal?: AbortSignal): Promise<OperationState>;
  /** Resolves when the stream ends or the signal aborts; reconnects on its own until then. */
  subscribeEvents(options: EventOptions): Promise<void>;
  /** Mock-only chart samples in KB/s; native servers have no history endpoint. */
  history(): MockHistory | null;
}
