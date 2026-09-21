import {useCallback, useEffect, useState} from 'react';
import {getApi} from '../index';
import type {ConfigSource, ConfigValidationRequest, ConfigValidationResult} from '../model';
import {LocalError} from '../error';
import {sha256} from '../hash';
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

export function useSourceComplete(source: ConfigSource | null): boolean | null {
  const content = source?.content;
  const digest = source?.content_sha256 ?? '';
  const [checked, setChecked] = useState<{content: string | undefined; digest: string; complete: boolean} | null>(null);
  useEffect(() => {
    let live = true;
    void completeSource({content, content_sha256: digest}).then(complete => {
      if (live) setChecked({content, digest, complete});
    });
    return () => {
      live = false;
    };
  }, [content, digest]);
  return checked?.content === content && checked?.digest === digest ? checked.complete : null;
}

export function useConfigEditor(refetch: () => void, {rethrow = false} = {}) {
  const api = getApi();
  const validation = useCapabilities().data?.resources.config_validate;
  const canValidate = validation?.available === true && validation.modes?.includes('full') === true;
  const {busy, error, run, cancel} = useAction<'validate' | 'save'>({rethrow});
  const [sourceId, setSourceId] = useState<string | null>(null);
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
          if (canValidate) {
            const check = await api.validateConfig({sources: [{id: source.id, content}], mode: 'full'}, signal);
            signal.throwIfAborted();
            if (!check.valid) return {diagnostics: check.diagnostics};
          }
          const accepted = await api.replaceConfigSource(source.id, content, etag(source.content_sha256), signal);
          signal.throwIfAborted();
          const operation = await api.pollOperation(accepted, signal);
          signal.throwIfAborted();
          refetch();
          return {result: finished(operation, 'reload')};
        }),
      [api, canValidate, run, refetch]
    )
  };
}
