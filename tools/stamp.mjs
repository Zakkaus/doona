import {readFileSync} from 'node:fs';

// The first-paint script with the build's values in place of its placeholders; vite.config.ts and the test share it.
export const stampScript = ({palettes, defaultPalette, locales, referenceLocale, rtlScripts, glassStylesheet = ''}) =>
  readFileSync(new URL('./stamp.js', import.meta.url), 'utf8')
    .replace("'__PALETTES__'", JSON.stringify(palettes))
    .replace("'__DEFAULT_PALETTE__'", JSON.stringify(defaultPalette))
    .replace("'__LOCALES__'", JSON.stringify(locales))
    .replace("'__REFERENCE_LOCALE__'", JSON.stringify(referenceLocale))
    .replace("'__RTL_SCRIPTS__'", JSON.stringify(rtlScripts))
    .replace("'__GLASS_STYLESHEET__'", JSON.stringify(glassStylesheet));
