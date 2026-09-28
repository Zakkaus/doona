import {useState} from 'react';
import {pendingRules, useCapabilities, useConfig, useGroups, useRules} from '../../store';
import type {RoutingRule} from '../../api/model';
import {offered} from '../../api/capabilities';
import {getApi} from '../../api/index';
import {toast} from '../../ui/ui';
import {useT} from '../../i18n';
import {ruleAnchor, ruleLine, ruleOutbounds} from '../../dae/ruleText';
import {usePendingApply} from './usePendingApply';
import {within} from '../../shell/route';
import type {PageProps} from '../../shell/routes';
import {acceptedRule, pinnedPosition, ruleDialogReason, rulePositions, ruleTargets, type QuickRuleSeed, type RuleTarget} from './rule';

export type {QuickRuleSeed} from './rule';
type Pin = {generation: string; rule: RoutingRule};
type Draft = {targets: RuleTarget[]; matched: QuickRuleSeed['matched']; current: string | null; target: number; outbound: string; pin: Pin | null};
// The add-rule dialog, shared by the pages that observe traffic. It keeps the seed's targets from when it opened, since
// the item may leave its snapshot while the dialog is open, and reads the rules, sources and groups only while it is
// open.
export function useQuickRule(go: PageProps['go']) {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const canWrite =
    offered(resources, 'rules', {whileLoading: false}) && offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failure, setFailure] = useState<{id: number; text: string; lines: string[]} | null>(null);
  const open = !!draft;
  const rules = useRules(open);
  const config = useConfig(open);
  const hasGroups = offered(resources, 'groups', {whileLoading: false});
  const groups = useGroups(open && hasGroups);
  const retry = () => {
    rules.refetch();
    config.refetch();
    if (hasGroups) groups.refetch();
  };
  const pending = usePendingApply();
  const sources = config.data?.sources ?? [];
  const positions = rulePositions(rules.data?.rules ?? [], sources, draft?.matched ?? null, t);
  const outbounds = ruleOutbounds(groups.data ?? []);
  // Until the groups are read the outbound the traffic took may not be listed yet, so nothing is written.
  const groupsRead = !hasGroups || !!groups.data;
  // The outbound the traffic took, when the configuration names it, so the rule starts from what is routed now.
  // Otherwise the person chooses one: guessing the first would route the traffic somewhere it never went.
  const outbound = draft?.outbound || outbounds.find(item => item.id === draft?.current)?.id || '';
  const generation = rules.data?.generation_id;
  const pinOf = (id: string | undefined): Pin | null => {
    const rule = rules.data?.rules.find(rule => rule.rule_id === id);
    return rule && generation ? {generation, rule} : null;
  };
  // The position is pinned to a rule and generation as soon as it is known, so a reload never moves it silently.
  const {before, moved} = pinnedPosition(positions, draft?.pin ?? null, generation);
  const firstPin = draft && !draft.pin ? pinOf(before) : null;
  if (firstPin) setDraft({...draft!, pin: firstPin});
  const target = draft?.targets[draft.target];
  const edit = (patch: Partial<Draft>) => {
    if (draft && !pending.busy) setDraft({...draft, ...patch});
  };
  const close = () => {
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
  };
  // The rule to write, or null after reporting that the list it was placed in has changed.
  const held = () => {
    const rule = rules.data?.rules.find(rule => rule.rule_id === before);
    const source = sources.find(source => source.id === rule?.source?.source_id);
    if (!target || !rule || !source || !ruleAnchor(source, rule) || rules.data?.generation_id !== config.data?.generation_id) {
      stale();
      return null;
    }
    // Writing after the dialog said the matched rule changed takes the position it now shows.
    if (moved) setDraft({...draft!, pin: pinOf(before)});
    return {condition: target.condition, outbound, must: false, before: rule, sourceId: source.id};
  };
  const hold = () => {
    const rule = held();
    if (!rule) return;
    pendingRules.add(rule);
    // A held rule has only a local number, not a rule ID, so its link opens the held section rather than a rule.
    const review = () => go('rules', within('', {tab: 'list', held: '1'}));
    toast('positive', t('rule.held'), {action: {label: t('rule.reviewHeld'), onAction: review, closeOnAction: true}});
    close();
  };
  const applyNow = async () => {
    const rule = held();
    if (!rule) return;
    setFailure(null);
    const outcome = await pending.apply([{...rule, id: 0}]);
    if (!outcome) return;
    if (!outcome.written) {
      setFailure(current => ({id: (current?.id ?? 0) + 1, ...outcome.failure!}));
      return;
    }
    // A rule in its file closes the dialog even when the reload failed, so it is not inserted twice.
    setDraft(null);
    if (outcome.failure) {
      toast('negative', outcome.failure.text);
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
    toast('positive', t('rule.added'), {action: {label: t('rule.view'), onAction: () => void view(), closeOnAction: true}});
  };
  const loadError = rules.error ?? config.error ?? groups.error;
  const unplaceable = !!rules.data && !!config.data && !positions.length;
  const waiting = !target || !before || !groupsRead;
  const disabled = waiting || !outbound;
  const position = positions.find(position => position.id === before);
  return {
    canWrite,
    // Whether the dialog can write a rule for this seed.
    canAdd: (seed: QuickRuleSeed) => canWrite && ruleTargets(seed).length > 0,
    open: (seed: QuickRuleSeed) => {
      const targets = ruleTargets(seed);
      if (targets.length) setDraft({targets, matched: seed.matched, current: seed.outbound, target: 0, outbound: '', pin: null});
    },
    dialog: draft && {
      targets: draft.targets.length > 1 ? draft.targets.map((item, i) => ({id: String(i), label: t(`rule.kind.${item.kind}`)})) : null,
      target: String(draft.target),
      setTarget: (value: string) => edit({target: Number(value)}),
      outbounds,
      outbound,
      setOutbound: (value: string) => edit({outbound: value}),
      positions,
      before: before ?? '',
      setBefore: (value: string) => edit({pin: pinOf(value)}),
      preview: target ? (outbound ? ruleLine(target.condition, outbound) : target.condition) : '',
      busy: pending.busy,
      loadError,
      retry,
      moved,
      // Rules before the chosen place may take the traffic first unless it is the rule the traffic matched.
      earlier: !!position && !position.matched && !position.first,
      unplaceable,
      disabled,
      reason: ruleDialogReason({waiting, outbound: !!outbound, busy: pending.busy, failed: !!loadError, unplaceable}, t),
      failure,
      hold,
      applyNow: () => void applyNow(),
      close
    }
  };
}
export type QuickRuleDialog = ReturnType<typeof useQuickRule>['dialog'];
