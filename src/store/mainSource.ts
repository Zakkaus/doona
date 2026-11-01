import {useCallback, useMemo} from 'react';
import {useCapabilities} from './runtime';
import {useConfig, useConfigEditor, useSourceComplete, type ConfigTransform} from './config';
import type {ConfigDiagnostic, ConfigSource} from '../api/model';
import {LocalError} from '../api/error';
import {offered} from '../api/capabilities';

// Apply small main-source edits through shared preparation, optional full validation, If-Match write, and reload.
export type MainSourceEdit = {
  main: ConfigSource | null;
  // Whether the backend lets this page write at all: configuration content and writes both offered.
  writable: boolean;
  busy: boolean;
  error: Error | null;
  retry: () => void;
  // Never rejects: a dialog shows the outcome inline, a background edit as a toast.
  apply: (transform: ConfigTransform, origin?: ConfigSource) => Promise<EditResult>;
};
// `invalid` keeps the diagnostics of the preflight, so the edit can say which lines were refused, as a refused write does.
export type EditResult = {kind: 'ok'} | {kind: 'invalid'; diagnostics: ConfigDiagnostic[]} | {kind: 'cancelled'} | {kind: 'failed'; error: unknown};

// `checking`: the main source is there and its completeness is still being checked, as after each write.
export function useMainSourceEdit(): MainSourceEdit & {checking: boolean} {
  const resources = useCapabilities().data?.resources;
  const writable = offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const editor = useConfigEditor(config.refetch, {rethrow: true, shared: 'main-source-edit'});
  const source = config.data?.sources.find(source => source.kind === 'main' && source.writable) ?? null;
  const complete = useSourceComplete(source);
  const main = complete ? source : null;
  // While the digest check is still running nothing is wrong yet; the notice waits for a verdict.
  const incomplete = complete === false;
  const error = useMemo(() => config.error ?? (incomplete ? new LocalError('config.incomplete') : null), [config.error, incomplete]);
  const {apply} = editor;
  return {
    main,
    checking: !!source && complete === null,
    writable,
    busy: editor.busy !== null,
    error,
    retry: config.refetch,
    apply: useCallback<MainSourceEdit['apply']>(
      async (transform, origin = main ?? undefined): Promise<EditResult> => {
        if (!origin) return {kind: 'failed', error: error ?? new LocalError('config.incomplete')};
        try {
          const result = await apply(origin, transform);
          if (!result) return {kind: 'cancelled'};
          if (result.diagnostics) return {kind: 'invalid', diagnostics: result.diagnostics};
          return {kind: 'ok'};
        } catch (failure) {
          return {kind: 'failed', error: failure};
        }
      },
      [main, apply, error]
    )
  };
}
