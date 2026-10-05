import {holdsCredential} from '../api';
import {configManagement} from '../api/engines';
import type {Key} from '../i18n';
import type {ComponentType} from 'react';
import {preloadable} from '../ui/preloadable';
import type {PageShape} from '../ui/PageSkeleton';
import type {Capabilities} from '../api/model';
import type {PageProps, RoutePath} from './routes';
import {searchDialog} from './search/load';
import Home from '../ui/icons/Home';
import Link from '../ui/icons/Link';
import Share from '../ui/icons/Share';
import Data from '../ui/icons/Data';
import ListBulleted from '../ui/icons/ListBulleted';
import TextAlignLeft from '../ui/icons/TextAlignLeft';
import FileText from '../ui/icons/FileText';
import GlobeGrid from '../ui/icons/GlobeGrid';
import History from '../ui/icons/History';
import SpeedFast from '../ui/icons/SpeedFast';
import SettingsIcon from '../ui/icons/Settings';
import Shuffle from '../ui/icons/Shuffle';

function lazyPage(load: () => Promise<{default: ComponentType<PageProps>}>) {
  const page = preloadable<PageProps>(load);
  return {Page: page.Component, preload: page.preload};
}

// The default page is its own chunk. A tab that expects to be let in requests it beside the capabilities read the page
// waits for anyway: at once when it holds a bearer, and from startup once a tab without a profile is known to run the
// demo. Any other tab waits for the backend to accept it in warmAllPages, so the sign-in page fetches no page.
const activity = lazyPage(() => import('./widgets/Dashboard').then(m => ({default: m.Activity})));
export const preloadActivity = () => void activity.preload().catch(() => undefined);
if (holdsCredential()) preloadActivity();

type Feature = {
  id: string;
  path: RoutePath;
  // hintKey: the question under a page title that tells similar pages apart.
  nav: {titleKey: Key; hintKey?: Key; Icon: typeof Home} | null;
  Page: ComponentType<PageProps>;
  preload: () => Promise<unknown>;
  // `intent` pages load on hover, focus or click only, not in the idle warm-up.
  warm?: 'intent';
  // The page works without a backend, so it renders before capabilities arrive and in place of the sign-in form.
  offline?: true;
  // The page renders before capabilities arrive and draws its own first-load state.
  early?: true;
  shortcut?: string;
  // What the page's Skeleton draws while its code or its capabilities load (PageSkeleton).
  skeleton: PageShape;
  requires: {resources?: ReadonlyArray<keyof Capabilities['resources']>};
};

// Keyed by path in navigation order, so a new route without a page fails to compile.
const definitions = {
  activity: {
    shortcut: 'a',
    nav: {titleKey: 'nav.activity', Icon: SpeedFast},
    ...activity,
    // The dashboard draws its saved cards with their Skeletons while capabilities load; this stands in for its code.
    early: true,
    skeleton: [
      {cards: [94, 94, 94], columns: 3},
      {cards: [110, 110, 110, 110, 110], columns: 5},
      {cards: [226, 226], columns: '2fr 1fr'}
    ],
    requires: {}
  },
  overview: {
    skeleton: [{toolbar: 3}, {cards: [410, 410, 410], columns: 3}, {cards: [497, 497], columns: '2fr 1fr'}],
    shortcut: 'o',
    nav: {titleKey: 'nav.overview', hintKey: 'hint.overview', Icon: Home},
    ...lazyPage(() => import('../features/overview/Overview').then(m => ({default: m.Overview}))),
    requires: {resources: ['runtime']}
  },
  connections: {
    skeleton: [{tabs: 2}, {facts: 4}, {cards: [422, 308]}],
    shortcut: 'c',
    nav: {titleKey: 'nav.connections', hintKey: 'hint.connections', Icon: Link},
    ...lazyPage(() => import('../features/connections/Connections').then(m => ({default: m.Connections}))),
    requires: {resources: ['connections']}
  },
  flows: {
    skeleton: [{tabs: 2}, {toolbar: 2}, {cards: [560]}],
    shortcut: 'f',
    nav: {titleKey: 'nav.flows', hintKey: 'hint.flows', Icon: Shuffle},
    ...lazyPage(() => import('../features/flows/Flows').then(m => ({default: m.Flows}))),
    requires: {resources: ['flows']}
  },
  dns: {
    skeleton: [{tabs: 4}, {facts: 4}, {cards: [451, 451], columns: '2fr 1fr'}, {cards: [330, 330], columns: '2fr 1fr'}],
    shortcut: 'd',
    nav: {titleKey: 'nav.dns', hintKey: 'hint.dns', Icon: GlobeGrid},
    ...lazyPage(() => import('../features/dns/Dns').then(m => ({default: m.Dns}))),
    requires: {resources: ['dns_query', 'dns_log', 'dns_cache']}
  },
  policies: {
    skeleton: [{toolbar: 1}, {line: true}, {cards: [614, 142, 150, 150]}],
    shortcut: 'p',
    nav: {titleKey: 'nav.policies', hintKey: 'hint.policies', Icon: Share},
    ...lazyPage(() => import('../features/policies/Policies').then(m => ({default: m.Policies}))),
    requires: {resources: ['groups', 'config']}
  },
  rules: {
    skeleton: [{tabs: 3}, {toolbar: 3}, {table: 12}],
    shortcut: 'r',
    nav: {titleKey: 'nav.rules', hintKey: 'hint.rules', Icon: ListBulleted},
    ...lazyPage(() => import('../features/rules/Rules').then(m => ({default: m.Rules}))),
    requires: {resources: ['routing_trace', 'flows', 'rules', 'dns_rules']}
  },
  nodes: {
    skeleton: [{tabs: 2}, {toolbar: 2}, {cards: [224, 224], grid: true}, {line: true}, {toolbar: 4}, {table: 12}],
    shortcut: 'n',
    nav: {titleKey: 'nav.nodes', hintKey: 'hint.nodes', Icon: Data},
    ...lazyPage(() => import('../features/nodes/Nodes').then(m => ({default: m.Nodes}))),
    requires: {resources: ['nodes', 'providers']}
  },
  config: {
    skeleton: [{toolbar: 3, height: 24}, {tabs: 3}, {toolbar: 1}, {toolbar: 1, height: 16}, {block: 560}],
    shortcut: 'e',
    nav: {titleKey: 'nav.config', hintKey: 'hint.config', Icon: FileText},
    ...lazyPage(() => import('../features/config/Config').then(m => ({default: m.Config}))),
    // The editor is the heaviest chunk.
    warm: 'intent',
    requires: {resources: ['config']}
  },
  events: {
    skeleton: [{toolbar: 3}, {table: 10}],
    shortcut: 'v',
    nav: {titleKey: 'nav.events', hintKey: 'hint.events', Icon: History},
    ...lazyPage(() => import('../features/events/Events').then(m => ({default: m.Events}))),
    requires: {resources: ['events']}
  },
  logs: {
    skeleton: [{toolbar: 3}, {table: 10}],
    shortcut: 'l',
    nav: {titleKey: 'nav.logs', hintKey: 'hint.logs', Icon: TextAlignLeft},
    ...lazyPage(() => import('../features/logs/Logs').then(m => ({default: m.Logs}))),
    requires: {resources: ['logs']}
  },
  settings: {
    skeleton: [{line: true}, {cards: [222, 506, 378, 258]}],
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
    ?.preload()
    .catch(() => undefined);
}
// Once the backend accepts the tab: the default page at once, then the search dialog and the other pages, one per idle
// slice, all started within one shared deadline however busy the page is. Later calls do nothing. The root's data-warm
// tells a reload when no chunk is in flight: pending until the backend answers, running, then done once every warmed
// chunk has arrived or failed, or skip when the backend turned the tab away and nothing warms. index.html starts it at pending.
const WARM_DEADLINE_MS = 3000;
let warming = false;
export function warmAllPages() {
  if (warming) return;
  warming = true;
  const root = document.documentElement;
  root.dataset.warm = 'running';
  const loads: Array<Promise<unknown>> = [activity.preload().catch(() => undefined)];
  const queue = [searchDialog.preload, ...features.filter(feature => feature.warm !== 'intent').map(feature => feature.preload)];
  const deadline = performance.now() + WARM_DEADLINE_MS;
  const schedule = (delay: number) => {
    if ('requestIdleCallback' in window) requestIdleCallback(next, {timeout: Math.max(0, deadline - performance.now())});
    else setTimeout(next, delay);
  };
  const next = () => {
    loads.push(queue.shift()!().catch(() => undefined));
    if (queue.length) schedule(250);
    else void Promise.all(loads).then(() => (root.dataset.warm = 'done'));
  };
  schedule(1000);
}
export function skipWarmUp() {
  if (!warming) document.documentElement.dataset.warm = 'skip';
}

export function navAvailable(path: string, capabilities: Capabilities | undefined): boolean {
  if (path === 'config') {
    const management = configManagement(capabilities);
    if (management.export || management.import || management.revisions) return true;
  }
  const requires = features.find(feature => feature.path === path)?.requires;
  const resources = requires?.resources;
  return !capabilities || !resources || resources.some(key => capabilities.resources[key].available !== false);
}
