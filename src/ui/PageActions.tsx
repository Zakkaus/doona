import {createContext, useContext, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ControlSizeContext} from './controlSize';

export const PageActionsTarget = createContext<HTMLElement | null>(null);
export function PageActions({children}: {children: ReactNode}) {
  const target = useContext(PageActionsTarget);
  return target ? createPortal(<ControlSizeContext value="L">{children}</ControlSizeContext>, target) : null;
}
