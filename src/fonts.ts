// The Noto faces ship in an optional archive (docs/fonts.md) whose files land in fonts/. Their stylesheets are attached
// only once that archive's README answers, so a UI installed without it declares no face and requests nothing under
// fonts/; the body's font stack then falls through to the system font. The development server serves the faces from
// the packages, where no README is emitted. The probe is a GET so the service worker caches it with the faces, and a
// host that answers missing paths with the page is not taken for one with the archive. Its body is read: a response the
// worker relays stays open until the page consumes it.
let installed: Promise<boolean> | undefined;
const fontsInstalled = () =>
  (installed ??= import.meta.env.DEV
    ? Promise.resolve(true)
    : fetch('fonts/README')
        .then(response => response.arrayBuffer().then(() => response.ok && !response.headers.get('content-type')?.includes('html')))
        .catch(() => false));
// The faces every language uses, with their Latin slice loaded: with `optional`, text laid out before a face arrives
// keeps the system font, and the Latin slice used to load from the first paint, while the faces were in the page's own
// stylesheet.
let common: Promise<unknown> | undefined;
const commonFaces = () => (common ??= import('./fonts.css').then(() => globalThis.document?.fonts?.load("1em 'Noto Sans TC'", 'doona')));
// The faces every language uses, then the ideograph faces of the named src/fonts-<name>.css; resolves once both are
// declared or left out. A stylesheet that fails to load leaves the text to the system font.
export function loadFaces(fonts: string | null): Promise<unknown> {
  return fontsInstalled().then(ok => (ok ? Promise.all([commonFaces(), fonts && import(`./fonts-${fonts}.css`)]).catch(() => undefined) : undefined));
}
