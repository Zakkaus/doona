import {createContext, useContext} from 'react';

// S2's control sizes: M is 32px (36px on touch), L is 40px. A page toolbar or tab row provides L and wins over a
// control's own prop, so nothing in it can break the row; a card, dialog or popover resets to none.
export type ControlSize = 'M' | 'L';
export const ControlSizeContext = createContext<ControlSize | null>(null);
export function useControlSize(size?: ControlSize): ControlSize {
  return useContext(ControlSizeContext) ?? size ?? 'M';
}
