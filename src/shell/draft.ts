import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {useLinked} from '../ui/hooks';

export const DraftContext = createContext<{setDirty: (dirty: boolean) => void; revision: number; ask: (action: () => void) => void}>({
  setDirty: () => {},
  revision: 0,
  ask: action => action()
});

const drafts = new WeakMap<(dirty: boolean) => void, Set<symbol>>();

// The shell calls this once the person agreed to lose every draft: their reload prompts stop at once, ahead of the
// forms dropping the drafts themselves.
export function dropDrafts(setDirty: (dirty: boolean) => void) {
  drafts.get(setDirty)?.clear();
}

// Runs `action` at once when no form but `own` holds unsaved changes; otherwise the shell asks to discard them first and
// runs it after they are gone, so an action that changes the saved backend or credentials never lands before the answer.
export function useLeave(own?: symbol) {
  const {setDirty, ask} = useContext(DraftContext);
  return useCallback(
    (action: () => void) => {
      if ([...(drafts.get(setDirty) ?? [])].some(owner => owner !== own)) ask(action);
      else action();
    },
    [setDirty, ask, own]
  );
}

// `onDiscard` runs when the user confirms leaving with unsaved changes; the caller drops its draft there.
export function useDraftGuard(dirty: boolean, onDiscard: () => void) {
  const {setDirty, revision} = useContext(DraftContext);
  const [id] = useState(() => Symbol());
  const leave = useLeave(id);
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
  return {clear, revision, leave};
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
