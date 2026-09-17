import type {components, operations} from './types';

type Schema = components['schemas'];
export type Version = Schema['Version'];
export type Capabilities = Schema['Capabilities'];
export type Runtime = Schema['Runtime'];
export type RuntimeOutbounds = Schema['RuntimeOutbounds'];
export type TrafficHistory = Schema['TrafficHistory'];
export type TrafficHistoryQuery = operations['getTrafficHistory']['parameters']['query'];
export type MemoryHistory = Schema['MemoryHistory'];
export type MemoryHistoryQuery = operations['getMemoryHistory']['parameters']['query'];
export type Datapath = Schema['Datapath'];
export type DatapathDetail = components['parameters']['Detail'];
export type RuntimeMemory = Schema['RuntimeMemory'];
export type Node = Schema['Node'];
export type NodeList = Schema['NodeList'];
export type HealthObservation = Schema['HealthObservation'];
export type Group = Schema['Group'];
export type GroupSummary = Schema['GroupSummary'];
export type GroupSelectionRequest = Schema['GroupSelectionRequest'];
export type GroupSelectionResult = Schema['GroupSelectionResult'];
export type JsonPatch = Schema['JsonPatch'];
export type ProbeRequest = Schema['ProbeRequest'];
export type ProbeResult = Schema['ProbeResult'];
export type Connection = Schema['Connection'];
export type ConnectionList = Schema['ConnectionList'];
export type FlowSummary = Schema['FlowSummary'];
export type FlowDetail = Schema['FlowDetail'];
export type FlowList = Schema['FlowList'];
export type FlowStep = Schema['FlowStep'];
export type DnsCacheList = Schema['DnsCacheList'];
export type DnsQueryResponse = Schema['DnsQueryResponse'];
export type DnsRecordType = Schema['DnsRecordType'];
export type DeleteCount = Schema['DeleteCount'];
// The generator flattens RoutingTraceInput.anyOf; retain its required common fields.
export type RoutingTraceInput = Extract<Schema['RoutingTraceInput'], {network: unknown}> & ({domain: string} | {dst_ip: string});
export type RoutingTraceRequest = Omit<Schema['RoutingTraceRequest'], 'input'> & {input: RoutingTraceInput};
export type RoutingTraceResponse = Schema['RoutingTraceResponse'];
export type DeleteMatchingCount = Schema['DeleteMatchingCount'];
export type ErrorResponse = Schema['ErrorResponse'];
export type OperationAccepted = Schema['OperationAccepted'] & {location: string; retryAfter: number};
// The generator narrows the open OperationCommon.result object to Record<string, never>.
type SucceededOperation<K extends Schema['OperationKind'], R> = Omit<Schema['OperationCommon'], 'kind' | 'status' | 'result' | 'error'> & {
  kind: K;
  status: 'succeeded';
  result: R;
  error: null;
};
export type Operation =
  | Schema['QueuedOperation']
  | Schema['RunningOperation']
  | Schema['FailedOperation']
  | SucceededOperation<'reload', Schema['ReloadResult']>
  | SucceededOperation<'probe', Schema['ProbeResult']>
  | SucceededOperation<'group_update', Schema['GroupUpdateResult']>
  | SucceededOperation<'provider_refresh', Schema['Provider']>
  | SucceededOperation<'suspend', {runtime_state: 'suspended' | null}>
  | SucceededOperation<'resume', {runtime_state: 'running' | null}>;
export type OperationState = Operation & {retryAfter?: number};
export type NodeQuery = operations['listNodes']['parameters']['query'];
export type ConnectionQuery = operations['listConnections']['parameters']['query'];
export type FlowQuery = operations['listFlows']['parameters']['query'];
export type DnsCacheQuery = operations['listDnsCache']['parameters']['query'];
export type DnsLogList = Schema['DnsLogList'];
export type DnsLogRecord = Schema['DnsLogRecord'];
export type DnsLogQuery = operations['listDnsLog']['parameters']['query'];
export type RuntimeSettings = Schema['RuntimeSettings'];
export type RuntimeMode = Schema['RuntimeMode'];
export type RuntimeModeRequest = Schema['RuntimeModeRequest'];
export type Provider = Schema['Provider'];
export type ProviderList = Schema['ProviderList'];
export type EffectiveConfig = Schema['EffectiveConfig'];
export type ConfigSource = Schema['ConfigSource'];
export type ConfigDiagnostic = Schema['ConfigDiagnostic'];
export type ConfigValidationRequest = Schema['ConfigValidationRequest'];
export type ConfigValidationResult = Schema['ConfigValidationResult'];
export type RuntimeSettingsPatch = Schema['RuntimeSettingsPatch'];
export type RuntimeSettingField = Schema['RuntimeSettingField'];
export type EventKind = Schema['EventKind'];
type EventData = {
  'stream.ready': Schema['StreamReadyEvent'];
  'runtime.updated': Schema['RuntimeUpdatedEvent'];
  'flow.updated': Schema['FlowUpdatedEvent'];
  'flow.gap': Schema['FlowGapEvent'];
  'operation.updated': Schema['OperationUpdatedEvent'];
  'generation.changed': Schema['GenerationChangedEvent'];
};
export type ApiEvent = {[K in EventKind]: {id: string; event: K; data: EventData[K]}}[EventKind];
export type LogRecord = Schema['LogRecord'];
export type LogLevel = Schema['LogLevel'];
export type LogOptions = {
  level?: LogLevel;
  target?: string;
  lastEventId?: string;
  signal?: AbortSignal;
  onRecord: (record: LogRecord & {id: string}) => void;
  onConnectionChange?: (connected: boolean) => void;
};
export type EventOptions = {
  kinds?: EventKind[];
  lastEventId?: string;
  signal?: AbortSignal;
  onEvent: (event: ApiEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
};
