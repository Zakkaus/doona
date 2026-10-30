// A palette family's own stylesheet, which no other palette needs: Glass's (glass.ts) and Halloween's (halloween.ts).
// useAppearance.ts loads the family's module before one of its palettes applies. For a stored palette of the family
// the first-paint script (tools/stamp.js) has already linked the stylesheet; otherwise it is linked here at the same
// place, before every other stylesheet, where theme.css used to import Glass's, so it loses the same ties to later
// rules, and to pages' stylesheets loaded since, as it did there.
const linked = new Map<string, Promise<void>>();
export function linkStylesheet(family: string, href: string): Promise<void> {
  const known = linked.get(family);
  if (known) return known;
  const present = document.head.querySelector<HTMLLinkElement>(`link[data-${family}]`);
  if (present?.sheet) {
    const done = Promise.resolve();
    linked.set(family, done);
    return done;
  }
  // A link the first-paint script wrote but could not load is replaced.
  present?.remove();
  const loading = new Promise<void>((resolve, reject) => {
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = href;
    sheet.dataset[family] = '';
    sheet.onload = () => resolve();
    // Worded as Vite words a stylesheet it could not preload, so a stale build is recognised as one.
    sheet.onerror = () => {
      linked.delete(family);
      reject(new Error(`Unable to preload CSS for ${href}`));
    };
    document.head.insertBefore(sheet, document.head.querySelector('link[rel="stylesheet"], style'));
  });
  linked.set(family, loading);
  return loading;
}
