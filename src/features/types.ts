// `replace` rewrites the current history entry, for changes such as a row selection that should not pile up under Back.
export type Go = (page: string, query?: string, options?: {replace?: boolean}) => void;
export type PageProps = {go: Go; query: string};
