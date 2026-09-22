import type {Api} from '../api';
import type {Capabilities, ConfigSource, RuleList, Runtime, RuntimeSettingsPatch} from '../model';
import {ApiError} from '../error';
import * as fixtures from './fixtures/configuration';
import {found} from './common';
import {diagnose, sectionLines, stored, validate} from './config';
import type {MockLifecycle} from './lifecycle';

type ConfigurationApi = Pick<
  Api,
  'rules' | 'config' | 'validateConfig' | 'replaceConfigSource' | 'runtimeSettings' | 'patchRuntimeSettings' | 'startReload' | 'startSuspend' | 'startResume'
>;
type Effects = Pick<MockLifecycle, 'enqueue' | 'log' | 'publish' | 'eventData' | 'trimLogs'>;
export function createConfiguration(
  capabilities: Capabilities,
  runtime: Pick<Runtime, 'generation' | 'lifecycle'>,
  {enqueue, log, publish, eventData, trimLogs}: Effects,
  groupNames: () => Set<string>,
  activateInventory: (text: string, revision: string) => void
) {
  const settings = structuredClone(fixtures.runtimeSettings);
  let sources: (ConfigSource & {content: string})[] | null = null;
  let disk: (ConfigSource & {content: string})[] = [];
  let loading: Promise<(ConfigSource & {content: string})[]> | undefined;
  const loadSources = () =>
    (loading ??= Promise.all(fixtures.configSources.map(stored)).then(list => {
      sources = list;
      disk = [...list];
      return list;
    }));
  let configRevision = 40;
  // Only dae rule files are checked; subscription and generated sources hold node lists the checker does not read.
  const ruleFile = (source: {kind: string}) => source.kind === 'main' || source.kind === 'include';
  // Advancing a generation increments the revision, restores configured runtime settings, and notifies listeners.
  function advance(): string {
    const nextRevision = String(configRevision + 1);
    const main = disk.find(source => source.kind === 'main');
    if (main) activateInventory(main.content, nextRevision);
    if (sources) sources = [...disk];
    configRevision += 1;
    Object.assign(settings, structuredClone(fixtures.runtimeSettings), {observed_at: new Date().toISOString()});
    log('info', 'honk::routing', 'Routing generation published.', {generation_id: String(configRevision)});
    const generation = String(configRevision);
    runtime.generation = {...runtime.generation, active_id: generation, config_revision: generation, activated_at: new Date().toISOString()};
    publish({id: '', event: 'generation.changed', data: {...eventData(), generation_id: generation, previous_generation_id: String(configRevision - 1)}});
    return generation;
  }
  // Mirror management writes into the main source so the configuration page shows the API result.
  async function editMain(edit: (text: string) => string) {
    await loadSources();
    const main = found(
      disk.find(item => item.kind === 'main'),
      'Main source'
    );
    const next = await stored({...main, content: edit(main.content), loaded_at: new Date().toISOString()});
    return () => {
      if (disk.find(item => item.id === main.id) !== main) throw new ApiError(412, 'stale_revision', 'The main source changed before activation');
      disk = disk.map(item => (item.id === main.id ? next : item));
      return advance();
    };
  }
  // Preserve fixture IDs for unchanged rules; new rules use their source location.
  const ruleSnapshot = async (): Promise<RuleList> => {
    await loadSources();
    const list = sources!;
    const byPath = new Map(list.map(item => [item.path.split('/').pop()!, item]));
    const known = new Map(fixtures.configRules.rules.map(rule => [rule.cond + ' -> ' + rule.target + (rule.must ? '(must)' : ''), rule.id]));
    const entries: RuleList['rules'] = [];
    let fallback: RuleList['fallback'] | null = null;
    const read = (file: (typeof list)[number], bare: boolean) => {
      sectionLines(file.content, 'routing', bare).forEach(({code, line}) => {
        const include = /^include\s+(\S+)$/.exec(code);
        if (include) {
          const target = byPath.get(include[1]);
          if (target) read(target, true);
          return;
        }
        const fb = /^fallback:\s*(\S+)$/.exec(code);
        const rule = /^(.+?)\s*->\s*(\S+)$/.exec(code);
        if (!fb && !rule) return;
        const source = {file: file.path.split('/').pop()!, source_id: file.id, line};
        if (fb) {
          fallback = {outbound: fb[1], source};
          entries.push({rule_id: 'fallback', index: entries.length, expression: code, outbound: fb[1], must: false, source, kind: 'fallback'});
          return;
        }
        const must = rule![2].endsWith('(must)');
        const outbound = rule![2].replace(/\(must\)$/, '');
        // The condition alone, as honk renders it and as flows quote it; the outbound is its own field.
        entries.push({
          rule_id: known.get(code) ?? `${source.file}:${source.line}`,
          index: entries.length,
          expression: rule![1],
          outbound,
          must,
          source,
          kind: 'rule'
        });
      });
    };
    const main = list.find(item => item.kind === 'main');
    if (main) read(main, false);
    if (!fallback) throw new ApiError(409, 'snapshot_unavailable', 'The routing section has no fallback');
    return {generation_id: String(configRevision), rules: entries, fallback};
  };
  const api: ConfigurationApi = {
    rules: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.rules.available) throw new ApiError(404, 'capability_not_supported', 'The rule list is unavailable');
      return ruleSnapshot();
    },
    config: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.config.available) throw new ApiError(404, 'capability_not_supported', 'Configuration readback is unavailable');
      await loadSources();
      const list = sources!;
      const generation = String(configRevision);
      const known = groupNames();
      return {
        generation_id: generation,
        revision: generation,
        sources: list.map(source => (capabilities.resources.config.content ? {...source} : {...source, content: undefined})),
        diagnostics: [
          ...list.filter(ruleFile).flatMap(source => diagnose(source.id, source.content, known, 'full').filter(item => item.level !== 'error')),
          ...fixtures.configNotes
        ],
        secrets_redacted: true
      };
    },
    validateConfig: async (request, signal) => {
      signal?.throwIfAborted();
      if (!capabilities.resources.config_validate.available) throw new ApiError(404, 'capability_not_supported', 'Validation is unavailable');
      if (!capabilities.resources.config_validate.modes?.includes(request.mode))
        throw new ApiError(400, 'invalid_request', `Mode ${request.mode} is not advertised`);
      return validate(request, String(configRevision));
    },
    // The editing contract in order: If-Match present and current, full validation clean, then the write and a reload.
    replaceConfigSource: async (sourceId, content, ifMatch, signal) => {
      signal?.throwIfAborted();
      await loadSources();
      const list = disk;
      const source = found(
        list.find(item => item.id === sourceId),
        'Configuration source'
      );
      if (!capabilities.resources.config.writable || !source.writable) throw new ApiError(403, 'permission_denied', 'This source is read-only');
      if (!ifMatch) throw new ApiError(428, 'precondition_required', 'If-Match is required');
      if (ifMatch.replace(/^"|"$/g, '') !== source.content_sha256)
        throw new ApiError(412, 'stale_revision', 'The source changed on disk; fetch it again before retrying');
      const main = list.find(item => item.kind === 'main')!;
      const candidate: Array<{id: string; path: string; content: string}> = [];
      const include = (item: (typeof list)[number]) => {
        if (candidate.some(source => source.id === item.id)) return;
        const text = item.id === sourceId ? content : item.content;
        candidate.push({id: item.id, path: item.path, content: text});
        for (const {code} of sectionLines(text, 'routing', item.kind === 'include')) {
          const path = /^include\s+(\S+)$/.exec(code)?.[1];
          const dependency = path && list.find(source => source.kind === 'include' && source.path.split('/').pop() === path);
          if (dependency) include(dependency);
        }
      };
      include(main);
      const check = validate({sources: candidate, mode: 'full'}, String(configRevision));
      if (!check.valid) throw new ApiError(422, 'unsupported_value', 'Validation found errors; nothing was written', null, {diagnostics: check.diagnostics});
      const next = await stored({...source, content, loaded_at: new Date().toISOString()});
      disk = disk.map(item => (item.id === sourceId ? next : item));
      log('info', 'honk::config', 'Configuration source replaced; reloading.', {source_id: sourceId});
      return enqueue('reload', () => {
        const generation = advance();
        return {active_generation_id: generation, datapath_generation_id: generation};
      });
    },
    runtimeSettings: async signal => {
      signal?.throwIfAborted();
      if (!capabilities.resources.runtime_settings.available) throw new ApiError(404, 'capability_not_supported', 'Runtime settings are unavailable');
      return structuredClone(settings);
    },
    // Merge semantics: every value is checked against its ceiling before anything changes.
    patchRuntimeSettings: async (patch, signal) => {
      signal?.throwIfAborted();
      const resources = capabilities.resources;
      if (!resources.runtime_settings.available) throw new ApiError(404, 'capability_not_supported', 'Runtime settings are unavailable');
      const allowed = new Set(resources.runtime_settings.fields ?? []);
      const ceilings = {
        'log.buffered_records': resources.logs.max_buffered_records ?? 0,
        'dns_log.max_records': resources.dns_log.max_records ?? 0,
        'flows.max_flows': resources.flows.max_flows ?? 0,
        'flows.retention_seconds': resources.flows.retention_seconds ?? 0
      };
      const invalid = (message: string) => new ApiError(400, 'invalid_request', message);
      const fields = Object.entries(patch).flatMap(([section, values]) =>
        Object.entries(values ?? {}).map(([field, value]) => [`${section}.${field}`, value] as const)
      );
      for (const [field, value] of fields) {
        if (!allowed.has(field as never)) throw invalid(`${field} cannot be changed on this backend`);
        if (field === 'log.level') {
          if (!(resources.logs.levels ?? []).includes(value as never)) throw invalid(`${value} is not an advertised log level`);
          continue;
        }
        const ceiling = ceilings[field as keyof typeof ceilings];
        const floor = field === 'flows.retention_seconds' ? 1 : 64;
        if (!Number.isInteger(value) || (value as number) < floor || (value as number) > ceiling) throw invalid(`${field} must lie in [${floor}, ${ceiling}]`);
      }
      const apply = <S extends keyof RuntimeSettingsPatch>(section: S) => Object.assign(settings[section], patch[section] ?? {});
      apply('log');
      apply('dns_log');
      apply('flows');
      // A smaller ring drops its oldest records at once, not when the next one arrives.
      trimLogs();
      settings.source = 'runtime';
      settings.observed_at = new Date().toISOString();
      log('info', 'honk::settings', 'Runtime settings changed.', {fields: fields.map(([field]) => field)});
      return structuredClone(settings);
    },
    startReload: async signal => {
      signal?.throwIfAborted();
      await loadSources();
      return enqueue('reload', () => {
        const generation = advance();
        return {active_generation_id: generation, datapath_generation_id: generation};
      });
    },
    startSuspend: async signal => {
      signal?.throwIfAborted();
      return enqueue('suspend', () => {
        runtime.lifecycle.state = 'suspended';
        return {runtime_state: 'suspended'};
      });
    },
    startResume: async signal => {
      signal?.throwIfAborted();
      return enqueue('resume', () => {
        runtime.lifecycle.state = 'running';
        return {runtime_state: 'running'};
      });
    }
  };
  return {api, ruleSnapshot, advance, editMain, revision: () => String(configRevision), logSettings: () => settings.log};
}
