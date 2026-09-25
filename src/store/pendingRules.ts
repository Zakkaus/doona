import {useSyncExternalStore} from 'react';
import type {RoutingRule} from '../api/model';

// A rule held to be written with the others at the next apply, one reload per file instead of one per rule. `before`
// is the rule it goes in front of, as the rule list read it when the rule was held.
export type PendingRule = {id: number; condition: string; outbound: string; must: boolean; before: RoutingRule; sourceId: string};
export type PendingFailure = {text: string; lines: string[]};
type State = {rules: PendingRule[]; failure: PendingFailure | null};

// Held for the session only: like the rule editor's own draft, a reload of the page drops it.
let state: State = {rules: [], failure: null};
let nextId = 1;
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach(notify => notify());
};
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => void listeners.delete(notify);
};
export const pendingRules = {
  add: (rule: Omit<PendingRule, 'id'>) => set({rules: [...state.rules, {...rule, id: nextId++}], failure: null}),
  remove: (ids: number[]) => {
    const rules = state.rules.filter(rule => !ids.includes(rule.id));
    set({rules, failure: rules.length ? state.failure : null});
  },
  fail: (failure: PendingFailure | null) => set({...state, failure})
};
export const usePendingRules = () => useSyncExternalStore(subscribe, () => state);
