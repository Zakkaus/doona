import {ApiError, clientError} from '../api/error';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getApi} from '../api/index';
import type {ConfigSource, ConfigValidationRequest, ConfigValidationResult} from '../api/model';
import {LocalError} from '../api/error';
import {sha256} from '../api/hash';
import {useResource} from './resource';
import {useCapabilities} from './runtime';
import {activationError, etag, finished, settle, useAction} from './action';
import type {Api} from '../api/api';
import {sourceAt} from '../dae/newSource';

export function useConfig(enabled = true) {
  const api = getApi();
  return useResource({key: ['config'], every: 0, fetch: signal => api.config(signal)}, {enabled});
}

// The configuration as the backend holds it now, read past the watched resource, for a check that must see the
// latest revision rather than the one last fetched. The watched resource is left as it is.
export function readConfigFresh(api: Api, signal: AbortSignal) {
  return api.config(signal);
}

async function completeSource(source: Pick<ConfigSource, 'content' | 'content_sha256'>): Promise<boolean> {
  return source.content !== undefined && (await sha256(source.content)) === source.content_sha256;
}

type Check = {digest: string; content: string | undefined; complete: boolean};

// Whether each source's text matches its digest; undefined until checked. Results are kept by id, digest and text
// rather than by object, so a refetch of the same text keeps its answer instead of dropping back to unknown.
export function useCompleteness(sources: ConfigSource[]): (source: ConfigSource) => boolean | undefined {
  const [checked, setChecked] = useState<Map<string, Check>>(new Map());
  useEffect(() => {
    let live = true;
    void Promise.all(
      sources.map(async source => [source.id, {digest: source.content_sha256, content: source.content, complete: await completeSource(source)}] as const)
    ).then(entries => {
      if (live) setChecked(new Map(entries));
    });
    return () => {
      live = false;
    };
  }, [sources]);
  return useCallback(
    (source: ConfigSource) => {
      const check = checked.get(source.id);
      return check && check.digest === source.content_sha256 && check.content === source.content ? check.complete : undefined;
    },
    [checked]
  );
}

// One source's verdict: null until checked, and for no source at all.
export function useSourceComplete(source: ConfigSource | null): boolean | null {
  const sources = useMemo(() => (source ? [source] : []), [source]);
  const isComplete = useCompleteness(sources);
  return source ? (isComplete(source) ?? null) : null;
}

// A 412 on replacing `source`, given the digest the backend reports for it after a refetch (undefined when that
// failed). A new digest means the file changed, which the editor then puts to the person. The same digest refused
// twice in a row means the disk is ahead of the running configuration and no refetch helps; the first may only be a
// reload still in progress. Returns the error to raise and the refusal to remember for the next 412.
export function refusalOutcome(
  error: ApiError,
  source: Pick<ConfigSource, 'id' | 'content_sha256'>,
  current: string | undefined,
  lastRefused: string | null
): {error: Error; lastRefused: string | null} {
  if (current !== source.content_sha256) return {error, lastRefused};
  const refused = source.id + ':' + source.content_sha256;
  return refused === lastRefused ? {error: new LocalError('config.diskAhead'), lastRefused} : {error, lastRefused: refused};
}

// Advertised byte limits for one kind of write, from discovery; either may be missing on an older backend.
export type WriteLimits = {content?: number; body?: number};
const utf8 = (text: string) => new TextEncoder().encode(text).length;
const tooLarge = (limit: number) => clientError(413, 'request_too_large', `Configuration exceeds the ${limit}-byte limit`, 'config.tooLarge', {limit});

// The contract applies the content limit to the source text and the shared JSON body limit to the request, which
// escaping makes larger than the text. Returns the advertised limit this write uses the largest share of: the one it
// exceeds, if any, and otherwise the likeliest cause of a 413, which does not say which limit refused it.
export function closestLimit(limits: WriteLimits, content: string, body: unknown): {limit: number; exceeded: boolean} | undefined {
  const [closest] = [
    {limit: limits.content, size: utf8(content)},
    {limit: limits.body, size: utf8(JSON.stringify(body))}
  ]
    .filter((share): share is {limit: number; size: number} => share.limit !== undefined)
    .sort((a, b) => b.size / b.limit - a.size / a.limit);
  return closest && {limit: closest.limit, exceeded: closest.size > closest.limit};
}

export async function withinLimits<T>(limits: WriteLimits, content: string, body: unknown, send: () => Promise<T>): Promise<T> {
  const closest = closestLimit(limits, content, body);
  if (closest?.exceeded) throw tooLarge(closest.limit);
  return send().catch((error: unknown) => {
    throw error instanceof ApiError && error.status === 413 && closest ? tooLarge(closest.limit) : error;
  });
}

// Creates an empty source at `path` and returns the id the reloaded configuration lists it under, or null when it
// lists none there. A failed reload removes the new file, which the operation reports as not written. Once the reload
// succeeded the file exists, so a failed read-back only leaves the id unknown: the create still succeeded.
export async function createSource(api: Api, path: string, signal: AbortSignal): Promise<string | null> {
  const accepted = await api.createConfigSource(path, '', signal).catch(error => {
    throw activationError(error) ?? error;
  });
  const operation = await settle(api, accepted, signal);
  finished(operation, 'reload');
  signal.throwIfAborted();
  const config = await readConfigFresh(api, signal).catch(() => {
    signal.throwIfAborted();
    return null;
  });
  return config && (sourceAt(config.sources, path)?.id ?? null);
}

export function useConfigCreate(refetch: () => void) {
  const api = getApi();
  const {busy, run} = useAction<'create'>({rethrow: true});
  return {
    busy: busy !== null,
    create: useCallback(
      (path: string) =>
        run('create', async signal => {
          const id = await createSource(api, path, signal).finally(refetch);
          return {id};
        }),
      [api, run, refetch]
    )
  };
}

// `refetch` may return the read it starts: the write then settles once the new configuration is read back, so a caller that
// drops its draft on success is not left showing the old text with the old digest. A read that fails after the write
// landed ends the action with `ui.writtenNotRead`, so the draft stays until the read succeeds.
export function useConfigEditor(refetch: () => unknown, {rethrow = false, shared}: {rethrow?: boolean; shared?: string} = {}) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const validation = capabilities?.resources.config_validate;
  const canValidate = validation?.available === true && validation.modes?.includes('full') === true;
  const body = capabilities?.limits.max_json_body_bytes;
  const writeMax = capabilities?.resources.config.max_bytes;
  const validateMax = validation?.max_bytes;
  const validateConfig = useCallback(
    (request: ConfigValidationRequest, signal: AbortSignal) =>
      withinLimits({content: validateMax, body}, request.sources.map(source => source.content ?? '').join(''), request, () =>
        api.validateConfig(request, signal)
      ),
    [api, validateMax, body]
  );
  const {busy, error, run, cancel} = useAction<'validate' | 'save'>({rethrow, shared});
  const [sourceId, setSourceId] = useState<string | null>(null);
  const lastRefused = useRef<string | null>(null);
  return {
    busy,
    cancel,
    error,
    errorSource: error ? sourceId : null,
    validate: useCallback(
      (request: ConfigValidationRequest): Promise<ConfigValidationResult | undefined> =>
        run('validate', signal => {
          setSourceId(request.sources.length === 1 ? (request.sources[0].id ?? null) : null);
          return validateConfig(request, signal);
        }),
      [validateConfig, run]
    ),
    apply: useCallback(
      (source: ConfigSource, candidate: string | ((text: string) => string | null)) =>
        run('save', async signal => {
          setSourceId(source.id);
          if (!source.writable) throw new LocalError('config.readOnly');
          if (!(await completeSource(source))) throw new LocalError('config.incomplete');
          signal.throwIfAborted();
          const content = typeof candidate === 'string' ? candidate : candidate(source.content!);
          if (content === null) return undefined;
          if (canValidate && source.kind === 'main' && source.path !== '<redacted>') {
            const check = await validateConfig({sources: [{id: source.id, path: source.path, content}], mode: 'full'}, signal);
            signal.throwIfAborted();
            if (!check.valid) return {diagnostics: check.diagnostics};
          }
          const accepted = await withinLimits({content: writeMax, body}, content, {content}, () =>
            api.replaceConfigSource(source.id, content, etag(source.content_sha256), signal)
          ).catch(async error => {
            // A 409 is a change the If-Match still matched, or another write still activating: nothing was stored and
            // the validated candidate is stale, so the next attempt starts from a fresh read.
            if (error instanceof ApiError && error.status === 409 && error.code === 'state_conflict') {
              refetch();
              throw new LocalError('config.changedMeanwhile');
            }
            if (!(error instanceof ApiError) || error.status !== 412) throw activationError(error) ?? error;
            // The file changed on disk: fetch it, so the next attempt starts from what is there rather than 412 again.
            const fresh = await readConfigFresh(api, signal).catch(() => null);
            refetch();
            const outcome = refusalOutcome(error, source, fresh?.sources.find(item => item.id === source.id)?.content_sha256, lastRefused.current);
            lastRefused.current = outcome.lastRefused;
            throw outcome.error;
          });
          lastRefused.current = null;
          signal.throwIfAborted();
          const operation = await settle(api, accepted, signal);
          signal.throwIfAborted();
          const read = (await refetch()) as {ok?: boolean; error?: Error} | undefined;
          const result = finished(operation, 'reload', {written: true});
          if (read?.ok === false && read.error?.name !== 'AbortError') throw new LocalError('ui.writtenNotRead');
          return {result};
        }),
      [api, canValidate, validateConfig, writeMax, body, run, refetch]
    )
  };
}
