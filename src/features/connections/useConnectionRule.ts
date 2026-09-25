import {useState} from 'react';
import {pendingRules, useCapabilities, useConfig, useGroups, useRules} from '../../store';
import type {Connection} from '../../api/model';
import {offered} from '../../api/capabilities';
import {toast} from '../../ui/ui';
import {useT} from '../../i18n';
import {ruleAnchor, ruleLine, ruleOutbounds} from '../rules/source';
import {usePendingApply} from '../rules/usePendingApply';
import {rulePositions, ruleTargets, type RuleTarget} from './rule';

type Draft = {targets: RuleTarget[]; matched: string | null; target: number; outbound: string; before: string};
// The add-rule dialog of one connection. It keeps the connection's targets from when it opened, since the connection
// may leave the snapshot while the dialog is open, and reads the rules and sources only while it is open.
export function useConnectionRule(connection: Connection | undefined) {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const canWrite =
    offered(resources, 'rules', {whileLoading: false}) && offered(resources, 'config', {whileLoading: false}) && resources?.config.writable === true;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failure, setFailure] = useState<{id: number; text: string; lines: string[]} | null>(null);
  const open = !!draft;
  const rules = useRules(open);
  const config = useConfig(open);
  const groups = useGroups(open && offered(resources, 'groups', {whileLoading: false}));
  const retry = () => {
    rules.refetch();
    config.refetch();
  };
  const pending = usePendingApply();
  const sources = config.data?.sources ?? [];
  const positions = rulePositions(rules.data?.rules ?? [], sources, draft?.matched ?? null, t);
  const outbounds = ruleOutbounds(groups.data ?? []);
  const outbound = draft?.outbound || outbounds[0].id;
  const before = positions.some(position => position.id === draft?.before) ? draft!.before : positions[0]?.id;
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
    return {condition: target.condition, outbound, must: false, before: rule, sourceId: source.id};
  };
  const hold = () => {
    const rule = held();
    if (!rule) return;
    pendingRules.add(rule);
    toast('positive', t('rule.held'));
    close();
  };
  const applyNow = async () => {
    const rule = held();
    if (!rule) return;
    setFailure(null);
    const failure = await pending.apply([{...rule, id: 0}]);
    if (failure) setFailure({id: Date.now(), ...failure});
    else if (failure === null) {
      toast('positive', t('rule.added'));
      setDraft(null);
    }
  };
  const targets = connection ? ruleTargets(connection) : [];
  return {
    canAdd: canWrite && targets.length > 0,
    canShow: canWrite && !!connection?.rule_id,
    openAdd: () => {
      if (connection) setDraft({targets, matched: connection.rule_id, target: 0, outbound: '', before: ''});
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
      setBefore: (value: string) => edit({before: value}),
      preview: target ? ruleLine(target.condition, outbound) : '',
      busy: pending.busy,
      loadError: rules.error ?? config.error,
      retry,
      unplaceable: !!rules.data && !!config.data && !positions.length,
      disabled: !target || !before,
      failure,
      hold,
      applyNow: () => void applyNow(),
      close
    }
  };
}
