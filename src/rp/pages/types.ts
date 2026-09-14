export type Go = (page: string, query?: string) => void;
export type PageProps = {go: Go, query: string};
