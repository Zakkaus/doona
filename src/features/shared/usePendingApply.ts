import {useEffect, useRef} from 'react';
import {getApi} from '../../api/index';
import {LocalError} from '../../api/error';
import type {ConfigSource} from '../../api/model';
import {pendingRules, refetchAll, useConfigEditor, usePendingRules, type PendingFailure, type PendingRule} from '../../store';
import {toast} from '../../ui/ui';
import {useT} from '../../i18n';
import {byFile, insertRules, partialFailure, ruleFailure} from './pending';

// How many rules reached their files, and the failure that stopped the rest, if any.
export type ApplyOutcome = {written: number; failure: PendingFailure | null};
type FileOutcome = {written: boolean; failure: PendingFailure | null};

const reread = () => void refetchAll();
// Writes held rules one file at a time, each with its own validation, If-Match and reload, and stops at the first
// file that fails. Resolves to the outcome, or to undefined when cancelled or while another apply runs. Rules in a
// written file leave the held list, even when its reload failed; the rest stay for the next attempt.
export function usePendingApply() {
  const t = useT();
  const editor = useConfigEditor(reread, {rethrow: true});
  const busy = usePendingRules().applying;
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const writeFile = async (group: PendingRule[], signal: AbortSignal): Promise<FileOutcome | undefined> => {
    let sources: ConfigSource[] = [];
    let text: string | null | undefined;
    try {
      sources = (await getApi().config(signal)).sources;
      if (signal.aborted) return undefined;
      const source = sources.find(source => source.id === group[0].sourceId);
      const result = source && (await editor.apply(source, () => (text = insertRules(source, group))));
      if (!source || text === null) {
        reread();
        return {written: false, failure: {text: t('rule.stale'), lines: []}};
      }
      if (!result) return undefined;
      return result.diagnostics ? {written: false, failure: ruleFailure(null, result.diagnostics, sources, t)} : {written: true, failure: null};
    } catch (error) {
      if (signal.aborted) return undefined;
      const written = error instanceof LocalError && error.key === 'ui.writtenNotApplied';
      return {written, failure: ruleFailure(error, null, sources, t)};
    }
  };
  const writeAll = async (rules: PendingRule[], signal: AbortSignal): Promise<ApplyOutcome | undefined> => {
    let written = 0;
    for (const group of byFile(rules)) {
      const outcome = await writeFile(group, signal);
      if (!outcome) return undefined;
      if (outcome.written) pendingRules.remove(group.map(rule => rule.id));
      const done = outcome.written ? group.length : 0;
      if (outcome.failure) return {written: written + done, failure: partialFailure(outcome.failure, written, rules.length - written - done, t)};
      written += done;
    }
    return {written, failure: null};
  };
  const apply = async (rules: PendingRule[]) => {
    if (!pendingRules.begin()) return undefined;
    const controller = new AbortController();
    active.current = controller;
    try {
      return await writeAll(rules, controller.signal);
    } finally {
      if (active.current === controller) active.current = null;
      pendingRules.end();
    }
  };
  // Stops this hook's apply wherever it is, before the write or during it.
  const cancel = () => {
    active.current?.abort();
    editor.cancel();
  };
  return {apply, busy, cancel};
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
      const outcome = await apply(rules);
      if (!outcome) return;
      pendingRules.fail(outcome.failure);
      toast(outcome.failure ? 'negative' : 'positive', outcome.failure ? outcome.failure.text : t('rule.applied', {n: rules.length}));
    }
  };
}
