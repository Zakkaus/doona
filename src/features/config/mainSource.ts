import {useCapabilities, useConfig, useConfigEditor} from '../../api/store';
import {candidate} from './names';
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
  const editor = useConfigEditor(config.refetch);
  const main = config.data?.sources.find(source => source.kind === 'main' && source.writable && typeof source.content === 'string') ?? null;
  return {
    main,
    writable,
    busy: editor.busy !== null,
    apply: async (transform, onInvalid) => {
      if (!main) return false;
      const content = transform(main.content!);
      // The dry run is optional in the contract; without it the write's own validation answers instead.
      if (resources?.config_validate.available && resources.config_validate.modes?.includes('full')) {
        const check = await editor.validate({sources: [candidate(main, content)], mode: 'full'});
        if (!check) return false;
        if (!check.valid) {
          onInvalid?.(check.diagnostics.filter(d => d.level === 'error').length);
          return false;
        }
      }
      return !!(await editor.save(main.id, content, main.content_sha256));
    }
  };
}
