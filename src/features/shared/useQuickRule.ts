import {useState} from 'react';
import {pendingRules, useCapabilities, useConfig, useGroups, useRules} from '../../store';
import type {RoutingRule} from '../../api/model';
import {offered} from '../../api/capabilities';
import {toast} from '../../ui/ui';
import {useT} from '../../i18n';
import {ruleAnchor, ruleLine, ruleOutbounds} from '../../dae/ruleText';
import {usePendingApply} from './usePendingApply';
import {pinnedPosition, ruleDialogReason, rulePositions, ruleTargets, type RuleTarget} from './rule';

// What an origin knows about the traffic a new rule is for: its domain, destination and source IP, the outbound it
// took and the rule it matched. Each page that offers the dialog turns its own item into one.
export type QuickRuleSeed = {domain: string | null; dip: string | null; sip: string | null; outbound: string | null; matched: string | null};
type Pin = {generation: string; rule: RoutingRule};
type Draft = {targets: RuleTarget[]; matched: string | null; current: string | null; target: number; outbound: string; pin: Pin | null};
// The add-rule dialog, shared by the pages that observe traffic. It keeps the seed's targets from when it opened, since
// the item may leave its snapshot while the dialog is open, and reads the rules, sources and groups only while it is
// open. `review` opens the held rules.
export function useQuickRule(review: () => void) {
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
  // Until the groups are read the outbound the connection took may not be listed yet, so nothing is written.
  const groupsRead = !hasGroups || !!groups.data;
  // The outbound the connection took, when the configuration names it, so the rule starts from what is routed now.
  // Before the groups are read a group it took is not listed, so no fallback is preselected in its place.
  const outbound = draft?.outbound || outbounds.find(item => item.id === draft?.current)?.id || (groupsRead ? outbounds[0].id : '');
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
    // Writing after the dialog said the matched rule changed takes the first position it offered instead.
    if (moved) setDraft({...draft!, pin: pinOf(before)});
    return {condition: target.condition, outbound, must: false, before: rule, sourceId: source.id};
  };
  const hold = () => {
    const rule = held();
    if (!rule) return;
    pendingRules.add(rule);
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
      setFailure({id: Date.now(), ...outcome.failure!});
      return;
    }
    // A rule in its file closes the dialog even when the reload failed, so it is not inserted twice.
    toast(outcome.failure ? 'negative' : 'positive', outcome.failure ? outcome.failure.text : t('rule.added'));
    setDraft(null);
  };
  const loadError = rules.error ?? config.error ?? groups.error;
  const unplaceable = !!rules.data && !!config.data && !positions.length;
  const disabled = !target || !before || !groupsRead;
  return {
    // Whether the dialog can write a rule for this seed.
    canAdd: (seed: QuickRuleSeed) => canWrite && ruleTargets(seed).length > 0,
    open: (seed: QuickRuleSeed) => {
      const targets = ruleTargets(seed);
      if (targets.length) setDraft({targets, matched: seed.matched, current: seed.outbound, target: 0, outbound: '', pin: null});
    },
    dialog: draft && {
      targets: draft.targets.length > 1 ? draft.targets.map((item, i) => [String(i), t(`rule.kind.${item.kind}`)] as [string, string]) : null,
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
      unplaceable,
      disabled,
      reason: ruleDialogReason({disabled, busy: pending.busy, failed: !!loadError, unplaceable}, t),
      failure,
      hold,
      applyNow: () => void applyNow(),
      close
    }
  };
}
export type QuickRuleDialog = ReturnType<typeof useQuickRule>['dialog'];
