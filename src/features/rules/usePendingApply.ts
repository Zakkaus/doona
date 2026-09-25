import {useRef, useState} from 'react';
import {getApi} from '../../api/index';
import type {ConfigSource} from '../../api/model';
import {pendingRules, refetchAll, useConfigEditor, usePendingRules, type PendingFailure, type PendingRule} from '../../store';
import {toast} from '../../ui/ui';
import {useT} from '../../i18n';
import {byFile, insertRules, partialFailure, ruleFailure} from './pending';

const reread = () => void refetchAll();
// Writes held rules one file at a time, each with its own validation, If-Match and reload, and stops at the first
// file that fails. Resolves to that failure, to null once every file is written, or to undefined when cancelled.
// Written rules leave the held list; the rest stay for the next attempt.
export function usePendingApply() {
  const t = useT();
  const editor = useConfigEditor(reread, {rethrow: true});
  // One apply at a time across all its files, so a second press while one runs does nothing.
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const writeFile = async (group: PendingRule[]): Promise<PendingFailure | null | undefined> => {
    let sources: ConfigSource[] = [];
    let text: string | null | undefined;
    try {
      sources = (await getApi().config()).sources;
      const source = sources.find(source => source.id === group[0].sourceId);
      const result = source && (await editor.apply(source, () => (text = insertRules(source, group))));
      if (!source || text === null) {
        reread();
        return {text: t('rule.stale'), lines: []};
      }
      if (!result) return undefined;
      return result.diagnostics ? ruleFailure(null, result.diagnostics, sources, t) : null;
    } catch (error) {
      return ruleFailure(error, null, sources, t);
    }
  };
  const writeAll = async (rules: PendingRule[]): Promise<PendingFailure | null | undefined> => {
    let written = 0;
    for (const group of byFile(rules)) {
      const failure = await writeFile(group);
      if (failure) return partialFailure(failure, written, rules.length - written, t);
      if (failure === undefined) return undefined;
      pendingRules.remove(group.map(rule => rule.id));
      written += group.length;
    }
    return null;
  };
  const apply = async (rules: PendingRule[]) => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    try {
      return await writeAll(rules);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {apply, busy, cancel: editor.cancel};
}

// The top bar's apply: every held rule at once, with the outcome toasted and a failure kept for the rule list.
export function useApplyHeld() {
  const t = useT();
  const {rules} = usePendingRules();
  const {apply, busy} = usePendingApply();
  const files = byFile(rules).length;
  return {
    count: rules.length,
    label: files > 1 ? t('rule.applyFiles', {n: rules.length, files}) : t('rule.applyPending', {n: rules.length}),
    busy,
    apply: async () => {
      const failure = await apply(rules);
      if (failure === undefined) return;
      pendingRules.fail(failure);
      toast(failure ? 'negative' : 'positive', failure ? failure.text : t('rule.applied', {n: rules.length}));
    }
  };
}
