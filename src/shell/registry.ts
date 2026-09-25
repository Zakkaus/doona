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
import {Activity} from '../features/activity/Activity';
import SpeedFast from '../ui/icons/SpeedFast';
import SettingsIcon from '../ui/icons/Settings';

// A lazy page renders and preloads through the same loader.
function lazyPage(load: () => Promise<{default: ComponentType<PageProps>}>) {
  const page = preloadable<PageProps>(load);
  return {Page: page.Component, preload: page.preload};
}

type Feature = {
  id: string;
  path: RoutePath;
  // hintKey: the question under a page title that tells similar pages apart.
  nav: {titleKey: Key; hintKey?: Key; Icon: typeof Home} | null;
  Page: ComponentType<PageProps>;
  // Absent for an eager page.
  preload?: () => Promise<unknown>;
  // `intent` pages load on hover, focus or click only, not in the idle warm-up.
  warm?: 'intent';
  // The page works without a backend, so it renders before capabilities arrive and in place of the sign-in form.
  offline?: true;
  shortcut?: string;
  requires: {resources?: ReadonlyArray<keyof Capabilities['resources']>};
};

// Keyed by path in navigation order, so a new route without a page fails to compile.
const definitions = {
  // The default page stays eager so first paint has no second round trip.
  activity: {shortcut: 'a', nav: {titleKey: 'nav.activity', Icon: SpeedFast}, Page: Activity, requires: {}},
  overview: {
    shortcut: 'o',
    nav: {titleKey: 'nav.overview', hintKey: 'hint.overview', Icon: Home},
    ...lazyPage(() => import('../features/overview/Overview').then(m => ({default: m.Overview}))),
    requires: {resources: ['runtime']}
  },
  connections: {
    shortcut: 'c',
    nav: {titleKey: 'nav.connections', hintKey: 'hint.connections', Icon: Link},
    ...lazyPage(() => import('../features/connections/Connections').then(m => ({default: m.Connections}))),
    requires: {resources: ['connections']}
  },
  dns: {
    nav: {titleKey: 'nav.dns', hintKey: 'hint.dns', Icon: GlobeGrid},
    ...lazyPage(() => import('../features/dns/Dns').then(m => ({default: m.Dns}))),
    requires: {resources: ['dns_query', 'dns_log', 'dns_cache']}
  },
  policies: {
    shortcut: 'p',
    nav: {titleKey: 'nav.policies', hintKey: 'hint.policies', Icon: Share},
    ...lazyPage(() => import('../features/policies/Policies').then(m => ({default: m.Policies}))),
    requires: {resources: ['groups']}
  },
  rules: {
    shortcut: 'r',
    nav: {titleKey: 'nav.rules', hintKey: 'hint.rules', Icon: ListBulleted},
    ...lazyPage(() => import('../features/rules/Rules').then(m => ({default: m.Rules}))),
    requires: {resources: ['routing_trace', 'flows', 'rules']}
  },
  nodes: {
    shortcut: 'n',
    nav: {titleKey: 'nav.nodes', hintKey: 'hint.nodes', Icon: Data},
    ...lazyPage(() => import('../features/nodes/Nodes').then(m => ({default: m.Nodes}))),
    requires: {resources: ['nodes', 'providers']}
  },
  config: {
    shortcut: 'g',
    nav: {titleKey: 'nav.config', hintKey: 'hint.config', Icon: FileText},
    ...lazyPage(() => import('../features/config/Config').then(m => ({default: m.Config}))),
    // The editor is the heaviest chunk.
    warm: 'intent',
    requires: {resources: ['config']}
  },
  events: {
    nav: {titleKey: 'nav.events', hintKey: 'hint.events', Icon: History},
    ...lazyPage(() => import('../features/events/Events').then(m => ({default: m.Events}))),
    requires: {resources: ['events']}
  },
  logs: {
    shortcut: 'l',
    nav: {titleKey: 'nav.logs', hintKey: 'hint.logs', Icon: TextAlignLeft},
    ...lazyPage(() => import('../features/logs/Logs').then(m => ({default: m.Logs}))),
    requires: {resources: ['logs']}
  },
  settings: {
    shortcut: 's',
    nav: {titleKey: 'nav.settings', Icon: SettingsIcon},
    ...lazyPage(() => import('../features/settings/Settings').then(m => ({default: m.Settings}))),
    offline: true,
    requires: {}
  }
} as const satisfies Record<RoutePath, Omit<Feature, 'id' | 'path'>>;

export const features: ReadonlyArray<Feature> = Object.entries(definitions).map(([path, definition]) => ({
  id: path,
  path: path as RoutePath,
  ...definition
}));

// A failed warm-up is not an error; the click loads it again.
export function warmPage(id: string) {
  void features
    .find(feature => feature.id === id)
    ?.preload?.()
    .catch(() => undefined);
}
// Preload the search dialog, then the other pages, one per idle slice (the callback may still run on its timeout while
// the page is busy).
export function warmAllPages() {
  const queue = [preloadSearch, ...features.filter(feature => feature.preload && feature.warm !== 'intent').map(feature => () => warmPage(feature.id))];
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

export function navAvailable(path: string, capabilities: Capabilities | undefined): boolean {
  const requires = features.find(feature => feature.path === path)?.requires;
  const resources = requires?.resources;
  return !capabilities || !resources || resources.some(key => capabilities.resources[key].available !== false);
}
