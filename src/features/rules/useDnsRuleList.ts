import {useMemo, useState} from 'react';
import {pendingRules, useCapabilities, useConfig, useDnsRules, usePendingRules} from '../../store';
import {pendingView} from '../shared/pending';
import {useApplyHeld} from '../shared/usePendingApply';
import {useLang, useT} from '../../i18n';
import type {DnsRoutingRule} from '../../api/model';
import {dnsConditionKinds} from '../../dae/groups';
import type {PageProps} from '../../shell/routes';
import {dnsListEnd, dnsRuleAnchor, dnsRuleTarget, type DnsRuleListId} from '../../dae/ruleText';
import {dnsDictionaryView} from './view';
import {offered} from '../../api/capabilities';
import {useRuleEditor} from './useRuleEditor';
import {parseRuleSeed, sectionSourceHref} from '../shared/link';
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
  // A seed from the DNS log prefills a request rule; the response list leaves it alone.
  const params = new URLSearchParams(query);
  const seed = list === 'request' ? params.get('add') : null;
  const edit = params.get('list') === list ? params.get('edit') : null;
  // A link names a rule by its list and id, as search does.
  const landed = params.get('list') === list ? params.get('rule') : null;
  const [picked, setPicked] = useState<{landed: string | null; row: string | null}>({landed, row: landed});
  const edited = edit ? listed?.find(rule => rule.rule_id === edit) : undefined;
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
      if (seed || edit) go('rules', within(query, {add: null, edit: null, list: null}));
    },
    link: edit
      ? {key: `edit:${edit}`, open: edited ? {kind: 'edit', rule: edited, outbound: dnsRuleTarget(edited), must: false} : null}
      : {key: seed, open: preset && {kind: 'add', preset}}
  });
  const held = usePendingRules();
  const applyHeld = useApplyHeld();
  // A link to review the held rules focuses the first DNS list that holds any.
  const reviewHeld = new URLSearchParams(query).has('held') && (list === 'request' || !held.rules.some(rule => rule.list === 'request'));
  return {
    ...editor.model,
    table,
    selected: picked.landed === landed ? picked.row : landed,
    select: (row: string | null) => setPicked({landed, row}),
    landed,
    copy: {
      label: t(list === 'request' ? 'rule.dns.request' : 'rule.dns.response'),
      empty: t('rule.dns.empty'),
      target: t('rule.dns.action'),
      placeholder: list === 'request' ? 'qname(geosite: cn)' : 'ip(geoip: private)',
      addHelp: t('rule.dns.addHelp'),
      must: false,
      hits: false
    },
    held: pendingView(held.rules, list, held.failure, config.data?.sources ?? [], t),
    discard: (id: number) => {
      if (!held.applying) pendingRules.remove([id]);
    },
    applying: held.applying,
    applyHeld: () => void applyHeld.apply(),
    reviewHeld,
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
  const readable = offered(resources, 'dns_rules', {whileLoading: false}) && offered(resources, 'config', {whileLoading: false});
  const config = useConfig(readable);
  const sources = config.data?.sources;
  const configHref = useMemo(() => (readable && sources ? sectionSourceHref(sources, 'dns') : null), [readable, sources]);
  return {
    logHref: offered(resources, 'dns_log', {whileLoading: false}) ? href('dns', {tab: 'log'}) : null,
    configHref
  };
}
