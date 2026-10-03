import {createContext, useContext} from 'react';

// S2's control sizes: M is 32px (36px on touch), L is 40px. Every control is M unless it asks for L; a control's own
// prop wins over the size a card provides, and a dialog or popover resets to none.
export type ControlSize = 'M' | 'L';
export const ControlSizeContext = createContext<ControlSize | null>(null);
export function useControlSize(size?: ControlSize): ControlSize {
  const provided = useContext(ControlSizeContext);
  return size ?? provided ?? 'M';
}
