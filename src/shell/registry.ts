import type {Key} from '../i18n';
import type {ComponentType} from 'react';
import {preloadable} from '../ui/preloadable';
import type {Capabilities} from '../api/model';
import type {PageProps, RoutePath} from './routes';
import {preloadSearch} from './search/load';
import Home from '../ui/icons/Home';
import Link from '../ui/icons/Link';
import Share from '../ui/icons/Share';
import Data from '../ui/icons/Data';
import ListBulleted from '../ui/icons/ListBulleted';
import TextAlignLeft from '../ui/icons/TextAlignLeft';
import FileText from '../ui/icons/FileText';
import GlobeGrid from '../ui/icons/GlobeGrid';
import History from '../ui/icons/History';
// The default page stays eager so first paint has no second round trip.
import {Activity} from '../features/activity/Activity';
import SpeedFast from '../ui/icons/SpeedFast';
import SettingsIcon from '../ui/icons/Settings';

// Rendering and preloading share page loaders.
const pages = {
  overview: preloadable<PageProps>(() => import('../features/overview/Overview').then(m => ({default: m.Overview}))),
  connections: preloadable<PageProps>(() => import('../features/connections/Connections').then(m => ({default: m.Connections}))),
  policies: preloadable<PageProps>(() => import('../features/policies/Policies').then(m => ({default: m.Policies}))),
  nodes: preloadable<PageProps>(() => import('../features/nodes/Nodes').then(m => ({default: m.Nodes}))),
  rules: preloadable<PageProps>(() => import('../features/rules/Rules').then(m => ({default: m.Rules}))),
  config: preloadable<PageProps>(() => import('../features/config/Config').then(m => ({default: m.Config}))),
  dns: preloadable<PageProps>(() => import('../features/dns/Dns').then(m => ({default: m.Dns}))),
  logs: preloadable<PageProps>(() => import('../features/logs/Logs').then(m => ({default: m.Logs}))),
  events: preloadable<PageProps>(() => import('../features/events/Events').then(m => ({default: m.Events}))),
  settings: preloadable<PageProps>(() => import('../features/settings/Settings').then(m => ({default: m.Settings})))
};
const Overview = pages.overview.Component;
const Connections = pages.connections.Component;
const Policies = pages.policies.Component;
const NodesPage = pages.nodes.Component;
const Rules = pages.rules.Component;
const Config = pages.config.Component;
const Dns = pages.dns.Component;
const Logs = pages.logs.Component;
const Events = pages.events.Component;
const Settings = pages.settings.Component;
// A failed warm-up is not an error; the click loads it again.
export function warmPage(id: string) {
  void pages[id as keyof typeof pages]?.preload().catch(() => undefined);
}
// Preload the search dialog, then the other pages, one per idle slice (the callback may still run on its timeout while
// the page is busy); the config page carries the editor and loads on intent (hover, focus, click) only.
export function warmAllPages() {
  const queue = [
    preloadSearch,
    ...Object.keys(pages)
      .filter(id => id !== 'config')
      .map(id => () => warmPage(id))
  ];
  const next = () => {
    const warm = queue.shift();
    if (!warm) return;
    warm();
    if ('requestIdleCallback' in window) requestIdleCallback(next, {timeout: 3000});
    else setTimeout(next, 250);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(next, {timeout: 3000});
  else setTimeout(next, 1000);
}

type Feature = {
  id: string;
  path: RoutePath;
  // hintKey: the question under a page title that tells similar pages apart.
  nav: {group: Key; titleKey: Key; hintKey?: Key; Icon: typeof Home} | null;
  Page: ComponentType<PageProps>;
  shortcut?: string;
  requires: {resources?: ReadonlyArray<keyof Capabilities['resources']>};
};

const definitions = [
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
] as const satisfies ReadonlyArray<Feature>;

export const features: ReadonlyArray<Feature> = definitions;

export function navAvailable(path: string, capabilities: Capabilities | undefined): boolean {
  const requires = features.find(feature => feature.path === path)?.requires;
  const resources = requires?.resources;
  return !capabilities || !resources || resources.some(key => capabilities.resources[key].available !== false);
}
