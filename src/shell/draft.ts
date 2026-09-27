import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {useLinked} from '../ui/hooks';

export const DraftContext = createContext<{setDirty: (dirty: boolean) => void; revision: number}>({setDirty: () => {}, revision: 0});

const drafts = new WeakMap<(dirty: boolean) => void, Set<symbol>>();

// `onDiscard` runs when the user confirms leaving with unsaved changes; the caller drops its draft there.
export function useDraftGuard(dirty: boolean, onDiscard: () => void) {
  const {setDirty, revision} = useContext(DraftContext);
  const [id] = useState(() => Symbol());
  const clear = useCallback(() => {
    const owners = drafts.get(setDirty);
    owners?.delete(id);
    setDirty(!!owners?.size);
  }, [id, setDirty]);
  useEffect(() => {
    if (!dirty) return;
    const owners = drafts.get(setDirty) ?? new Set<symbol>();
    drafts.set(setDirty, owners);
    owners.add(id);
    setDirty(true);
    const warn = (event: BeforeUnloadEvent) => {
      if (owners.has(id)) event.preventDefault();
    };
    addEventListener('beforeunload', warn);
    return () => {
      removeEventListener('beforeunload', warn);
      clear();
    };
  }, [dirty, id, setDirty, clear, revision]);
  useLinked(revision, onDiscard);
  return {clear, revision};
}

// Numbers each opening of a dialog, so a request that settles after its dialog closed, or after it was opened again,
// neither closes the new one nor reports into it. `next` runs on open and on close; `start` runs when a request is
// sent and returns whether that same opening is still the current one.
export function useDialogSession() {
  const count = useRef(0);
  return useMemo(
    () => ({
      next: () => {
        count.current++;
      },
      start: () => {
        const started = count.current;
        return () => count.current === started;
      }
    }),
    []
  );
}
