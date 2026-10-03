import {createContext, useContext, type ReactNode} from 'react';
import {createPortal} from 'react-dom';

export const PageActionsTarget = createContext<HTMLElement | null>(null);
export function PageActions({children}: {children: ReactNode}) {
  const target = useContext(PageActionsTarget);
  return target ? createPortal(children, target) : null;
}
