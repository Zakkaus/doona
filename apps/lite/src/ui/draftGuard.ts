import {createContext, useContext, useEffect, useRef} from 'react';
export const DraftContext = createContext<(dirty: boolean) => void>(() => {});
export function useDraftGuard(dirty: boolean, discard?: () => void) {
  const onDiscard = useRef(discard);
  onDiscard.current = discard;
  useEffect(() => {
    const discard = () => onDiscard.current?.();
    window.addEventListener('lite-discard-draft', discard);
    return () => window.removeEventListener('lite-discard-draft', discard);
  }, []);
  const setDirty = useContext(DraftContext);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}
