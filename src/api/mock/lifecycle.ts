import type {Api} from '../api';
import type {
  ApiEvent,
  Capabilities,
  EventOptions,
  LogOptions,
  LogRecord,
  Operation,
  OperationAccepted,
  OperationState,
  Runtime,
  RuntimeSettings
} from '../model';
import {ApiError} from '../error';
import {wait} from '../wait';
import {found} from './common';
import {instanceId} from './fixtures/clock';
import {logSeed} from './fixtures/lifecycle';

type LifecycleApi = Pick<Api, 'operation' | 'pollOperation' | 'subscribeEvents' | 'subscribeLogs'>;
export interface MockLifecycle {
  api: LifecycleApi;
  enqueue<K extends OperationAccepted['kind']>(kind: K, finish: () => Extract<Operation, {kind: K; status: 'succeeded'}>['result']): OperationAccepted;
  log(level: LogRecord['level'], target: string, message: string, fields?: LogRecord['fields']): void;
  publish(event: ApiEvent): void;
  eventData(): {instance_id: string; observed_at: string};
  trimLogs(): void;
  pending(kind: OperationAccepted['kind']): boolean;
}
export function createLifecycle(
  logsCapability: Capabilities['resources']['logs'],
  runtime: Pick<Runtime, 'observed_at' | 'last_reload'>,
  logSettings: () => RuntimeSettings['log'],
  revision: () => string
): MockLifecycle {
  const operations = new Map<string, OperationState>();
  let sequence = 0;
  const listeners = new Set<(event: ApiEvent) => void>();
  const history: ApiEvent[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  const eventData = () => ({instance_id: instanceId, observed_at: new Date().toISOString()});
  function publish(event: ApiEvent) {
    event.id = `${instanceId}:${++sequence}`;
    history.push(event);
    if (history.length > 1024) history.shift();
    listeners.forEach(listener => listener(event));
  }
  function runtimeUpdated() {
    runtime.observed_at = new Date().toISOString();
    publish({id: '', event: 'runtime.updated', data: {...eventData(), href: '/api/v1/runtime'}});
  }
  const enqueue: MockLifecycle['enqueue'] = (kind, finish) => {
    const operation_id = 'op-' + (operations.size + 1);
    const created_at = new Date().toISOString();
    const common = {operation_id, kind, created_at, started_at: created_at};
    operations.set(operation_id, {...common, finished_at: null, status: 'running', result: null, error: null, retryAfter: 1});
    publish({
      id: '',
      event: 'operation.updated',
      data: {...eventData(), resource_id: operation_id, status: 'running', href: '/api/v1/operations/' + operation_id}
    });
    setTimeout(() => {
      try {
        operations.set(operation_id, {...common, status: 'succeeded', result: finish(), error: null, finished_at: new Date().toISOString()} as OperationState);
      } catch (error) {
        operations.set(operation_id, {
          ...common,
          status: 'failed',
          finished_at: new Date().toISOString(),
          result: null,
          error: {code: 'operation_failed', message: error instanceof Error ? error.message : String(error)}
        } as OperationState);
      }
      const terminal = operations.get(operation_id)!;
      if (kind === 'reload' && (terminal.status === 'succeeded' || terminal.status === 'failed'))
        runtime.last_reload = {operation_id, status: terminal.status, finished_at: terminal.finished_at, error: terminal.error};
      publish({
        id: '',
        event: 'operation.updated',
        data: {...eventData(), resource_id: operation_id, status: terminal.status, href: '/api/v1/operations/' + operation_id}
      });
      runtimeUpdated();
    }, 1000);
    const href = '/api/v1/operations/' + operation_id;
    return {operation_id, kind, status: 'queued', href, retryAfter: 1};
  };
  const operation = async (id: string, signal?: AbortSignal): Promise<OperationState> => {
    signal?.throwIfAborted();
    return structuredClone(found(operations.get(id), 'Operation'));
  };
  // Keep a bounded replay ring fed by mock activity and quiet background records.
  const levels: LogRecord['level'][] = ['trace', 'debug', 'info', 'warn', 'error'];
  const logRing: Array<LogRecord & {id: string}> = [];
  const logListeners = new Set<(record: LogRecord & {id: string}) => void>();
  let logSequence = 0;
  function trimLogs() {
    const limit = logSettings().buffered_records;
    if (logRing.length > limit) logRing.splice(0, logRing.length - limit);
  }
  const log = (level: LogRecord['level'], target: string, message: string, fields: LogRecord['fields'] = null) => {
    const record = {id: `${instanceId}:logs:${++logSequence}`, ts: new Date().toISOString(), level, target, message, fields};
    logRing.push(record);
    trimLogs();
    logListeners.forEach(listener => listener(record));
  };
  const trickle = [
    () => log('info', 'honk::routing', 'Routing generation published.', {generation_id: revision()}),
    () => log('debug', 'honk::dns', 'Upstream answered.', {upstream: 'tls://1.1.1.1:853', elapsed_ms: 12}),
    () => log('info', 'honk::group', 'Health check finished.', {group: 'resilient', healthy: 3, unavailable: 0}),
    () => log('warn', 'honk::subscription', 'Subscription served from cache.', {provider: 'sub-c', age_seconds: 1800}),
    () => log('trace', 'honk::datapath', 'Kernel map synced.', {entries: 4096})
  ];
  for (const record of logSeed) log(record.level, record.target, record.message, record.fields ?? null);
  let logTimer: ReturnType<typeof setInterval> | undefined;
  async function logs({level, target, lastEventId, signal, onRecord, onConnectionChange}: LogOptions): Promise<void> {
    if (signal?.aborted) return;
    if (!logsCapability.available) throw new ApiError(404, 'capability_not_supported', 'Logs are unavailable');
    if (level && !logsCapability.levels?.includes(level)) throw new ApiError(400, 'invalid_request', `Level ${level} is not advertised`);
    const floor = level ? levels.indexOf(level) : 0;
    const emit = (record: LogRecord & {id: string}) => {
      if (levels.indexOf(record.level) >= floor && (!target || record.target.startsWith(target))) onRecord(structuredClone(record));
    };
    const cursor = lastEventId?.startsWith(instanceId + ':logs:') ? Number(lastEventId.split(':')[2]) : 0;
    onConnectionChange?.(true);
    for (const record of logRing) if (Number(record.id.split(':')[2]) > cursor) emit(record);
    logListeners.add(emit);
    if (!logTimer) logTimer = setInterval(() => trickle[Math.floor(Math.random() * trickle.length)](), 2500);
    await new Promise<void>(resolve => {
      signal?.addEventListener(
        'abort',
        () => {
          logListeners.delete(emit);
          if (!logListeners.size) {
            clearInterval(logTimer);
            logTimer = undefined;
          }
          onConnectionChange?.(false);
          resolve();
        },
        {once: true}
      );
    });
  }
  async function events({kinds, lastEventId, signal, onEvent, onConnectionChange}: EventOptions): Promise<void> {
    if (signal?.aborted) return;
    const emit = (event: ApiEvent) => {
      if (event.event === 'stream.ready' || !kinds?.length || kinds.includes(event.event)) onEvent(structuredClone(event));
    };
    const cursor = lastEventId?.startsWith(instanceId + ':') ? Number(lastEventId.split(':')[1]) : sequence;
    onConnectionChange?.(true);
    emit({id: `${instanceId}:${Number.isFinite(cursor) ? cursor : sequence}`, event: 'stream.ready', data: eventData()});
    for (const event of history) if (Number(event.id.split(':')[1]) > cursor) emit(event);
    if (signal?.aborted) {
      onConnectionChange?.(false);
      return;
    }
    listeners.add(emit);
    if (!timer) timer = setInterval(runtimeUpdated, 5000);
    await new Promise<void>(resolve => {
      signal?.addEventListener(
        'abort',
        () => {
          listeners.delete(emit);
          if (!listeners.size) {
            clearInterval(timer);
            timer = undefined;
          }
          onConnectionChange?.(false);
          resolve();
        },
        {once: true}
      );
    });
  }
  const api: LifecycleApi = {
    operation,
    pollOperation: async (accepted: OperationAccepted, signal?: AbortSignal) => {
      let delay = accepted.retryAfter;
      while (true) {
        await wait(delay, signal);
        const current = await operation(accepted.href.split('/').pop()!, signal);
        if (current.status === 'succeeded' || current.status === 'failed') return current;
        delay = current.retryAfter ?? 1;
      }
    },
    subscribeEvents: events,
    subscribeLogs: logs
  };
  return {
    api,
    enqueue,
    log,
    publish,
    eventData,
    trimLogs,
    pending: (kind: OperationAccepted['kind']) => [...operations.values()].some(op => op.kind === kind && (op.status === 'queued' || op.status === 'running'))
  };
}
