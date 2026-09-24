import {ApiError} from '../api/error';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getApi} from '../api/index';
import type {ConfigSource, ConfigValidationRequest, ConfigValidationResult} from '../api/model';
import {LocalError} from '../api/error';
import {sha256} from '../api/hash';
import {useResource} from './resource';
import {useCapabilities} from './runtime';
import {etag, finished, useAction} from './action';

export function useConfig(enabled = true) {
  const api = getApi();
  return useResource({key: ['config'], every: 0, fetch: signal => api.config(signal)}, {enabled});
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
// failed). A new digest means the file changed and the next attempt starts from it. The same digest refused twice in
// a row means the disk is ahead of the running configuration and no refetch helps; the first may only be a reload
// still in progress. Returns the error to raise and the refusal to remember for the next 412.
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

export function useConfigEditor(refetch: () => void, {rethrow = false} = {}) {
  const api = getApi();
  const validation = useCapabilities().data?.resources.config_validate;
  const canValidate = validation?.available === true && validation.modes?.includes('full') === true;
  const {busy, error, run, cancel} = useAction<'validate' | 'save'>({rethrow});
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
          return api.validateConfig(request, signal);
        }),
      [api, run]
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
            const check = await api.validateConfig({sources: [{id: source.id, path: source.path, content}], mode: 'full'}, signal);
            signal.throwIfAborted();
            if (!check.valid) return {diagnostics: check.diagnostics};
          }
          const accepted = await api.replaceConfigSource(source.id, content, etag(source.content_sha256), signal).catch(async error => {
            if (!(error instanceof ApiError) || error.status !== 412) throw error;
            // The file changed on disk: fetch it, so the next attempt starts from what is there rather than 412 again.
            const fresh = await api.config(signal).catch(() => null);
            refetch();
            const outcome = refusalOutcome(error, source, fresh?.sources.find(item => item.id === source.id)?.content_sha256, lastRefused.current);
            lastRefused.current = outcome.lastRefused;
            throw outcome.error;
          });
          lastRefused.current = null;
          signal.throwIfAborted();
          const operation = await api.pollOperation(accepted, signal);
          signal.throwIfAborted();
          refetch();
          return {result: finished(operation, 'reload', {written: true})};
        }),
      [api, canValidate, run, refetch]
    )
  };
}
