import type {Key} from '../i18n/messages';
import {lazy, type ComponentType} from 'react';
import type {Capabilities} from '../api/model';
import type {PageProps} from '../features/types';
import Home from '../ui/icons/Home';
import Link from '../ui/icons/Link';
import Share from '../ui/icons/Share';
import Data from '../ui/icons/Data';
import ListBulleted from '../ui/icons/ListBulleted';
import FileText from '../ui/icons/FileText';
import GlobeGrid from '../ui/icons/GlobeGrid';
import History from '../ui/icons/History';
import FileTextIcon from '../ui/icons/FileText';
import {Activity} from '../features/activity/Activity';
import SpeedFast from '../ui/icons/SpeedFast';
import {Settings} from '../features/settings/Settings';
import SettingsIcon from '../ui/icons/Settings';

const Overview = lazy(() => import('../features/overview/Overview').then(m => ({default: m.Overview})));
const Connections = lazy(() => import('../features/connections/Connections').then(m => ({default: m.Connections})));
const Policies = lazy(() => import('../features/policies/Policies').then(m => ({default: m.Policies})));
const NodesPage = lazy(() => import('../features/nodes/Nodes').then(m => ({default: m.Nodes})));
const Rules = lazy(() => import('../features/rules/Rules').then(m => ({default: m.Rules})));
const Config = lazy(() => import('../features/config/Config').then(m => ({default: m.Config})));
const Dns = lazy(() => import('../features/dns/Dns').then(m => ({default: m.Dns})));
const Logs = lazy(() => import('../features/logs/Logs').then(m => ({default: m.Logs})));
const Events = lazy(() => import('../features/events/Events').then(m => ({default: m.Events})));

type Feature = {
  id: string;
  path: string;
  // hintKey: the one question the page answers, shown under its title so the pages do not read as duplicates.
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
    requires: {resources: ['dns_query', 'dns_cache']}
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
    id: 'nodes',
    path: 'nodes',
    shortcut: 'n',
    nav: {group: 'grp.proxy', titleKey: 'nav.nodes', hintKey: 'hint.nodes', Icon: Data},
    Page: NodesPage,
    requires: {resources: ['providers']}
  },
  {
    id: 'rules',
    path: 'rules',
    shortcut: 'r',
    nav: {group: 'grp.proxy', titleKey: 'nav.rules', hintKey: 'hint.rules', Icon: ListBulleted},
    Page: Rules,
    requires: {resources: ['routing_trace', 'flows']}
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
    nav: {group: 'grp.system', titleKey: 'nav.logs', hintKey: 'hint.logs', Icon: FileTextIcon},
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
