import type {Key} from '../i18n/messages';
import {lazy, type ComponentType} from 'react';
import type {Capabilities} from '../api/model';
import type {PageProps} from '../features/types';
import {Activity} from '../features/activity/Activity';
import SpeedFast from '../ui/icons/SpeedFast';
import Home from '../ui/icons/Home';
import Link from '../ui/icons/Link';
import DeviceAll from '../ui/icons/DeviceAll';
import Share from '../ui/icons/Share';
import ListBulleted from '../ui/icons/ListBulleted';
import GlobeGrid from '../ui/icons/GlobeGrid';
import Data from '../ui/icons/Data';
import FileText from '../ui/icons/FileText';
import History from '../ui/icons/History';
import CheckmarkCircle from '../ui/icons/CheckmarkCircle';
import {Settings} from '../features/settings/Settings';
import type {BackendKind} from '../features/settings/settings';
import SettingsIcon from '../ui/icons/Settings';

const Overview = lazy(() => import('../features/overview/Overview').then(m => ({default: m.Overview})));
const Connections = lazy(() => import('../features/connections/Connections').then(m => ({default: m.Connections})));
const Flows = lazy(() => import('../features/flows/Flows').then(m => ({default: m.Flows})));
const Clients = lazy(() => import('../features/clients/Clients').then(m => ({default: m.Clients})));
const Policies = lazy(() => import('../features/policies/Policies').then(m => ({default: m.Policies})));
const Rules = lazy(() => import('../features/rules/Rules').then(m => ({default: m.Rules})));
const Dns = lazy(() => import('../features/dns/Dns').then(m => ({default: m.Dns})));
const Events = lazy(() => import('../features/events/Events').then(m => ({default: m.Events})));
const Resources = lazy(() => import('../features/clash-compat/Resources').then(m => ({default: m.Resources})));
const ConfigPage = lazy(() => import('../features/clash-compat/ConfigPage').then(m => ({default: m.ConfigPage})));
const Validate = lazy(() => import('../features/clash-compat/Validate').then(m => ({default: m.Validate})));

type Feature = {
  id: string;
  path: string;
  nav: {group: Key; titleKey: Key; Icon: typeof Home} | null;
  Page: ComponentType<PageProps & {backend: BackendKind}>;
  requires: {resources?: Array<keyof Capabilities['resources']>; backend?: BackendKind};
  compat?: true;
};

export const features: Feature[] = [
  {id: 'activity', path: 'activity', nav: {group: 'grp.status', titleKey: 'nav.activity', Icon: SpeedFast}, Page: Activity, requires: {}},
  {id: 'overview', path: 'overview', nav: {group: 'grp.status', titleKey: 'nav.overview', Icon: Home}, Page: Overview, requires: {resources: ['runtime']}},
  {
    id: 'connections',
    path: 'connections',
    nav: {group: 'grp.network', titleKey: 'nav.connections', Icon: Link},
    Page: Connections,
    requires: {resources: ['connections']}
  },
  {id: 'flows', path: 'flows', nav: {group: 'grp.network', titleKey: 'nav.flows', Icon: ListBulleted}, Page: Flows, requires: {resources: ['flows']}},
  {id: 'clients', path: 'clients', nav: {group: 'grp.network', titleKey: 'nav.clients', Icon: DeviceAll}, Page: Clients, requires: {}},
  {id: 'policies', path: 'policies', nav: {group: 'grp.proxy', titleKey: 'nav.policies', Icon: Share}, Page: Policies, requires: {resources: ['groups']}},
  {
    id: 'rules',
    path: 'rules',
    nav: {group: 'grp.proxy', titleKey: 'nav.routingTrace', Icon: ListBulleted},
    Page: Rules,
    requires: {resources: ['routing_trace']}
  },
  {id: 'dns', path: 'dns', nav: {group: 'grp.proxy', titleKey: 'nav.dns', Icon: GlobeGrid}, Page: Dns, requires: {resources: ['dns_query', 'dns_cache']}},
  {
    id: 'resources',
    path: 'resources',
    nav: {group: 'grp.system', titleKey: 'nav.resources', Icon: Data},
    Page: Resources,
    requires: {backend: 'clash'},
    compat: true
  },
  {
    id: 'config',
    path: 'config',
    nav: {group: 'grp.system', titleKey: 'nav.config', Icon: FileText},
    Page: ConfigPage,
    requires: {backend: 'clash'},
    compat: true
  },
  {
    id: 'validate',
    path: 'validate',
    nav: {group: 'grp.system', titleKey: 'nav.validate', Icon: CheckmarkCircle},
    Page: Validate,
    requires: {backend: 'clash'},
    compat: true
  },
  {id: 'events', path: 'events', nav: {group: 'grp.system', titleKey: 'nav.events', Icon: History}, Page: Events, requires: {resources: ['events']}},
  {id: 'settings', path: 'settings', nav: {group: 'grp.system', titleKey: 'nav.settings', Icon: SettingsIcon}, Page: Settings, requires: {}}
];

export function navAvailable(path: string, capabilities: Capabilities | undefined, backend: BackendKind): boolean {
  const requires = features.find(feature => feature.path === path)?.requires;
  if (requires?.backend && requires.backend !== backend) return false;
  const resources = requires?.resources;
  return !capabilities || !resources || resources.some(key => capabilities.resources[key].available !== false);
}
