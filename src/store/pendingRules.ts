import {useSyncExternalStore} from 'react';
import type {RoutingRule} from '../api/model';

// A rule held to be written with the others at the next apply, one reload per file instead of one per rule. `before`
// is the rule it goes in front of, as the rule list read it when the rule was held.
export type PendingRule = {id: number; condition: string; outbound: string; must: boolean; before: RoutingRule; sourceId: string};
export type PendingFailure = {text: string; lines: string[]};
// `applying`: one apply at a time, whichever button started it.
type State = {rules: PendingRule[]; failure: PendingFailure | null; applying: boolean};

// Held for the session only: like the rule editor's own draft, a reload of the page drops it, so leaving the page
// while rules are held asks first.
let state: State = {rules: [], failure: null, applying: false};
let nextId = 1;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = {...state, ...patch};
  listeners.forEach(notify => notify());
};
if (typeof window !== 'undefined')
  window.addEventListener('beforeunload', event => {
    if (state.rules.length) event.preventDefault();
  });
export const pendingRules = {
  subscribe: (notify: () => void) => {
    listeners.add(notify);
    return () => void listeners.delete(notify);
  },
  snapshot: () => state,
  add: (rule: Omit<PendingRule, 'id'>) => set({rules: [...state.rules, {...rule, id: nextId++}], failure: null}),
  // The failure was about the rules as they were, so it goes once any of them leaves.
  remove: (ids: number[]) => {
    const rules = state.rules.filter(rule => !ids.includes(rule.id));
    if (rules.length !== state.rules.length) set({rules, failure: null});
  },
  fail: (failure: PendingFailure | null) => set({failure}),
  // False while another apply runs.
  begin: () => {
    if (state.applying) return false;
    set({applying: true});
    return true;
  },
  end: () => set({applying: false})
};
export const usePendingRules = () => useSyncExternalStore(pendingRules.subscribe, pendingRules.snapshot);
