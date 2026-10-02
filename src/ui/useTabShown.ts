import {createContext, useContext} from 'react';

// Whether the tab panel around a component is the one on screen. A kept panel stays mounted while hidden, so what
// it renders outside itself (a drawer, a document-wide key handler) must follow this rather than its own state.
export const TabShown = createContext(true);
export const useTabShown = () => useContext(TabShown);
