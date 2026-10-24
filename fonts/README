# Fonts

Noto Sans TC and Noto Sans SC are bundled from
[`@fontsource-variable/noto-sans-tc`](https://www.npmjs.com/package/@fontsource-variable/noto-sans-tc) and
[`@fontsource-variable/noto-sans-sc`](https://www.npmjs.com/package/@fontsource-variable/noto-sans-sc).
Their font name tables credit Copyright 2014–2021 Adobe, with Reserved Font Name “Source”.
They use the [SIL Open Font License 1.1](../LICENSES/OFL-1.1.txt).

`src/fonts.css`, `src/fonts-tc.css` and `src/fonts-sc.css` reference the packages' WOFF2 files directly. The local
`@font-face` declarations preserve the family names, variable weight range (100–900), `font-display: optional`,
metric overrides and unicode ranges. The TC and SC stylesheets load with their language catalogues; the browser
fetches only the slices needed for the page's text. No CDN or external font request is used.

Vite emits the referenced files with content hashes under `dist/fonts/`. These files remain outside the service
worker's shell precache and are cached on first use. The release's optional font archive contains this directory,
including `OFL.txt` and this document as `README`. The UI requests `fonts/README` once per page load and attaches the
`@font-face` stylesheets only when it answers, so without the archive nothing under `fonts/` is requested and the
application's font fallbacks apply.

When updating the packages, compare their `index.css` unicode ranges with the local declarations and retain the
Latin faces at the end of `fonts-tc.css`: they take precedence over overlapping ideograph slices.

Segmented-control labels use regular weight (400). At 14px and 1× device scale, Noto Sans TC's medium-weight strokes
merge inside dense ideographs such as `直`; regular weight keeps the counters open without changing the font size
or falling back to a different font.
