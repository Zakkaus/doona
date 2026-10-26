// How many opened pages stay mounted, the shown one included. A hidden page holds its tree and DOM and runs no effects,
// but it re-renders at low priority when a shared context changes; five covers going back and forth between the pages
// of a task.
const KEPT_PAGES = 5;

export type KeptPage<P> = {id: string; page: P; query: string; used: number};

// The pages to keep once `shown` is on screen, in the order they were first opened so a page never moves in the DOM.
// Showing a page again, or with another query, marks it most recently used; past `limit` the least recently used
// one goes. A hidden page keeps the query it was last shown with. An id always names the same page, so `page` is
// taken when the page is first kept. Returns `kept` itself when nothing changes.
export function keepPages<P>(kept: ReadonlyArray<KeptPage<P>>, shown: Omit<KeptPage<P>, 'used'> | null, limit = KEPT_PAGES): ReadonlyArray<KeptPage<P>> {
  if (!shown) return kept;
  const top = kept.reduce((max, entry) => Math.max(max, entry.used), 0);
  const at = kept.find(entry => entry.id === shown.id);
  if (at && at.used === top && at.query === shown.query) return kept;
  const entry = {...shown, page: at?.page ?? shown.page, used: top + 1};
  const next = at ? kept.map(item => (item === at ? entry : item)) : [...kept, entry];
  if (next.length <= limit) return next;
  const oldest = next.reduce((least, item) => (item.used < least.used ? item : least));
  return next.filter(item => item !== oldest);
}
