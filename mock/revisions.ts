import type {Api} from '../src/api/api';
import type {Capabilities, ConfigRevision, ConfigSource} from '../src/api/model';
import {configManagement} from '../src/api/engines';
import {ApiError} from '../src/api/error';
import {sha256} from '../src/api/hash';
import type {MockLifecycle} from './lifecycle';

type Sources = ConfigSource[];
export function createRevisions(
  capabilities: Capabilities,
  enqueue: MockLifecycle['enqueue'],
  load: () => Promise<Sources>,
  activate: (sources: Sources) => string
) {
  const management = configManagement(capabilities);
  const max = management.maxRevisions ?? 50;
  let entries: Array<{metadata: ConfigRevision; sources: Sources}> = [];
  let sequence = 0;
  let server: Sources = [];
  async function prepare(sources: Sources, origin: string) {
    const snapshot = structuredClone(sources);
    const content = snapshot.map(source => source.content).join('\n');
    const content_sha256 = await sha256(content);
    return () => {
      const metadata: ConfigRevision = {
        revision: ++sequence,
        parent: entries[0]?.metadata.revision ?? null,
        created_at: new Date().toISOString(),
        principal: 'demo',
        origin,
        content_sha256,
        bytes: new TextEncoder().encode(content).length,
        sources: snapshot.map(source => ({path: source.path, sha256: source.content_sha256}))
      };
      entries = [{metadata, sources: snapshot}, ...entries].slice(0, max);
    };
  }
  const requireCapability = (available: boolean) => {
    if (!available) throw new ApiError(404, 'capability_not_supported', 'Configuration management is unavailable');
  };
  const api: Pick<Api, 'exportConfig' | 'importConfig' | 'configRevisions' | 'activateConfigRevision'> = {
    exportConfig: async signal => {
      signal?.throwIfAborted();
      requireCapability(management.export);
      await load();
      // Fixed export fixture: the include is inlined and the listener secret omitted; this is not a dae parser.
      return {
        content:
          '# listener secrets omitted\nglobal {\n  tproxy_port: 12345\n}\n# included rules.dae\nrouting {\n  domain(example.org) -> direct\n  fallback: direct\n}\n',
        filename: `honk-r${sequence}.dae`,
        contentType: 'text/plain; charset=utf-8'
      };
    },
    configRevisions: async signal => {
      signal?.throwIfAborted();
      requireCapability(management.revisions);
      await load();
      return structuredClone({active: entries[0]?.metadata.revision ?? null, max_revisions: max, revisions: entries.map(entry => entry.metadata)});
    },
    importConfig: async (replace, signal) => {
      signal?.throwIfAborted();
      requireCapability(management.import);
      await load();
      if (!replace && entries.length) throw new ApiError(409, 'state_conflict', 'Replacing the database requires confirmation');
      const record = await prepare(server, 'import');
      return enqueue('reload', () => {
        const generation = activate(structuredClone(server));
        record();
        return {active_generation_id: generation, datapath_generation_id: null};
      });
    },
    activateConfigRevision: async (revision, signal) => {
      signal?.throwIfAborted();
      requireCapability(management.canActivate);
      await load();
      const entry = entries.find(entry => entry.metadata.revision === revision);
      if (!entry) throw new ApiError(404, 'resource_not_found', 'Revision not found');
      const record = await prepare(entry.sources, 'activate');
      return enqueue('reload', () => {
        if (entries[0]?.metadata.revision === revision) return {active_generation_id: null, datapath_generation_id: null};
        const generation = activate(structuredClone(entry.sources));
        record();
        return {active_generation_id: generation, datapath_generation_id: null};
      });
    }
  };
  return {
    api,
    prepare,
    initialize: async (sources: Sources) => {
      server = structuredClone(sources);
      (await prepare(sources, 'import'))();
    },
    store: () => ({kind: 'db' as const, revision: entries[0]?.metadata.revision ?? null, parent: entries[0]?.metadata.parent ?? null, recorded: true})
  };
}
