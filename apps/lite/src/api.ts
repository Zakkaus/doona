import {rememberCount} from './ui/useExpectedCount';
import {invalidateReads} from './state';
import type {Api} from '../../../src/api/api';
import type {Capabilities, ConfigSource, Group, GroupSummary, GroupSelectionRequest, ProbeRequest, Provider} from '../../../src/api/model';
import {createApi} from '../../../src/api/client';
import {DEMO_ACCOUNT, openSession} from '../../../src/api/auth';
import {DEMO_API, normalizeApi} from '../../../src/api/profiles';
import {ApiError, LocalError} from '../../../src/api/error';
import {sha256} from '../../../src/api/hash';
import {activationError, etag, finished, readBackUnconfirmed, settle} from './operations';
import type {MessageKey} from './i18n';
import {validateContent} from './config';
import {clearConnection, writeConnection} from './connectionStore';

export type Connection = {api: Api; capabilities: Capabilities; address: string};
export class LiteError extends Error {
  constructor(
    public key: MessageKey,
    public detail?: string
  ) {
    super(key);
  }
}

export async function connect(address: string, token: string): Promise<Connection> {
  let normalized: string;
  try {
    normalized = normalizeApi(address);
    if (!normalized) throw new Error();
  } catch {
    throw new LiteError('invalidUrl');
  }
  let api: Api;
  if (normalized === DEMO_API) {
    const session = await openSession(DEMO_API, 'login', DEMO_ACCOUNT);
    token = session.token;
    api = await (await import('./demo/createMockApi')).createMockApi({signIn: true, session: token});
  } else api = createApi(normalized, token || undefined);
  const capabilities = await api.capabilities().catch(error => {
    if (error instanceof ApiError && error.status === 404) throw new LiteError('login.noApi');
    throw error;
  });
  try {
    if (import.meta.env.VITE_LITE_DEMO !== '1') writeConnection({address: normalized, token});
  } catch {
    throw new LiteError('connectionSaveError');
  }
  let ended = false;
  const guarded = new Proxy(api, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (typeof method !== 'function') return method;
      return (...args: unknown[]) => {
        const result: unknown = method.apply(target, args);
        if (!(result instanceof Promise)) return result;
        return result.catch((error: unknown) => {
          if (!ended && error instanceof ApiError && error.status === 401) {
            ended = true;
            try {
              clearConnection({address: normalized, token});
            } finally {
              window.dispatchEvent(new CustomEvent('lite-session-ended', {detail: connection}));
            }
          }
          throw error;
        });
      };
    }
  });
  const connection = {api: guarded, capabilities, address: normalized};
  return connection;
}

const groupSummaries = new WeakMap<Api, GroupSummary[]>();
export const groupSnapshot = (api: Api) => groupSummaries.get(api);

export async function readGroups(api: Api, signal?: AbortSignal): Promise<Group[]> {
  const summaries = await api.groups(signal);
  groupSummaries.set(api, summaries);
  rememberCount(api, 'groups', summaries.length);
  return Promise.all(summaries.map(group => api.group(group.id, signal)));
}

const providerSnapshots = new WeakMap<Api, Provider[]>();
export const providerSnapshot = (api: Api) => providerSnapshots.get(api);

export async function readProviders(api: Api, signal?: AbortSignal): Promise<Provider[]> {
  const all: Provider[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.providers({cursor}, signal);
    all.push(...page.providers);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  providerSnapshots.set(api, all);
  return all;
}

export async function selectMember(api: Api, group: Group, member_id: string, network: GroupSelectionRequest['network'], reread: () => Promise<unknown>) {
  const result = await api.selectGroup(group.id, {member_id, network}).catch(readBackUnconfirmed(reread));
  await reread().catch(() => {});
  return result.source === 'override' ? 'pinned' : result.connections_interrupted ? 'selectedInterrupted' : 'selected';
}

export function probeIpVersion({resources}: Capabilities): ProbeRequest['ip_version'] | undefined {
  const versions = resources.probes.ip_versions ?? [];
  return versions.includes('ipv4') && versions.includes('ipv6') ? 'any' : versions[0];
}

// Members per group probe job: 'any' answers twice per member, and both declared limits bound one job.
export function groupProbeSize(capabilities: Capabilities) {
  const ipVersion = probeIpVersion(capabilities);
  const limits = capabilities.resources.probes.limits;
  if (!ipVersion || !limits) return 0;
  return Math.min(limits.max_members_per_job, Math.floor(limits.max_results_per_job / (ipVersion === 'any' ? 2 : 1)));
}

export async function probeGroup({api, capabilities}: Connection, group: Group) {
  const size = groupProbeSize(capabilities);
  const ip_version = probeIpVersion(capabilities)!;
  for (let offset = 0; offset < group.members.length; offset += size) {
    const members = group.members.slice(offset, offset + size).map(member => member.id);
    const accepted = await api.startProbe({target: {type: 'group', group_id: group.id}, kind: 'http', transport: ['tcp'], ip_version, warmth: 'cold', members});
    finished(await settle(api, accepted), 'probe');
  }
}

export async function refreshProvider(api: Api, id: string) {
  const accepted = await api.refreshProvider(id);
  const result = finished(await settle(api, accepted), 'provider_refresh');
  invalidateReads();
  return result;
}

const configSnapshots = new WeakMap<Api, Awaited<ReturnType<Api['config']>>>();
export const configSnapshot = (api: Api) => configSnapshots.get(api);
const mainSnapshots = new WeakMap<Api, ConfigSource>();
export const mainSnapshot = (api: Api) => mainSnapshots.get(api);

export async function readMain(api: Api, signal?: AbortSignal): Promise<ConfigSource> {
  const config = await api.config(signal);
  const source = config.sources.find(item => item.kind === 'main');
  if (!source || source.content === undefined || (await sha256(source.content)) !== source.content_sha256) throw new LiteError('incomplete');
  configSnapshots.set(api, config);
  mainSnapshots.set(api, source);
  return source;
}

function withinLimit(content: string, body: unknown, contentLimit?: number, bodyLimit?: number) {
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  if ((contentLimit !== undefined && bytes(content) > contentLimit) || (bodyLimit !== undefined && bytes(JSON.stringify(body)) > bodyLimit)) {
    throw new LiteError('tooLarge');
  }
}

export async function applyContent(connection: Connection, source: ConfigSource, content: string): Promise<ConfigSource> {
  const {api, capabilities} = connection;
  if (!capabilities.resources.config.writable || !source.writable) throw new LiteError('readOnly');
  if ((await sha256(source.content)) !== source.content_sha256) throw new LiteError('incomplete');
  await validateContent(connection, source, content);
  const maxBody = capabilities.limits.max_json_body_bytes;
  withinLimit(content, {content}, capabilities.resources.config.max_bytes, maxBody);
  const accepted = await api.replaceConfigSource(source.id, content, etag(source.content_sha256)).catch(error => {
    throw activationError(error) ?? error;
  });
  const operation = await settle(api, accepted);
  finished(operation, 'reload', {written: true});
  try {
    const result = await readMain(api);
    invalidateReads();
    return result;
  } catch {
    throw new LiteError('writtenNotRead');
  }
}

const localErrors: Record<string, MessageKey> = {
  'login.engineOutdated': 'login.engineOutdated',
  'nodes.editNodeMissing': 'conflict',
  'nodes.editMissing': 'conflict',
  'nodes.nameTaken': 'invalidField',
  'nodes.tagTaken': 'invalidField',
  'config.unquotable': 'invalidField',
  'config.globalInvalid': 'invalidField',
  'config.globalDuplicate': 'invalidConfig',
  'ui.operationUnknown': 'unknownOutcome',
  'ui.operationFailed': 'failed',
  'ui.writtenNotApplied': 'writtenNotApplied',
  'ui.writtenNotRead': 'writtenNotRead',
  'ui.activationUnknown': 'unknownOutcome',
  'ui.activationNotSaved': 'notSaved',
  'ui.activationDegraded': 'degraded',
  'ui.activationDegradedSaved': 'savedDegraded',
  'ui.activationDegradedUnconfirmed': 'savedUnconfirmed',
  'act.modeNoRouting': 'noRouting',
  'act.modeInterleaved': 'interleaved'
};
export function errorKey(error: unknown): MessageKey {
  if (error instanceof LiteError) return error.key;
  if (error instanceof LocalError) return localErrors[error.key] ?? 'failed';
  if (error instanceof ApiError) {
    if (error.status === 401) return 'authError';
    if (error.status === 403) return 'forbidden';
    if (error.status === 409 || error.status === 412) return 'conflict';
    if (error.status === 422) return 'invalidConfig';
    if (error.status === 413) return 'tooLarge';
    if (error.status === 0) return error.request && !['GET', 'HEAD'].includes(error.request.method) ? 'unknownOutcome' : 'networkError';
    if (error.status === 503 && error.code === 'temporarily_unavailable') return 'unknownOutcome';
  }
  return 'failed';
}
