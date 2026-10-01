import {parseConditions} from '../../dae/conditions';
import {useMemo} from 'react';
import {useCapabilities, useConfig, useDnsRules} from '../../store';
import {useLang, useT} from '../../i18n';
import type {DnsRoutingRule} from '../../api/model';
import {dnsConditionKinds} from '../../dae/groups';
import type {PageProps} from '../../shell/routes';
import {dnsListEnd, dnsRuleAnchor, dnsRuleTarget, type DnsRuleListId} from '../../dae/ruleText';
import {dnsDictionaryView} from './view';
import {offered} from '../../api/capabilities';
import {answeredUpstream, dnsUpstreamChoices} from '../shared/rule';
import {useRuleEditor} from './useRuleEditor';
import {parseRuleSeed, ruleSeedParams, sectionSourceHref} from '../shared/link';
import {href, within} from '../../shell/route';
import type {DictionaryModel} from './useRuleList';

// One list of GET /dns/rules as the rule dictionary renders it. Edits splice the source that holds the rule, as
// routing rules do; there is no rule-level write endpoint.
export function useDnsRuleList({go, query}: PageProps, list: DnsRuleListId): DictionaryModel {
  const t = useT();
  const lang = useLang();
  const resources = useCapabilities().data?.resources;
  const available = offered(resources, 'dns_rules', {whileLoading: false});
  const rules = useDnsRules(available);
  // The sources are read wherever the configuration is, for the links to each rule's line; only writing needs `writable`.
  const readable = available && offered(resources, 'config', {whileLoading: false});
  const canWrite = readable && resources?.config.writable === true;
  const config = useConfig(readable);
  const retry = () => {
    config.refetch();
    rules.refetch();
  };
  const listed: DnsRoutingRule[] | undefined = rules.data?.[list];
  const table = useMemo(
    () => dnsDictionaryView(list, listed ?? [], rules.data?.generation_id, config.data?.sources ?? [], t, lang),
    [list, listed, rules.data?.generation_id, config.data, t, lang]
  );
  // Contextual links select the request or response editor and prefill its condition.
  const params = new URLSearchParams(query);
  const seed = (params.get('list') ?? 'request') === list ? params.get('add') : null;
  const edit = params.get('list') === list ? params.get('edit') : null;
  const edited = edit ? listed?.find(rule => rule.rule_id === edit) : undefined;
  const preset = parseRuleSeed(seed, dnsConditionKinds[list]);
  const linkedTarget = params.get('target');
  const target =
    linkedTarget &&
    (table.outbounds.find(item => item.id === linkedTarget)?.id ??
      answeredUpstream(dnsUpstreamChoices(listed ?? [], config.data?.sources ?? []), linkedTarget));
  const editor = useRuleEditor<DnsRoutingRule>({
    canWrite,
    listId: list,
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
      if (seed || edit) go('rules', within(query, {...ruleSeedParams, list: null}));
    },
    link: edit
      ? {key: `edit:${edit}`, open: edited ? {kind: 'edit', rule: edited, outbound: dnsRuleTarget(edited), must: false} : null}
      : {
          key: seed,
          open: preset && {
            kind: 'add',
            preset,
            outbound: params.has('target') ? (target ?? '') : undefined,
            before: params.get('before') ?? undefined
          }
        }
  });
  const responseSeed = parseConditions(params.get('response') ?? '', dnsConditionKinds.response)?.[0];
  return {
    ...editor.model,
    alternate:
      seed && list === 'request' && responseSeed
        ? {
            label: t('rule.list.response'),
            open: () => {
              editor.model.close();
              go(
                'rules',
                within(query, {list: 'response', add: `${responseSeed.kind}:${responseSeed.value}`, target: 'accept', before: 'end', response: null})
              );
            }
          }
        : undefined,
    table,
    copy: {
      label: t(list === 'request' ? 'rule.dns.request' : 'rule.dns.response'),
      empty: t('rule.dns.empty'),
      target: t('rule.dns.action'),
      placeholder: list === 'request' ? 'qname(geosite: cn)' : 'ip(geoip: private)',
      must: false,
      hits: false
    },
    loading: rules.loading && !rules.data,
    error: rules.error ?? config.error,
    retry,
    openSource: (query: string) => go('config', query),
    openEdit: id => {
      const rule = listed?.find(rule => rule.rule_id === id);
      if (rule) editor.open({kind: 'edit', rule, outbound: dnsRuleTarget(rule), must: false});
    }
  };
}

// Where the DNS lists are observed and where they are written: the resolution log, and the `dns` section of the
// configuration the rules were read from.
export function useDnsRuleLinks() {
  const resources = useCapabilities().data?.resources;
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  return {
    sourceHref: sectionSourceHref(config.data?.sources ?? [], 'dns'),
    logHref: offered(resources, 'dns_log', {whileLoading: false}) ? href('dns', {tab: 'log'}) : null
  };
}
