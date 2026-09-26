import {useCallback, useMemo} from 'react';
import {useCapabilities} from './runtime';
import {useConfig, useConfigEditor, useSourceComplete} from './config';
import type {ConfigSource} from '../api/model';
import {LocalError, failureNotice, type Notice} from '../api/error';
import type {Translator} from '../i18n';
import {offered} from '../api/capabilities';

// Apply small main-source edits through one read, optional full validation, If-Match write, and reload sequence.
export type MainSourceEdit = {
  main: ConfigSource | null;
  // Whether the backend lets this page write at all: configuration content and writes both offered.
  writable: boolean;
  busy: boolean;
  error: Error | null;
  retry: () => void;
  // Never rejects: a dialog shows the outcome inline, a background edit as a toast.
  apply: (transform: (text: string) => string, origin?: ConfigSource) => Promise<EditResult>;
};
export type EditResult = {kind: 'ok'} | {kind: 'invalid'; errors: number} | {kind: 'cancelled'} | {kind: 'failed'; error: unknown};

// What to tell the person about an edit that did not land; null when it was written or cancelled. An unknown
// operation outcome is not a failure, so it reads neutrally.
export const editProblem = (result: EditResult, t: Translator): Notice | null =>
  result.kind === 'invalid'
    ? {kind: 'negative', text: t('ui.writeInvalid', {n: result.errors})}
    : result.kind === 'failed'
      ? failureNotice(result.error, t, t('ui.writeFailed'))
      : null;

export function useMainSourceEdit(): MainSourceEdit {
  const resources = useCapabilities().data?.resources;
  const writable = offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true && resources?.config.content === true;
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const editor = useConfigEditor(config.refetch, {rethrow: true});
  const source = config.data?.sources.find(source => source.kind === 'main' && source.writable) ?? null;
  const complete = useSourceComplete(source);
  const main = complete ? source : null;
  // While the digest check is still running nothing is wrong yet; the notice waits for a verdict.
  const incomplete = complete === false;
  const error = useMemo(() => config.error ?? (incomplete ? new LocalError('config.incomplete') : null), [config.error, incomplete]);
  const {apply} = editor;
  return {
    main,
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
          if (result.diagnostics) return {kind: 'invalid', errors: result.diagnostics.filter(d => d.level === 'error').length};
          return {kind: 'ok'};
        } catch (failure) {
          return {kind: 'failed', error: failure};
        }
      },
      [main, apply, error]
    )
  };
}
