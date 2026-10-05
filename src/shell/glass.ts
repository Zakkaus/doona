import href from '../ui/styles/glass.css?url';
import {loadWallpaper} from './wallpaper';

// The Glass palettes' stylesheet and wallpaper, which no other palette needs; useAppearance.ts loads this module before
// a Glass palette applies. For a stored Glass palette the first-paint script (tools/stamp.js) has already linked the
// stylesheet; otherwise it is linked here at the same place, before every other stylesheet, where theme.css used to
// import it, so it loses the same ties to later rules, and to pages' stylesheets loaded since, as it did there.
let linked: Promise<void> | undefined;
export function linkStylesheet(): Promise<void> {
  if (linked) return linked;
  const present = document.head.querySelector<HTMLLinkElement>('link[data-glass]');
  if (present?.sheet) return (linked = Promise.resolve());
  // A link the first-paint script wrote but could not load is replaced.
  present?.remove();
  linked = new Promise<void>((resolve, reject) => {
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = href;
    sheet.dataset.glass = '';
    sheet.onload = () => resolve();
    // Worded as Vite words a stylesheet it could not preload, so a stale build is recognised as one.
    sheet.onerror = () => {
      linked = undefined;
      reject(new Error(`Unable to preload CSS for ${href}`));
    };
    document.head.insertBefore(sheet, document.head.querySelector('link[rel="stylesheet"], style'));
  });
  return linked;
}
void loadWallpaper();
