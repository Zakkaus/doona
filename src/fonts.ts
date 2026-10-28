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
// keeps the system font.
let common: Promise<unknown> | undefined;
const commonFaces = () => (common ??= import('./fonts.css').then(() => globalThis.document?.fonts?.load("1em 'Noto Sans TC'", 'doona')));
// Await the current catalogue part's glyphs before it renders. With optional faces, merely awaiting the stylesheet
// lets late subsets stay on a system fallback beside earlier Noto subsets, even after document.fonts.ready.
// One load covers every weight: each face is variable across 100–900. Missing archives or failed fonts stay optional.
export function loadFaces(fonts: string | null, face?: string, text?: string): Promise<unknown> {
  return fontsInstalled().then(ok =>
    ok
      ? Promise.all([commonFaces(), fonts && import(`./fonts-${fonts}.css`)])
          .then(() => (face ? globalThis.document?.fonts?.load(`1em '${face}'`, text) : undefined))
          .catch(() => undefined)
      : undefined
  );
}
