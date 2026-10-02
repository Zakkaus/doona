import {useEffect, useRef, useState} from 'react';
import {pendingRules, useCapabilities, useConfig, useDnsRules, useGroups, usePendingRules, useRules, type HeldRule, type PendingPlace} from '../../store';
import {offered} from '../../api/capabilities';
import {getApi} from '../../api/index';
import {toast} from '../../ui/ui';
import {useT} from '../../i18n';
import {dnsListEnd, dnsRuleAnchor, dnsRuleTarget, ruleAnchor, ruleLine} from '../../dae/ruleText';
import {usePendingApply} from './usePendingApply';
import {failureToast} from './pending';
import {within} from '../../shell/route';
import type {PageProps} from '../../shell/routes';
import {copyText} from './copy';
import {sectionSourceHref} from './link';
import {
  acceptedRule,
  dnsActions,
  dnsRulePositions,
  dnsUpstreamChoices,
  duplicateOf,
  pinnedPosition,
  quickRuleContext,
  ruleDialogReason,
  ruleKindLabels,
  ruleListLabels,
  ruleLists,
  ruleOutbounds,
  rulePositions,
  ruleTargets,
  typedCondition,
  type PositionPin,
  type QuickRuleSeed,
  type RuleList
} from './rule';
import {ruleWritten} from './ruleNotice';

export type {QuickRuleSeed} from './rule';
// `typed` narrows a DNS rule to the record type the seed asked for.
type Draft = {seed: QuickRuleSeed; lists: RuleList[]; list: RuleList; target: number; typed: boolean; outbound: string; pin: PositionPin | null};
type DnsQuery = NonNullable<NonNullable<QuickRuleSeed['dns']>['query']>;
// The add-rule dialog, shared by the pages that observe traffic and DNS. It keeps the seed from when it opened, since
// the item may leave its snapshot while the dialog is open, and reads the rules, sources and groups only while it is
// open. A DNS origin passes `queryAgain`, which Query again calls once a DNS rule is written.
export function useQuickRule(go: PageProps['go'], {queryAgain}: {queryAgain?: (query: DnsQuery) => void} = {}) {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const listable = offered(resources, 'rules', {whileLoading: false});
  const dnsListable = offered(resources, 'dns_rules', {whileLoading: false});
  const configWritable = offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failure, setFailure] = useState<{id: number; text: string; lines: string[]} | null>(null);
  const open = !!draft;
  const routing = draft?.list === 'routing';
  const dnsList = draft && draft.list !== 'routing' ? draft.list : null;
  // Without a writable configuration the dialog still opens, to copy the rule it would have written.
  const canWrite = configWritable && (routing ? listable : dnsListable);
  const rules = useRules(listable && open && draft.lists.includes('routing'));
  const dnsRules = useDnsRules(dnsListable && open && draft.lists.some(list => list !== 'routing'));
  const config = useConfig(configWritable && open);
  const hasGroups = offered(resources, 'groups', {whileLoading: false});
  const groups = useGroups(open && hasGroups && draft.lists.includes('routing'));
  const retry = () => {
    if (draft?.lists.includes('routing')) rules.refetch();
    if (dnsList) dnsRules.refetch();
    config.refetch();
    if (hasGroups && draft?.lists.includes('routing')) groups.refetch();
  };
  const pending = usePendingApply();
  // An apply outlives the page that started it; once the dialog is gone a failure cannot show inline.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);
  const sources = config.data?.sources ?? [];
  const listedDns = dnsList ? dnsRules.data?.[dnsList] : undefined;
  const generation = routing ? rules.data?.generation_id : dnsRules.data?.generation_id;
  const positions = routing
    ? rulePositions(rules.data?.rules ?? [], rules.data?.generation_id, sources, draft.seed.matched, t)
    : dnsList
      ? dnsRulePositions(dnsList, listedDns ?? [], sources, t)
      : [];
  const upstreams = dnsList ? dnsUpstreamChoices(listedDns ?? [], sources) : [];
  // A routing rule picks from sections, as a group's final outbound does; a DNS rule from its short list of actions.
  const sections = routing ? ruleOutbounds(groups.data ?? [], t) : null;
  const choices = sections
    ? sections.flatMap(section => section.items)
    : dnsList
      ? dnsActions(dnsList, [...new Set(upstreams.map(upstream => upstream.name))], t)
      : [];
  // Until the groups, or for a DNS rule the upstreams, are read, the target the traffic took may not be listed yet,
  // so nothing is written.
  const ready = routing ? !hasGroups || !!groups.data : !canWrite || !!config.data;
  // The target starts empty: starting from the outbound the traffic took would write a rule that changes nothing, and
  // guessing would route the traffic somewhere it never went. What happens now is shown beside the choice instead.
  const outbound = draft?.outbound ?? '';
  const pinOf = (id: string | undefined): PositionPin | null => {
    const position = positions.find(position => position.id === id);
    return position && generation ? {generation, id: position.id, desc: position.desc} : null;
  };
  // The position is pinned as soon as it is known, so a reload never moves it silently.
  const {before, moved} = pinnedPosition(positions, draft?.pin ?? null, generation);
  const firstPin = draft && !draft.pin ? pinOf(before) : null;
  if (firstPin) setDraft({...draft!, pin: firstPin});
  const targets = draft ? ruleTargets(draft.seed, draft.list) : [];
  const target = targets[draft?.target ?? 0];
  const type = dnsList ? (draft?.seed.dns?.type ?? null) : null;
  const condition = target ? typedCondition(target.condition, draft?.typed ? type : null) : '';
  const edit = (patch: Partial<Draft>) => {
    if (draft && !pending.busy) setDraft({...draft, ...patch});
  };
  const close = () => {
    // Closing the dialog withdraws this rule, so its write is cancelled; leaving the page only lets the write finish.
    // The abandoned write may still land, so the rules and sources are read again.
    if (pending.busy) {
      pending.cancel();
      retry();
    }
    setDraft(null);
    setFailure(null);
  };
  const stale = () => {
    toast('negative', t('rule.stale'));
    retry();
    return null;
  };
  // Where the rule goes in the list and file it was placed in, or null after reporting that they have changed.
  const place = (): (PendingPlace & {sourceId: string}) | null => {
    if (routing) {
      const rule = rules.data?.rules.find(rule => rule.rule_id === before);
      const source = sources.find(source => source.id === rule?.source?.source_id);
      return rule && source && ruleAnchor(source, rule) ? {list: 'routing', before: rule, sourceId: source.id} : null;
    }
    if (!dnsList) return null;
    if (before === 'end') {
      const end = dnsListEnd(sources, dnsList);
      return end && {list: dnsList, before: null, sourceId: end.source.id};
    }
    const rule = listedDns?.find(rule => rule.rule_id === before);
    const source = sources.find(source => source.id === rule?.source?.source_id);
    return rule && source && dnsRuleAnchor(source, rule, dnsList) ? {list: dnsList, before: rule, sourceId: source.id} : null;
  };
  // The rule to write, or null after reporting that the list it was placed in has changed.
  const written = (): HeldRule | null => {
    const placed = target && generation === config.data?.generation_id ? place() : null;
    if (!placed) return stale();
    // Writing after the dialog said the chosen place changed takes the position it now shows.
    if (moved) setDraft({...draft!, pin: pinOf(before)});
    return {...placed, condition, outbound, must: false};
  };
  const hold = () => {
    const rule = written();
    if (!rule) return;
    pendingRules.add(rule);
    // A held rule has only a local number, not a rule ID, so its link opens the held section of its list's tab.
    const review = () => go('rules', within('', {tab: rule.list === 'routing' ? 'list' : 'dns', held: '1'}));
    toast('positive', t('rule.held'), {action: {label: t('rule.reviewHeld'), onAction: review, closeOnAction: true}});
    close();
  };
  const applyNow = async () => {
    const rule = written();
    if (!rule) return;
    const query = draft?.seed.dns?.query;
    setFailure(null);
    const outcome = await pending.apply([{...rule, id: 0}]);
    if (!outcome) return;
    if (!outcome.written) {
      if (mounted.current) setFailure(current => ({id: (current?.id ?? 0) + 1, ...outcome.failure!}));
      else toast(...failureToast(outcome.failure!));
      return;
    }
    // A rule in its file closes the dialog even when the reload failed, so it is not inserted twice.
    setDraft(null);
    if (outcome.failure) {
      toast(...failureToast(outcome.failure));
      return;
    }
    if (rule.list !== 'routing') {
      // A DNS rule shows in what the resolver answers, so the origin can ask again.
      const again = query && queryAgain;
      const notice = ruleWritten('rule.added', t);
      toast('positive', notice.text, {
        detail: notice.detail,
        action: again ? {label: t('rule.queryAgain'), onAction: () => again(query), closeOnAction: true} : undefined
      });
      return;
    }
    // The reload that follows the write may not have landed yet, so View rule reads the list itself. Without the rule
    // there, it opens the list with nothing selected.
    const view = async () => {
      const listed = await getApi()
        .rules()
        .catch(() => null);
      const id = listed && acceptedRule(listed.rules, rule.condition, rule.outbound, rule.before);
      go('rules', within('', {tab: 'list', rule: id}));
    };
    const notice = ruleWritten('rule.added', t);
    toast('positive', notice.text, {detail: notice.detail, action: {label: t('rule.view'), onAction: () => void view(), closeOnAction: true}});
  };
  const listData = routing ? rules.data : dnsRules.data;
  const loadError = (routing ? rules.error : dnsRules.error) ?? config.error ?? (routing ? groups.error : null);
  const unplaceable = canWrite && !!listData && !!config.data && !positions.length;
  const waiting = !target || !before || !ready;
  const disabled = !canWrite || waiting || !outbound;
  const position = positions.find(position => position.id === before);
  const context = draft ? quickRuleContext({list: draft.list, seed: draft.seed, upstreams, outbound, position}) : null;
  const preview = target ? (outbound ? ruleLine(condition, outbound) : condition) : '';
  const held = usePendingRules().rules;
  const listed = routing
    ? (rules.data?.rules ?? []).map(rule => ({...rule, target: rule.outbound ?? ''}))
    : (listedDns ?? []).map(rule => ({...rule, target: dnsRuleTarget(rule)}));
  // A rule without its target is not a rule to copy.
  const copyReady = !!target && !!outbound;
  const copy = async () => {
    if (!copyReady) return;
    const copied = await copyText(preview);
    toast(copied ? 'positive' : 'negative', t(copied ? 'rule.copied' : 'rule.copyFailed'));
  };
  const kinds = targets.map(item => item.kind);
  return {
    // Whether the seed gives the dialog a condition to match; writing it is up to the dialog.
    canAdd: (seed: QuickRuleSeed) => ruleLists(seed, dnsListable).length > 0,
    open: (seed: QuickRuleSeed) => {
      const lists = ruleLists(seed, dnsListable);
      if (lists.length) setDraft({seed, lists, list: lists[0], target: 0, typed: false, outbound: '', pin: null});
    },
    dialog: draft && {
      lists: draft.lists.length > 1 ? draft.lists.map(id => ({id, label: t(ruleListLabels[id])})) : null,
      list: draft.list,
      // Another list has other conditions, targets and places, so they start over.
      setList: (value: string) => edit({list: value as RuleList, target: 0, typed: false, outbound: '', pin: null}),
      targets:
        targets.length > 1
          ? targets.map((item, i) => ({
              id: String(i),
              label: t(ruleKindLabels[item.kind]),
              // Two conditions of one kind, such as two answered addresses, differ by their text.
              ...(kinds.indexOf(item.kind) !== kinds.lastIndexOf(item.kind) ? {desc: item.condition} : {})
            }))
          : null,
      target: String(draft.target),
      setTarget: (value: string) => edit({target: Number(value)}),
      // A DNS rule may be narrowed to the record type the query asked for.
      type: type && t('rule.dns.onlyType', {type}),
      typed: draft.typed,
      setTyped: (typed: boolean) => edit({typed}),
      targetLabel: t(routing ? 'ui.outbound' : 'rule.dns.action'),
      outbounds: choices,
      outboundSections: sections,
      outbound,
      setOutbound: (value: string) => edit({outbound: value}),
      current: context?.current ? t('rule.current', {value: context.current}) : null,
      unchanged: !!context?.unchanged,
      positions,
      before: before ?? '',
      setBefore: (value: string) => edit({pin: pinOf(value)}),
      preview,
      // Advisory: the same condition and target elsewhere still leaves the choice, since position sets precedence.
      duplicate: target && outbound ? duplicateOf(draft.list, listed, held, condition, outbound, t) : null,
      writable: canWrite,
      // Copying stands in for writing when no file can take the rule.
      copyable: !canWrite || unplaceable,
      copyReady,
      copy: () => void copy(),
      busy: pending.busy,
      loadError,
      retry,
      moved,
      // Rules before the chosen place may take the traffic first unless it is the rule the traffic matched.
      earlier: !!position && !position.matched && !position.first,
      beforeMatched: !!context?.beforeMatched,
      unplaceable,
      // A DNS list with no place has no single dns routing section to add it to; the section is written in the
      // configuration, which opens beside the dialog so the rule stays here.
      configHref: unplaceable && dnsList ? sectionSourceHref(sources, 'dns') : null,
      disabled,
      reason: ruleDialogReason({readOnly: !canWrite, waiting, outbound: !!outbound, busy: pending.busy, failed: !!loadError, unplaceable, dns: !!dnsList}, t),
      failure,
      hold,
      applyNow: () => void applyNow(),
      close
    }
  };
}
export type QuickRuleDialog = ReturnType<typeof useQuickRule>['dialog'];
