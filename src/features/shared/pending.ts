import type {ConfigDiagnostic, ConfigSource} from '../../api/model';
import {ApiError, failureNotice, noticeText} from '../../api/error';
import {backendMessage, oneLine} from '../../i18n/backend';
import type {Translator} from '../../i18n';
import type {PendingFailure, PendingRule} from '../../store';
import {scanConfig} from '../../dae/text';
import {fileName, restartRequired} from '../../dae/sources';
import {dnsListEnd, dnsRuleAnchor, ruleAnchor, ruleLine, type RuleAnchor} from '../../dae/ruleText';

// Where a held rule goes in the text as it is now, or null when the rule it names is no longer where the list said. A
// rule for the end of a DNS list goes where that list ends now, and only while that is in the file it was held for.
function placeOf(sources: ConfigSource[], source: ConfigSource, rule: PendingRule, scan: ReturnType<typeof scanConfig>): RuleAnchor | null {
  if (rule.list === 'routing') return ruleAnchor(source, rule.before, scan);
  if (rule.before) return dnsRuleAnchor(source, rule.before, rule.list, scan);
  const end = dnsListEnd(sources, rule.list);
  return end?.source.id === source.id ? end.anchor : null;
}

// Every held rule for one of `sources`, each in its place, in one pass over the text; rules held for the same place
// keep the order they were held in, and rules for a list block the text lacks share one new block. Null when a place
// is gone.
export function insertRules(sources: ConfigSource[], source: ConfigSource, rules: PendingRule[]): string | null {
  const text = source.content ?? '';
  const scan = scanConfig(text);
  const inserts = rules.map(rule => ({rule, anchor: placeOf(sources, source, rule, scan)}));
  if (inserts.some(insert => !insert.anchor)) return null;
  inserts.sort((a, b) => a.anchor!.from - b.anchor!.from || a.rule.id - b.rule.id);
  let out = '';
  let at = 0;
  for (let i = 0; i < inserts.length;) {
    const from = inserts[i].anchor!.from;
    // The rules at one place, by the block they open, if any, in the order first held.
    const blocks = new Map<string, typeof inserts>();
    for (; i < inserts.length && inserts[i].anchor!.from === from; i++) {
      const key = inserts[i].anchor!.open ?? '';
      blocks.set(key, [...(blocks.get(key) ?? []), inserts[i]]);
    }
    out += text.slice(at, from);
    for (const [open, group] of blocks)
      out +=
        open +
        group.map(({rule, anchor}) => anchor!.indent + ruleLine(rule.condition, rule.outbound, rule.must) + '\n').join('') +
        (group[0].anchor!.close ?? '');
    at = from;
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
      const message = oneLine(backendMessage(item.code, item.message, t), t);
      const source = sources.find(source => source.id === item.source_id);
      return item.line === null ? message : t('config.atFile', {file: source ? fileName(source) : item.source_id, line: item.line, message});
    })
  };
}

// The held rules of one list as that list shows them, or null when it holds none.
export function pendingView(rules: PendingRule[], list: PendingRule['list'], failure: PendingFailure | null, t: Translator) {
  const files = byFile(rules).length;
  const shown = rules.filter(rule => rule.list === list);
  return shown.length
    ? {
        title: t('rule.pending', {n: shown.length}),
        files: files > 1 ? t('rule.pendingFiles', {n: files}) : null,
        failure,
        rows: shown.map(rule => ({
          id: rule.id,
          line: ruleLine(rule.condition, rule.outbound, rule.must),
          position: !rule.before || rule.before.kind === 'fallback' ? t('rule.positionEnd') : t('rule.positionBefore', {n: rule.before.index + 1})
        }))
      }
    : null;
}

// A failure after earlier files were written: those rules are in place and reloaded, so it leads with them.
export function partialFailure(failure: PendingFailure, written: number, held: number, t: Translator): PendingFailure {
  return written ? {text: t('rule.partial', {n: written, held}), lines: [failure.text, ...failure.lines]} : failure;
}
