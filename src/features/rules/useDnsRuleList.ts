import {useMemo} from 'react';
import {useCapabilities, useConfig, useDnsRules} from '../../store';
import {useLang, useT} from '../../i18n';
import type {DnsRoutingRule} from '../../api/model';
import {dnsConditionKinds} from '../../dae/groups';
import type {PageProps} from '../../shell/routes';
import {dnsListEnd, dnsRuleAnchor, type DnsRuleListId} from '../../dae/ruleText';
import {dnsDictionaryView} from './view';
import {offered} from '../../api/capabilities';
import {useRuleEditor} from './useRuleEditor';
import {parseRuleSeed} from '../shared/link';
import {within} from '../../shell/route';
import type {DictionaryModel} from './useRuleList';

// One list of GET /dns/rules as the rule dictionary renders it. Edits splice the source that holds the rule, as
// routing rules do; there is no rule-level write endpoint.
export function useDnsRuleList({go, query}: PageProps, list: DnsRuleListId): DictionaryModel {
  const t = useT();
  const lang = useLang();
  const resources = useCapabilities().data?.resources;
  const available = offered(resources, 'dns_rules', {whileLoading: false});
  const rules = useDnsRules(available);
  const canWrite = available && offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const config = useConfig(canWrite);
  const retry = () => {
    config.refetch();
    rules.refetch();
  };
  const listed: DnsRoutingRule[] | undefined = rules.data?.[list];
  const table = useMemo(
    () => dnsDictionaryView(list, listed ?? [], rules.data?.generation_id, config.data?.sources ?? [], t, lang),
    [list, listed, rules.data?.generation_id, config.data, t, lang]
  );
  // A seed from the DNS log prefills a request rule; the response list leaves it alone.
  const seed = list === 'request' ? new URLSearchParams(query).get('add') : null;
  const preset = useMemo(() => parseRuleSeed(seed, dnsConditionKinds.request), [seed]);
  const editor = useRuleEditor<DnsRoutingRule>({
    canWrite,
    list: rules.data && listed ? {rules: listed, generation_id: rules.data.generation_id} : undefined,
    config: config.data,
    retry,
    positions: table.positions,
    target: table.outbounds[0]?.id ?? '',
    anchor: (source, rule) => dnsRuleAnchor(source, rule, list),
    end: sources => dnsListEnd(sources, list),
    kinds: dnsConditionKinds[list],
    reasons: {conditionInvalid: 'rule.dns.conditionInvalid', targetMissing: 'rule.dns.actionMissing'},
    onClose: () => {
      if (seed) go('rules', within(query, {add: null}));
    },
    link: {key: seed, open: preset && {kind: 'add', preset}}
  });
  return {
    ...editor.model,
    table,
    copy: {
      label: t(list === 'request' ? 'rule.dns.request' : 'rule.dns.response'),
      empty: t('rule.dns.empty'),
      target: t('rule.dns.action'),
      placeholder: list === 'request' ? 'qname(geosite: cn)' : 'ip(geoip: private)',
      addHelp: t('rule.dns.addHelp'),
      must: false,
      hits: false
    },
    selected: null,
    select: () => {},
    held: null,
    discard: () => {},
    applying: false,
    loading: rules.loading && !rules.data,
    error: rules.error ?? config.error,
    retry,
    openSource: (query: string) => go('config', query)
  };
}
