import {engineOf, type EngineReason} from '../../api/engines';
import type {Capabilities, RuntimeSettings, Version} from '../../api/model';
import {formatList, type Key, type Lang, type Translator as LabelFn} from '../../i18n';
import {href} from '../../shell/route';
import {docsHref, type DocsAnchor} from './docs';
import {classifyLimits, type LimitCause, type LimitId} from './limitCauses';
import {featureLink, limitInfo, reasonHelp, reasonText, type LimitLink} from './limitHint';

export type {LimitCause};

export type LimitGroup = {
  cause: LimitCause;
  // The result in plain words, said once for every feature in the group.
  headline: string;
  items: {id: LimitId; label: string}[];
  // The features as one list; absent when the headline already names every one.
  features?: string;
  // One action beside the headline: help on the cause and how to lift it, or one link.
  help?: LimitHelp;
  link?: LimitLink;
};
export type LimitHelp = {
  label: string;
  text: string;
  // The engine's configuration text with the settings that lift the limit; absent when the engine names none.
  snippet?: string;
  // The docs on the cause, then each feature's requirements.
  links: LimitLink[];
};

// The headline of a not-running group that holds one service.
const runningAlone: Partial<Record<LimitId, Key>> = {
  probes: 'ov.lim.h.probes',
  subscriptions: 'ov.lim.h.subscriptions',
  reload: 'ov.lim.h.reload',
  config_validate: 'ov.lim.h.configValidate'
};

// The backend features that are off or limited, grouped by why as classifyLimits finds them, so each cause is explained
// once.
export function backendLimits(
  capabilities: Capabilities,
  version: Pick<Version, 'engine'> | undefined,
  t: LabelFn,
  lang: Lang,
  recording?: RuntimeSettings['recording']
): LimitGroup[] {
  const resources = capabilities.resources;
  const engine = engineOf(version);
  const reason = (id: LimitId) => engine.reason(id, capabilities, recording);
  const docs = (anchor: DocsAnchor, text: Key): LimitLink => ({href: docsHref(lang, anchor), text: t(text), external: true});
  const why = (text: Key, link?: LimitLink): LimitHelp => ({label: t('ov.lim.why'), text: t(text), links: link ? [link] : []});
  // The help for the reasons of a group's features: the first reason the engine gives explains the group, and the
  // settings of all of them go into one snippet.
  const helpFor = (reasons: (EngineReason | undefined)[]): LimitHelp | undefined => {
    const first = reasons.find(r => r !== undefined);
    const entry = first && reasonHelp[first.code];
    if (!entry) return undefined;
    const links = entry.docs ? [docs(...entry.docs)] : [];
    // Features with the same reason name its settings once.
    const settings = reasons
      .flatMap(r => (r && 'settings' in r ? r.settings : []))
      .filter((setting, i, all) => all.findIndex(other => other.key === setting.key) === i);
    const text = reasonText(t, first);
    return settings.length > 0 ? {label: t('ov.lim.howTo'), text, snippet: engine.snippet(settings), links} : {label: t('ov.lim.why'), text, links};
  };

  // Settings can turn flow recording on only through the record_flows switch.
  const flowsSwitch = resources.runtime_settings.available && (resources.runtime_settings.fields ?? []).includes('record_flows');

  const geodataHelp = (): LimitHelp | undefined => {
    const geodata = resources.geodata;
    if (geodata.assets?.length === 0) return why('ov.lim.geoNoAssets');
    const help = helpFor([reason('geodata')]);
    if (help) return help;
    if (geodata.configurable_sources === true) return why('ov.lim.geoNoUrl', {href: href('settings', {card: 'geodata'}), text: t('settings.geodata')});
    // Another backend says no more than the headline.
    return undefined;
  };
  // The headline, the ids it names (the features line is omitted when the headline already names every feature), and
  // the action. A help text that would only repeat the headline, as another backend's often would, is left out.
  const explain = (cause: LimitCause, items: LimitGroup['items']): {headline: string; named?: LimitId[]; help?: LimitHelp; link?: LimitLink} => {
    const n = items.length;
    const reasons = () => items.map(item => reason(item.id));
    switch (cause) {
      case 'configNotLoaded':
        return {headline: t('ov.lim.h.configNotLoaded'), named: ['config'], help: helpFor([reason('config')])};
      case 'configReadOnly':
        return {headline: t('ov.lim.h.configReadOnly'), named: ['config'], help: helpFor([reason('config')])};
      case 'mainReadOnly':
        return {headline: t('ov.lim.h.mainReadOnly'), named: ['manage'], help: helpFor([reason('manage')])};
      case 'startFlag':
        return {headline: t('ov.lim.h.startFlag', {n}), help: helpFor(reasons())};
      case 'stateDb':
        return {headline: t('ov.lim.h.stateDb'), named: ['geodata_settings'], help: helpFor(reasons())};
      case 'recordOff':
        return {headline: t('ov.lim.h.recordOff', {n}), help: helpFor(reasons())};
      case 'geodataUpdate':
        return {headline: t('ov.lim.h.geodataUpdate'), named: ['geodata'], help: geodataHelp()};
      case 'geodataUnreadable':
        return {headline: t('ov.lim.h.geodataUnreadable'), named: ['geodata'], help: helpFor(reasons())};
      case 'notRunning': {
        // A lone service the headline names; any other is counted and listed.
        const alone = n === 1 ? runningAlone[items[0].id] : undefined;
        return {
          headline: alone ? t(alone) : t('ov.lim.h.notRunning', {n}),
          named: alone ? [items[0].id] : [],
          help: helpFor(reasons())
        };
      }
      case 'flowsIdle': {
        // Auto records on demand and the Off mode never records; a backend that says neither leaves it at off.
        const code = reason('flows')?.code;
        return {
          headline: t(code === 'recorded-on-demand' ? 'ov.lim.h.flowsIdle' : code === 'mode-off' ? 'ov.lim.h.flowsModeOff' : 'ov.lim.h.flowsOff'),
          named: ['flows'],
          // Without the record_flows switch Settings has nothing to turn on.
          link: flowsSwitch ? {href: href('settings', {card: 'runtime'}), text: t('settings.runtime')} : undefined
        };
      }
      case 'notProvided': {
        // The headline counts what the build lacks; the features line lists the rest beside them.
        const lacks = reasons().filter(r => r?.code === 'build-lacks').length;
        return {
          headline: t(lacks > 0 ? 'ov.lim.h.notProvided' : 'ov.lim.h.notProvidedOther', {n: lacks || n}),
          link: lacks > 0 ? docs('honk-version', 'ov.lim.docsVersion') : undefined
        };
      }
    }
  };
  return classifyLimits(capabilities, version, recording).map(({cause, ids}) => {
    const items = ids.map(id => ({id, label: t(limitInfo[id][0])}));
    const {named = [], help, ...rest} = explain(cause, items);
    const others = items.filter(item => !named.includes(item.id));
    // A group with a popover links each feature's requirements after the docs on its cause.
    const links =
      help &&
      [...help.links, ...items.map(item => featureLink(t, lang, item.id, reason(item.id)?.code))].filter(
        (link, i, all) => all.findIndex(other => other.href === link.href) === i
      );
    return {
      cause,
      ...rest,
      help: help && {...help, links: links!},
      items,
      features:
        others.length > 0
          ? formatList(
              lang,
              items.map(item => item.label)
            )
          : undefined
    };
  });
}
