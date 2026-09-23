import {createContext, useCallback, useContext, useEffect, useState} from 'react';

export const DraftContext = createContext<{setDirty: (dirty: boolean) => void; revision: number}>({setDirty: () => {}, revision: 0});

const drafts = new WeakMap<(dirty: boolean) => void, Set<symbol>>();

export function useDraftGuard(dirty: boolean) {
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
  return {clear, revision};
}
