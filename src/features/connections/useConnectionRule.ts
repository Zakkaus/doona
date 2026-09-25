import {useState} from 'react';
import {useCapabilities, useConfig, useConfigEditor, useGroups, useRules} from '../../store';
import type {Connection} from '../../api/model';
import {offered} from '../../api/capabilities';
import {toast} from '../../ui/ui';
import {useT} from '../../i18n';
import {addRule, ruleAnchor, ruleLine, ruleOutbounds} from '../rules/source';
import {ruleFailure, rulePositions, ruleTargets, type RuleTarget} from './rule';

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
  const editor = useConfigEditor(retry, {rethrow: true});
  const sources = config.data?.sources ?? [];
  const positions = rulePositions(rules.data?.rules ?? [], sources, draft?.matched ?? null, t);
  const outbounds = ruleOutbounds(groups.data ?? []);
  const outbound = draft?.outbound || outbounds[0].id;
  const before = positions.some(position => position.id === draft?.before) ? draft!.before : positions[0]?.id;
  const target = draft?.targets[draft.target];
  const edit = (patch: Partial<Draft>) => {
    if (draft && !editor.busy) setDraft({...draft, ...patch});
  };
  const close = () => {
    // The abandoned write may still land, so the rules and sources are read again.
    if (editor.busy) {
      editor.cancel();
      retry();
    }
    setDraft(null);
    setFailure(null);
  };
  const stale = () => {
    toast('negative', t('rule.stale'));
    retry();
  };
  const submit = async () => {
    const rule = rules.data?.rules.find(rule => rule.rule_id === before);
    const source = sources.find(source => source.id === rule?.source?.source_id);
    const anchor = source && rule ? ruleAnchor(source, rule) : null;
    if (!target) return;
    if (!source || !anchor || rules.data?.generation_id !== config.data?.generation_id) return stale();
    setFailure(null);
    try {
      const result = await editor.apply(source, text => {
        const next = addRule(text, anchor, target.condition, outbound, false);
        if (next === null) stale();
        return next;
      });
      if (result?.diagnostics) setFailure({id: Date.now(), ...ruleFailure(null, result.diagnostics, sources, t)});
      else if (result) {
        toast('positive', t('rule.added'));
        setDraft(null);
      }
    } catch (error) {
      setFailure({id: Date.now(), ...ruleFailure(error, null, sources, t)});
    }
  };
  const targets = connection ? ruleTargets(connection) : [];
  return {
    canAdd: canWrite && targets.length > 0,
    canEdit: canWrite && !!connection?.rule_id,
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
      busy: !!editor.busy,
      loadError: rules.error ?? config.error,
      retry,
      unplaceable: !!rules.data && !!config.data && !positions.length,
      disabled: !target || !before,
      failure,
      submit: () => void submit(),
      close
    }
  };
}
