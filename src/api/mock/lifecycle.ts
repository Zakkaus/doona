import {uuid} from '../hash';
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
  eventsCapability: Capabilities['resources']['events'],
  runtime: Pick<Runtime, 'observed_at' | 'last_reload'>,
  logSettings: () => RuntimeSettings['log'],
  revision: () => string,
  trickleEvery = 2500
): MockLifecycle {
  const operations = new Map<string, OperationState>();
  let sequence = 0;
  const listeners = new Set<(event: ApiEvent) => void>();
  const history: ApiEvent[] = [];
  const cursors = new Map<string, {stream: 'events' | 'logs'; filter: string; position: number; issued: number}>();
  const cursorIds = new Map<string, string>();
  const pruneCursors = () => {
    while (history.length && Date.now() - Date.parse(history[0].data.observed_at) > eventsCapability.retention_seconds! * 1000) history.shift();
    const eventFloor = history.length ? Number(history[0].id.split(':')[1]) - 1 : sequence;
    const logFloor = logRing.length ? Number(logRing[0].id.split(':')[2]) - 1 : logSequence;
    for (const [id, cursor] of cursors) {
      if (
        cursor.position < (cursor.stream === 'events' ? eventFloor : logFloor) ||
        (cursor.stream === 'events' && Date.now() - cursor.issued > eventsCapability.retention_seconds! * 1000)
      ) {
        cursors.delete(id);
        cursorIds.delete(JSON.stringify([cursor.stream, cursor.filter, cursor.position]));
      }
    }
  };
  const issueCursor = (stream: 'events' | 'logs', filter: string, position: number) => {
    const key = JSON.stringify([stream, filter, position]);
    const previous = cursorIds.get(key);
    if (previous) return previous;
    const id = uuid();
    cursors.set(id, {stream, filter, position, issued: Date.now()});
    cursorIds.set(key, id);
    return id;
  };
  const resume = (id: string | undefined, stream: 'events' | 'logs', filter: string, baseline: number) => {
    if (id === undefined) return baseline;
    pruneCursors();
    const cursor = cursors.get(id);
    if (!cursor || cursor.stream !== stream || cursor.filter !== filter)
      throw new ApiError(409, 'event_cursor_expired', 'The stream cursor cannot be replayed');
    return cursor.position;
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  const eventData = () => ({instance_id: instanceId, observed_at: new Date().toISOString()});
  function publish(event: ApiEvent) {
    event.id = `${instanceId}:${++sequence}`;
    history.push(event);
    if (history.length > eventsCapability.max_buffered_events!) history.shift();
    pruneCursors();
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
          // An ApiError carries the operation error honk would set; anything else is a generic failure.
          error:
            error instanceof ApiError
              ? {code: error.code, message: error.message, details: error.details}
              : {code: 'operation_failed', message: error instanceof Error ? error.message : String(error)}
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
    pruneCursors();
  }
  const log = (level: LogRecord['level'], target: string, message: string, fields: LogRecord['fields'] = null, at = Date.now()) => {
    const record = {id: `${instanceId}:logs:${++logSequence}`, ts: new Date(at).toISOString(), level, target, message, fields};
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
  // A four-hour ring has routine traffic, busy periods and a short health-check incident.
  const started = Date.now();
  for (let minute = 240; minute > 0; minute -= 2) {
    const at = started - minute * 60000;
    const trouble = minute >= 34 && minute <= 48;
    const busy = (minute >= 72 && minute <= 116) || (minute >= 164 && minute <= 188);
    log('info', 'honk::group', 'Health check finished.', {group: 'resilient', healthy: trouble ? 2 : 3, unavailable: trouble ? 1 : 0}, at);
    log('debug', 'honk::dns', 'Upstream answered.', {upstream: 'tls://1.1.1.1:853', elapsed_ms: 12 + (minute % 9)}, at + 20000);
    if (minute % 6 === 0) log('trace', 'honk::datapath', 'Kernel map synced.', {entries: 4096 + minute}, at + 10000);
    if (minute % 14 === 0) log('warn', 'honk::subscription', 'Subscription served from cache.', {provider: 'sub-c', age_seconds: 1800}, at + 40000);
    if (busy) log('info', 'honk::dns', 'Query answered.', {queries: 12 + (minute % 15)}, at + 30000);
    if (trouble) {
      log('warn', 'honk::group', 'Health check slow.', {node: 'us-01', elapsed_ms: 2400}, at + 30000);
      log('error', 'honk::group', 'Health check failed.', {node: 'us-01', error: 'connect timeout'}, at + 50000);
    }
  }
  for (const record of logSeed) log(record.level, record.target, record.message, record.fields ?? null);
  for (let i = 28; i > 0; i--) {
    const data = {instance_id: instanceId, observed_at: new Date(started - i * 10000).toISOString()};
    if (i === 21) publish({id: '', event: 'generation.changed', data: {...data, previous_generation_id: '39', generation_id: '40'}});
    else if (i === 17)
      publish({id: '', event: 'operation.updated', data: {...data, resource_id: 'op-1182', status: 'succeeded', href: '/api/v1/operations/op-1182'}});
    else if (i === 7) publish({id: '', event: 'flow.gap', data: {...data, resource_id: null, reason: 'sampled', dropped_records: '3'}});
    else if (i === 6) publish({id: '', event: 'flow.gap', data: {...data, resource_id: null, reason: 'buffer_overflow', dropped_records: '12'}});
    else if (i === 5)
      publish({id: '', event: 'operation.updated', data: {...data, resource_id: 'op-1183', status: 'failed', href: '/api/v1/operations/op-1183'}});
    else if (i === 4) publish({id: '', event: 'flow.gap', data: {...data, resource_id: null, reason: 'recording_changed', dropped_records: '0'}});
    else if (i % 3 === 0)
      publish({
        id: '',
        event: 'flow.updated',
        data: {...data, resource_id: `flow-r${String(i).padStart(2, '0')}`, revision: 1, href: `/api/v1/flows/flow-r${String(i).padStart(2, '0')}`}
      });
    else publish({id: '', event: 'runtime.updated', data: {...data, href: '/api/v1/runtime'}});
  }
  let logTimer: ReturnType<typeof setInterval> | undefined;
  async function logs({level, target, lastEventId, signal, onRecord, onConnectionChange}: LogOptions): Promise<void> {
    if (signal?.aborted) return;
    if (!logsCapability.available) throw new ApiError(404, 'capability_not_supported', 'Logs are unavailable');
    if (level && !logsCapability.levels?.includes(level)) throw new ApiError(400, 'invalid_request', `Level ${level} is not advertised`);
    const floor = level ? levels.indexOf(level) : 0;
    const filter = JSON.stringify([level ?? null, target ?? null]);
    const emit = (record: LogRecord & {id: string}) => {
      if (levels.indexOf(record.level) >= floor && (!target || record.target.startsWith(target)))
        onRecord({...structuredClone(record), id: issueCursor('logs', filter, Number(record.id.split(':')[2]))});
    };
    const cursor = resume(lastEventId, 'logs', filter, 0);
    onConnectionChange?.(true);
    for (const record of logRing) if (Number(record.id.split(':')[2]) > cursor) emit(record);
    if (signal?.aborted) {
      onConnectionChange?.(false);
      return;
    }
    logListeners.add(emit);
    if (!logTimer) logTimer = setInterval(() => trickle[Math.floor(Math.random() * trickle.length)](), trickleEvery);
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
    if (!eventsCapability.available) throw new ApiError(404, 'capability_not_supported', 'Events are unavailable');
    const filter = JSON.stringify([...new Set(kinds ?? [])].sort());
    const emit = (event: ApiEvent) => {
      if (event.event === 'stream.ready' || !kinds?.length || kinds.includes(event.event))
        onEvent({...structuredClone(event), id: issueCursor('events', filter, Number(event.id.split(':')[1]))});
    };
    const cursor = resume(lastEventId, 'events', filter, 0);
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
