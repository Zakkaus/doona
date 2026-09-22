import type {Key} from '../i18n/messages';
import {lazy, type ComponentType} from 'react';
import type {Capabilities} from '../api/model';
import type {PageProps} from '../features/types';
import Home from '../ui/icons/Home';
import Link from '../ui/icons/Link';
import Share from '../ui/icons/Share';
import Data from '../ui/icons/Data';
import ListBulleted from '../ui/icons/ListBulleted';
import TextAlignLeft from '../ui/icons/TextAlignLeft';
import FileText from '../ui/icons/FileText';
import GlobeGrid from '../ui/icons/GlobeGrid';
import History from '../ui/icons/History';
import {Activity} from '../features/activity/Activity';
import SpeedFast from '../ui/icons/SpeedFast';
import SettingsIcon from '../ui/icons/Settings';

// Rendering and preloading share page loaders; the default page stays eager.
const loaders = {
  overview: () => import('../features/overview/Overview').then(m => ({default: m.Overview})),
  connections: () => import('../features/connections/Connections').then(m => ({default: m.Connections})),
  policies: () => import('../features/policies/Policies').then(m => ({default: m.Policies})),
  nodes: () => import('../features/nodes/Nodes').then(m => ({default: m.Nodes})),
  rules: () => import('../features/rules/Rules').then(m => ({default: m.Rules})),
  config: () => import('../features/config/Config').then(m => ({default: m.Config})),
  dns: () => import('../features/dns/Dns').then(m => ({default: m.Dns})),
  logs: () => import('../features/logs/Logs').then(m => ({default: m.Logs})),
  events: () => import('../features/events/Events').then(m => ({default: m.Events})),
  settings: () => import('../features/settings/Settings').then(m => ({default: m.Settings}))
};
const Overview = lazy(loaders.overview);
const Connections = lazy(loaders.connections);
const Policies = lazy(loaders.policies);
const NodesPage = lazy(loaders.nodes);
const Rules = lazy(loaders.rules);
const Config = lazy(loaders.config);
const Dns = lazy(loaders.dns);
const Logs = lazy(loaders.logs);
const Events = lazy(loaders.events);
const Settings = lazy(loaders.settings);
// Loading a chunk twice costs nothing; a failed warm-up is not an error, the click loads it again.
export function warmPage(id: string) {
  void loaders[id as keyof typeof loaders]?.().catch(() => undefined);
}
// Preload other pages one per idle slice (the callback may still run on its timeout while the page is busy); the
// config page carries the editor and loads on intent (hover, focus, click) only.
export function warmAllPages() {
  const queue = Object.keys(loaders).filter(id => id !== 'config');
  const next = () => {
    const id = queue.shift();
    if (!id) return;
    warmPage(id);
    if ('requestIdleCallback' in window) requestIdleCallback(next, {timeout: 3000});
    else setTimeout(next, 250);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(next, {timeout: 3000});
  else setTimeout(next, 1000);
}

type Feature = {
  id: string;
  path: string;
  // The question shown beneath a page title to distinguish similar pages.
  nav: {group: Key; titleKey: Key; hintKey?: Key; Icon: typeof Home} | null;
  Page: ComponentType<PageProps>;
  shortcut?: string;
  requires: {resources?: Array<keyof Capabilities['resources']>};
};

export const features: Feature[] = [
  // The default page stays eager so first paint has no second round trip.
  {id: 'activity', path: 'activity', shortcut: 'a', nav: {group: 'grp.status', titleKey: 'nav.activity', Icon: SpeedFast}, Page: Activity, requires: {}},
  {
    id: 'overview',
    path: 'overview',
    shortcut: 'o',
    nav: {group: 'grp.status', titleKey: 'nav.overview', hintKey: 'hint.overview', Icon: Home},
    Page: Overview,
    requires: {resources: ['runtime']}
  },
  {
    id: 'connections',
    path: 'connections',
    shortcut: 'c',
    nav: {group: 'grp.network', titleKey: 'nav.connections', hintKey: 'hint.connections', Icon: Link},
    Page: Connections,
    requires: {resources: ['connections']}
  },
  {
    id: 'dns',
    path: 'dns',
    nav: {group: 'grp.network', titleKey: 'nav.dns', hintKey: 'hint.dns', Icon: GlobeGrid},
    Page: Dns,
    requires: {resources: ['dns_query', 'dns_log', 'dns_cache']}
  },
  {
    id: 'policies',
    path: 'policies',
    shortcut: 'p',
    nav: {group: 'grp.proxy', titleKey: 'nav.policies', hintKey: 'hint.policies', Icon: Share},
    Page: Policies,
    requires: {resources: ['groups']}
  },
  {
    id: 'rules',
    path: 'rules',
    shortcut: 'r',
    nav: {group: 'grp.proxy', titleKey: 'nav.rules', hintKey: 'hint.rules', Icon: ListBulleted},
    Page: Rules,
    requires: {resources: ['routing_trace', 'flows', 'rules']}
  },
  {
    id: 'nodes',
    path: 'nodes',
    shortcut: 'n',
    nav: {group: 'grp.proxy', titleKey: 'nav.nodes', hintKey: 'hint.nodes', Icon: Data},
    Page: NodesPage,
    requires: {resources: ['nodes', 'providers']}
  },
  {
    id: 'config',
    path: 'config',
    shortcut: 'g',
    nav: {group: 'grp.proxy', titleKey: 'nav.config', hintKey: 'hint.config', Icon: FileText},
    Page: Config,
    requires: {resources: ['config']}
  },
  {
    id: 'events',
    path: 'events',
    nav: {group: 'grp.system', titleKey: 'nav.events', hintKey: 'hint.events', Icon: History},
    Page: Events,
    requires: {resources: ['events']}
  },
  {
    id: 'logs',
    path: 'logs',
    shortcut: 'l',
    nav: {group: 'grp.system', titleKey: 'nav.logs', hintKey: 'hint.logs', Icon: TextAlignLeft},
    Page: Logs,
    requires: {resources: ['logs']}
  },
  {id: 'settings', path: 'settings', shortcut: 's', nav: {group: 'grp.system', titleKey: 'nav.settings', Icon: SettingsIcon}, Page: Settings, requires: {}}
];

export function navAvailable(path: string, capabilities: Capabilities | undefined): boolean {
  const requires = features.find(feature => feature.path === path)?.requires;
  const resources = requires?.resources;
  return !capabilities || !resources || resources.some(key => capabilities.resources[key].available !== false);
}

// Search applies the destination's tab availability before offering these links.
export const subpages: Array<{path: string; query: string; titleKey: Key}> = [
  {path: 'rules', query: 'tab=map', titleKey: 'rule.map'},
  {path: 'rules', query: 'tab=list', titleKey: 'rule.listTitle'},
  {path: 'rules', query: 'tab=flows', titleKey: 'rule.flows'},
  {path: 'rules', query: 'tab=trace', titleKey: 'rule.trace'},
  {path: 'dns', query: 'tab=query', titleKey: 'dns.query'},
  {path: 'dns', query: 'tab=log', titleKey: 'dns.log'},
  {path: 'dns', query: 'tab=cache', titleKey: 'ui.cache'},
  {path: 'config', query: 'tab=setup', titleKey: 'config.wizard'},
  {path: 'config', query: 'tab=source', titleKey: 'config.tabSource'},
  {path: 'config', query: 'tab=validate', titleKey: 'config.tabValidate'},
  {path: 'settings', query: 'card=backend', titleKey: 'settings.backend'},
  {path: 'settings', query: 'card=runtime', titleKey: 'settings.runtime'},
  {path: 'settings', query: 'card=actions', titleKey: 'settings.actions'},
  {path: 'settings', query: 'card=appearance', titleKey: 'settings.appearance'},
  {path: 'settings', query: 'card=about', titleKey: 'settings.about'}
];
