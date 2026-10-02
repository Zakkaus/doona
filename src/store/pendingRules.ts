import {useSyncExternalStore} from 'react';
import type {DnsRoutingRule, RoutingRule} from '../api/model';

// Where a held rule goes: its list, and the rule of that list it goes in front of, as the list read it when the rule
// was held. A DNS list that writes no fallback has no such rule at its end, so `before` is null there and the rule
// goes where the list ends when it is written, in a block of its own when the list has none yet.
export type PendingPlace = {list: 'routing'; before: RoutingRule} | {list: 'request' | 'response'; before: DnsRoutingRule | null};
// A rule held to be written with the others at the next apply, one reload per file instead of one per rule.
// `outbound` is what the rule writes after its arrow: an outbound, or a DNS action or upstream. `sourceId` is the
// file it was placed in; an apply writes it there or not at all.
export type HeldRule = PendingPlace & {condition: string; outbound: string; must: boolean; sourceId: string};
export type PendingRule = HeldRule & {id: number};
// `neutral`: the write's outcome is unknown rather than failed, which the toast reports neutrally.
export type PendingFailure = {text: string; lines: string[]; toastText?: string; requestId?: string; neutral?: true};
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
  add: (rule: HeldRule) => set({rules: [...state.rules, {...rule, id: nextId++}], failure: null}),
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
