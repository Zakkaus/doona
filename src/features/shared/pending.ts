import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {ApiError, failureNotice, noticeText} from '../../api/error';
import {backendMessage} from '../../i18n/backend';
import type {Translator} from '../../i18n';
import type {PendingFailure, PendingRule} from '../../store';
import {scanConfig} from '../../dae/text';
import {fileName, restartRequired} from '../../dae/sources';
import {ruleAnchor, ruleLine} from '../../dae/ruleText';

// Every held rule for one source, each in front of the rule it names, in one pass over the text; rules held before
// the same rule keep the order they were held in. Null when a rule it names is no longer where the list said.
export function insertRules(source: ConfigSource, rules: PendingRule[]): string | null {
  const text = source.content ?? '';
  const scan = scanConfig(text);
  const inserts = rules.map(rule => ({rule, anchor: ruleAnchor(source, rule.before, scan)}));
  if (inserts.some(insert => !insert.anchor)) return null;
  inserts.sort((a, b) => a.anchor!.from - b.anchor!.from || a.rule.id - b.rule.id);
  let out = '';
  let at = 0;
  for (const {rule, anchor} of inserts) {
    out += text.slice(at, anchor!.from) + anchor!.indent + ruleLine(rule.condition, rule.outbound, rule.must) + '\n';
    at = anchor!.from;
  }
  return out + text.slice(at);
}

// The held rules grouped by the file they go into, in the order the files were first used.
export function byFile(rules: PendingRule[]): PendingRule[][] {
  const files = new Map<string, PendingRule[]>();
  for (const rule of rules) files.set(rule.sourceId, [...(files.get(rule.sourceId) ?? []), rule]);
  return [...files.values()];
}

// A refused write: the validation errors with their lines when the backend sent them, else what went wrong.
export function ruleFailure(error: unknown, diagnostics: ConfigDiagnostic[] | null, sources: ConfigSource[], t: Translator): PendingFailure {
  const found =
    diagnostics ??
    (error instanceof ApiError && error.status === 422 ? ((error.details as {diagnostics?: ConfigDiagnostic[]} | null)?.diagnostics ?? null) : null);
  if (!found) return {text: noticeText(failureNotice(error, t, t('ui.writeFailed')), t), lines: []};
  const errors = found.filter(item => item.level === 'error').length;
  const restart = restartRequired(found);
  return {
    text: restart ? t('config.writeRestart', {n: restart}) : errors ? t('ui.writeInvalid', {n: errors}) : t('rule.refused'),
    lines: found.map(item => {
      const message = backendMessage(item.code, item.message, t);
      const source = sources.find(source => source.id === item.source_id);
      return item.line === null ? message : t('config.atFile', {file: source ? fileName(source) : item.source_id, line: item.line, message});
    })
  };
}

// The held rules as the rule list shows them, or null when nothing is held.
export function pendingView(rules: PendingRule[], failure: PendingFailure | null, t: Translator) {
  const files = byFile(rules).length;
  return rules.length
    ? {
        title: t('rule.pending', {n: rules.length}),
        files: files > 1 ? t('rule.pendingFiles', {n: files}) : null,
        failure,
        rows: rules.map(rule => ({
          id: rule.id,
          line: ruleLine(rule.condition, rule.outbound, rule.must),
          position: rule.before.kind === 'fallback' ? t('rule.positionEnd') : t('rule.positionBefore', {n: rule.before.index + 1})
        }))
      }
    : null;
}

// A failure after earlier files were written: those rules are in place and reloaded, so it leads with them.
export function partialFailure(failure: PendingFailure, written: number, held: number, t: Translator): PendingFailure {
  return written ? {text: t('rule.partial', {n: written, held}), lines: [failure.text, ...failure.lines]} : failure;
}
