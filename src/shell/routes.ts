// Route ids and the page contract. A leaf module, so pages and the shell import it without an import cycle.
export const routePaths = ['activity', 'overview', 'connections', 'dns', 'policies', 'rules', 'nodes', 'config', 'events', 'logs', 'settings'] as const;
export type RoutePath = (typeof routePaths)[number];

export function isRoutePath(path: string): path is RoutePath {
  return (routePaths as readonly string[]).includes(path);
}

// `replace` rewrites the current history entry, for changes such as a row selection that should not pile up under Back.
export type Go = (page: RoutePath, query?: string, options?: {replace?: boolean}) => void;
export type PageProps = {go: Go; query: string};
