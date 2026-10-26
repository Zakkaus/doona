import {createContext, useContext, useEffect, useRef, type RefObject} from 'react';
import type {ConfigSource} from '../../../../src/api/model';

export type ExportDraft = {source: ConfigSource; content: () => string};
export const ExportDraftContext = createContext<RefObject<ExportDraft | null>>({current: null});

// Each page publishes its existing serializer; exporting never stages or applies a change.
export function useExportDraft(source: ConfigSource | undefined, dirty: boolean, content: () => string) {
  const registry = useContext(ExportDraftContext);
  const latest = useRef(content);
  latest.current = content;
  useEffect(() => {
    if (!source || !dirty) return;
    const entry = {source, content: () => latest.current()};
    registry.current = entry;
    return () => {
      if (registry.current === entry) registry.current = null;
    };
  }, [registry, source, dirty]);
}
