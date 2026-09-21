import {useCallback} from 'react';
import {useCapabilities, useConfig, useConfigEditor} from '../../api/store';
import {useSourceComplete} from '../../api/store/config';
import type {ConfigSource} from '../../api/model';

// Apply small main-source edits through one read, optional full validation, If-Match write, and reload sequence.
export type MainSourceEdit = {
  main: ConfigSource | null;
  // Whether the backend lets this page write at all: configuration content and writes both offered.
  writable: boolean;
  busy: boolean;
  // Resolve true after reload, false for validation refusal or cancellation, and reject request failures. onInvalid receives the validation error count.
  apply: (transform: (text: string) => string, onInvalid?: (errors: number) => void) => Promise<boolean>;
};

export function useMainSourceEdit(): MainSourceEdit {
  const resources = useCapabilities().data?.resources;
  const writable = resources?.config.available === true && resources.config.writable === true && resources.config.content === true;
  const config = useConfig(resources?.config.available === true);
  const editor = useConfigEditor(config.refetch, {rethrow: true});
  const source = config.data?.sources.find(source => source.kind === 'main' && source.writable) ?? null;
  const complete = useSourceComplete(source);
  const main = complete ? source : null;
  const {apply} = editor;
  return {
    main,
    writable,
    busy: editor.busy !== null,
    apply: useCallback<MainSourceEdit['apply']>(
      async (transform, onInvalid) => {
        if (!main) return false;
        const result = await apply(main, transform);
        if (!result) return false;
        if (result.diagnostics) {
          onInvalid?.(result.diagnostics.filter(d => d.level === 'error').length);
          return false;
        }
        return true;
      },
      [main, apply]
    )
  };
}
