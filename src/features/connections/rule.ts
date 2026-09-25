import type {ConfigDiagnostic, ConfigSource, Connection, RoutingRule} from '../../api/model';
import {ApiError, failureNotice} from '../../api/error';
import {sourceIp} from '../../api/selectors';
import {ruleCondition, type ConditionKind} from '../../dae/groups';
import {backendMessage} from '../../i18n/backend';
import type {Translator} from '../../i18n';
import {fileName} from '../config/names';
import {ruleAnchor} from '../rules/source';

export type RuleTarget = {kind: ConditionKind; condition: string};
// A domain is matched exactly or with its subdomains; without one, the rule matches the destination IP.
export function ruleTargets(c: Pick<Connection, 'domain' | 'dst'>): RuleTarget[] {
  const ip = sourceIp(c.dst);
  const seeds: Array<[ConditionKind, string]> = c.domain
    ? [
        ['domain', c.domain],
        ['domainSuffix', c.domain]
      ]
    : ip
      ? [['dip', ip]]
      : [];
  return seeds.flatMap(([kind, value]) => {
    const condition = ruleCondition(kind, value);
    return condition ? [{kind, condition}] : [];
  });
}

// Before the rule the connection matched, so the new rule takes over its traffic, and before the first rule. Only a
// rule doona can locate in a writable source is offered; the first choice is the default.
export function rulePositions(rules: RoutingRule[], sources: ConfigSource[], matched: string | null, t: Translator) {
  const anchored = (rule: RoutingRule) => {
    const source = sources.find(source => source.id === rule.source?.source_id);
    return !!source?.writable && ruleAnchor(source, rule) !== null;
  };
  const hit = rules.find(rule => rule.rule_id === matched);
  const top = rules[0];
  return [...(hit ? [{rule: hit, label: t('conn.ruleBeforeMatched')}] : []), ...(top && top !== hit ? [{rule: top, label: t('conn.ruleTop')}] : [])]
    .filter(choice => anchored(choice.rule))
    .map(({rule, label}) => ({id: rule.rule_id, label, desc: rule.expression}));
}

// A refused write: the validation errors with their lines when the backend sent them, else what went wrong.
export function ruleFailure(error: unknown, diagnostics: ConfigDiagnostic[] | null, sources: ConfigSource[], t: Translator) {
  const found =
    diagnostics ??
    (error instanceof ApiError && error.status === 422 ? ((error.details as {diagnostics?: ConfigDiagnostic[]} | null)?.diagnostics ?? null) : null);
  if (!found) return {text: failureNotice(error, t, error => t('ui.writeFailed', {error})).text, lines: []};
  const errors = found.filter(item => item.level === 'error');
  const restart = errors.filter(item => item.code === 'restart-required').length;
  return {
    text: restart ? t('config.writeRestart', {n: restart}) : t('ui.writeInvalid', {n: errors.length}),
    lines: found.map(item => {
      const message = backendMessage(item.code, item.message, t);
      const source = sources.find(source => source.id === item.source_id);
      return item.line === null ? message : t('config.atFile', {file: source ? fileName(source) : item.source_id, line: item.line, message});
    })
  };
}
