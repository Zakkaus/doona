import {useCapabilities, useConfig, useConfigEditor} from '../../api/store';
import {candidate} from './names';
import type {ConfigSource} from '../../api/model';

// One path for a control that rewrites the main source as a whole: read it, transform its text, validate in
// full, write it back with the hash it was read at, reload. The pages that stage a small edit (the outbound
// mode, a subscription's refresh interval) share it instead of each carrying the sequence.
export type MainSourceEdit = {
  // The writable main source with its text, or null while the backend offers none.
  main: ConfigSource | null;
  // Whether the backend lets this page write at all: configuration content and writes both offered.
  writable: boolean;
  busy: boolean;
  // Resolves to true when the write reached the engine; false when validation refused it (the count of errors
  // is handed to `onInvalid`) or the transform threw.
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
      const check = await editor.validate({sources: [candidate(main, content)], mode: 'full'});
      if (!check) return false;
      if (!check.valid) {
        onInvalid?.(check.diagnostics.filter(d => d.level === 'error').length);
        return false;
      }
      return !!(await editor.save(main.id, content, main.content_sha256));
    }
  };
}
