import type {Translator} from '../../i18n';
import type {DnsRuleListId, RuleAnchor} from '../../dae/ruleText';

// The end of a DNS list that writes no fallback, as a position: last in the list, or first in a new block when the list
// has none.
export function dnsEndPosition(anchor: RuleAnchor | undefined, list: DnsRuleListId, t: Translator): {label: string; desc: string | undefined} {
  return anchor?.open
    ? {label: t('rule.dns.positionNew', {name: list}), desc: t('rule.dns.positionNewHelp', {name: list})}
    : {label: t('rule.positionLast'), desc: undefined};
}

// What a successful rule write toasts. It is shown once the reload has settled, so the change is in effect, but a
// connection already open keeps the route it was given until it reconnects.
export function ruleWritten(key: 'rule.added' | 'rule.edited' | 'rule.removed' | 'rule.applied', t: Translator, n?: number) {
  return {text: n === undefined ? t(key) : t(key, {n}), detail: t('rule.keepsRoute')};
}
