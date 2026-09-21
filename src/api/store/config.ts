import {useCallback, useState} from 'react';
import {getApi} from '../index';
import type {ConfigValidationRequest, ConfigValidationResult} from '../model';
import {useResource} from './resource';
import {etag, finished, useAction} from './action';
export function useConfig(enabled = true) {
  const api = getApi();
  return useResource({key: ['config'], every: 0, fetch: signal => api.config(signal)}, {enabled});
}
// Save through optional full validation and single-source replacement; 422 details carry diagnostics. rethrow also rejects for callers that report failures themselves.
export function useConfigEditor(refetch: () => void, {rethrow = false} = {}) {
  const api = getApi();
  const {busy, error, run} = useAction<'validate' | 'save'>({rethrow});
  // The source the last action concerned, so only that source's card shows a rejected save's diagnostics.
  const [sourceId, setSourceId] = useState<string | null>(null);
  return {
    busy,
    error,
    errorSource: error ? sourceId : null,
    validate: useCallback(
      (request: ConfigValidationRequest): Promise<ConfigValidationResult | undefined> => {
        setSourceId(request.sources.length === 1 ? (request.sources[0].id ?? null) : null);
        return run('validate', signal => api.validateConfig(request, signal));
      },
      [api, run]
    ),
    save: useCallback(
      (id: string, content: string, sha256: string) => {
        setSourceId(id);
        return run('save', async signal => {
          const accepted = await api.replaceConfigSource(id, content, etag(sha256), signal);
          const result = await api.pollOperation(accepted, signal);
          refetch();
          return finished(result, 'reload');
        });
      },
      [api, run, refetch]
    )
  };
}
