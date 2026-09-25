// Route ids and the page contract. A leaf module, so pages and the shell import it without an import cycle.
import type {Key} from '../i18n';

export const routePaths = ['activity', 'overview', 'connections', 'dns', 'policies', 'rules', 'nodes', 'config', 'events', 'logs', 'settings'] as const;
export type RoutePath = (typeof routePaths)[number];

// Every page belongs to one hub. The side navigation shows the hubs as its sections; a phone shows them in the bottom
// bar, with the open hub's pages above the content. The first page is where a hub opens until another is visited.
export const hubs = [
  {id: 'overview', titleKey: 'hub.overview', pages: ['overview', 'activity']},
  {id: 'traffic', titleKey: 'hub.traffic', pages: ['connections', 'dns', 'logs', 'events']},
  {id: 'routing', titleKey: 'hub.routing', pages: ['policies', 'nodes', 'rules']},
  {id: 'settings', titleKey: 'hub.settings', pages: ['settings', 'config']}
] as const satisfies ReadonlyArray<{id: string; titleKey: Key; pages: readonly RoutePath[]}>;

export function isRoutePath(path: string): path is RoutePath {
  return (routePaths as readonly string[]).includes(path);
}

// `replace` rewrites the current history entry, for changes such as a row selection that should not pile up under Back.
export type Go = (page: RoutePath, query?: string, options?: {replace?: boolean}) => void;
export type PageProps = {go: Go; query: string};
