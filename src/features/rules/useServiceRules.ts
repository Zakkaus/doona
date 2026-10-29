import {useEffect, useRef, useState} from 'react';
import {offered} from '../../api/capabilities';
import {outboundLabel} from '../../api/selectors';
import {useT} from '../../i18n';
import {matchPreset} from '../../dae/geodata';
import {isBuiltinOutbound} from '../../dae/vocab';
import {serviceSections} from '../../dae/templates';
import {within} from '../../shell/route';
import type {PageProps} from '../../shell/routes';
import {
  pendingRules,
  useCapabilities,
  usePendingRules,
  useConfig,
  useDnsRules,
  useGroups,
  useRules,
  useRuntimeSettings,
  type PendingFailure
} from '../../store';
import {failureToast} from '../shared/pending';
import {ruleOutbounds} from '../shared/rule';
import {ruleWritten} from '../shared/ruleNotice';
import {usePendingApply} from '../shared/usePendingApply';
import {sectionSourceHref} from '../shared/link';
import {serviceRules} from './service';
import {toast} from '../../ui/ui';
import type {SearchSection} from '../../ui/SearchSelect';
import type {CheckboxChoice} from '../../ui/CheckboxSet';

export type ServiceRulesModel = {
  available: boolean;
  open: boolean;
  selected: string[];
  outbound: string;
  steamCn: boolean;
  sections: SearchSection[];
  refusal: string | null;
  failure: (PendingFailure & {id: number}) | null;
  busy: boolean;
  disabled: boolean;
  loadError: Error | null;
  retry: () => void;
  steamOption: boolean;
  services: Array<{id: string; label: string; items: CheckboxChoice[]}>;
  sourceHref: string;
  dnsSkipped: boolean;
  dnsNote: boolean;
  launch: () => void;
  close: () => void;
  setSelected: (value: string[]) => void;
  setOutbound: (value: string) => void;
  setSteamCn: (value: boolean) => void;
  hold: () => void;
  applyNow: () => void;
};

const sectionLabels = {
  games: 'rule.service.games',
  media: 'rule.service.media',
  social: 'rule.service.social',
  ai: 'rule.service.ai',
  developer: 'rule.service.developer'
} as const;

export function useServiceRules({go, query}: PageProps): ServiceRulesModel {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const available = offered(resources, 'rules', {whileLoading: false}) && offered(resources, 'config', {whileLoading: false});
  const open = new URLSearchParams(query).get('service') === 'add';
  const config = useConfig(available && open);
  const rules = useRules(available && open);
  const dnsAvailable = offered(resources, 'dns_rules', {whileLoading: false});
  const dns = useDnsRules(available && open && dnsAvailable);
  const hasGroups = offered(resources, 'groups', {whileLoading: false});
  const groups = useGroups(available && open && hasGroups);
  const settings = useRuntimeSettings(open && offered(resources, 'runtime_settings', {whileLoading: false}));
  const sources = config.data?.sources ?? [];
  const pending = usePendingApply();
  const [selected, setSelected] = useState<string[]>([]);
  const [outbound, setOutbound] = useState('direct');
  const [steamCn, setSteamCn] = useState(false);
  const [failure, setFailure] = useState<(PendingFailure & {id: number}) | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);
  const sections = ruleOutbounds(groups.data ?? [], t).map(section => ({
    ...section,
    items: section.items.map(item => ({...item, label: outboundLabel(item.id, t)}))
  }));
  const stored = settings.data?.geodata;
  const preset = stored ? matchPreset({geosite: stored.geosite.urls, geoip: stored.geoip.urls}) : null;
  const held = usePendingRules().rules;
  const draft = serviceRules({sources, rules: rules.data?.rules ?? [], dnsRules: dns.data?.request ?? [], selected, outbound, steamCn, preset, held});
  const loading = !config.data || !rules.data || (dnsAvailable && !dns.data) || (hasGroups && !groups.data) || (settings.loading && !settings.data);
  const stale = config.data?.generation_id !== rules.data?.generation_id || (dnsAvailable && dns.data?.generation_id !== config.data?.generation_id);
  const refusal = !loading && (draft.refusal || !resources?.config.writable) ? t('rule.service.refused') : stale ? t('rule.stale') : null;
  const disabled = loading || !!refusal || !draft.rules.length || !sections.some(section => section.items.some(item => item.id === outbound));
  const retry = () => {
    config.refetch();
    rules.refetch();
    if (dnsAvailable) dns.refetch();
    if (hasGroups) groups.refetch();
    settings.refetch();
  };
  const close = () => {
    if (pending.busy) {
      pending.cancel();
      retry();
    }
    setFailure(null);
    go('rules', within(query, {service: null}));
  };
  const services = serviceSections.map(section => ({
    id: section.id,
    label: t(sectionLabels[section.id]),
    items: section.services.map(service => {
      const skipped = draft.skipped.find(item => item.service === service.code);
      return {
        id: service.code,
        label: service.code === 'category-games' ? t('rule.service.allGames') : service.code === 'bahamut' ? t('rule.template.group.bahamut') : service.name,
        isDisabled: !!skipped,
        description: skipped && t(skipped.missing ? 'rule.service.missing' : 'rule.service.alreadyPresent')
      };
    })
  }));
  const applyNow = async () => {
    if (disabled || pending.busy) return;
    setFailure(null);
    // Immediate batches must not remove any separately held rule's positive ID.
    const outcome = await pending.apply(draft.rules.map((rule, i) => ({...rule, id: i - draft.rules.length})));
    if (!outcome) return;
    if (!outcome.written) {
      if (mounted.current) setFailure(current => ({id: (current?.id ?? 0) + 1, ...outcome.failure!}));
      else toast(...failureToast(outcome.failure!));
      return;
    }
    close();
    if (outcome.failure) toast(...failureToast(outcome.failure));
    else {
      const notice = ruleWritten('rule.applied', t, outcome.written);
      toast('positive', notice.text, {detail: notice.detail});
    }
  };
  return {
    available,
    open,
    selected: [
      ...selected.filter(code => !draft.skipped.some(item => item.service === code)),
      ...draft.skipped.filter(item => !item.missing).map(item => item.service)
    ],
    outbound,
    steamCn,
    sections,
    refusal,
    failure,
    busy: pending.busy,
    disabled,
    loadError: config.error ?? rules.error ?? dns.error ?? groups.error ?? settings.error,
    retry,
    steamOption: selected.includes('steam') && !draft.skipped.some(item => item.service === 'steam') && !isBuiltinOutbound(outbound),
    services,
    sourceHref: sectionSourceHref(sources, 'routing'),
    dnsSkipped: draft.dnsSkipped,
    dnsNote: draft.rules.some(rule => rule.list === 'request'),
    launch: () => {
      setFailure(null);
      setSelected([]);
      setSteamCn(false);
      go('rules', within(query, {service: 'add'}));
    },
    close,
    setSelected,
    setOutbound,
    setSteamCn,
    hold: () => {
      if (disabled || pending.busy) return;
      draft.rules.forEach(rule => pendingRules.add(rule));
      const review = () => go('rules', within('', {tab: 'list', held: '1'}));
      toast('positive', t('rule.held'), {action: {label: t('rule.reviewHeld'), onAction: review, closeOnAction: true}});
      close();
    },
    applyNow: () => void applyNow()
  };
}
