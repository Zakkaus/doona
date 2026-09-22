// `replace` rewrites the current history entry, for changes such as a row selection that should not pile up under Back.
import type {RoutePath} from '../shell/registry';

export type Go = (page: RoutePath, query?: string, options?: {replace?: boolean}) => void;
export type PageProps = {go: Go; query: string};
