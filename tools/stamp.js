// Normalize appearance before first paint. The build fills the palette list and default from src/shell/palettes.ts, the
// language locales and reference locale from src/i18n/languages.ts, and the right-to-left scripts from src/i18n/direction.ts.
(function () {
  var read = function (key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  var scheme = read('doona-scheme');
  var palette = read('doona-palette');
  // Before each Glass material was a palette of its own, Glass kept its material in doona-glass. Read it once into the
  // palette, then drop it.
  var material = read('doona-glass');
  if (material !== null)
    try {
      if (palette === 'glass/glass' && (material === 'frosted' || material === 'tinted'))
        localStorage.setItem('doona-palette', (palette = 'glass/' + material));
      localStorage.removeItem('doona-glass');
    } catch {
      // Storage is unavailable; the palette stays as saved.
    }
  var lang = read('doona-lang');
  var d = document.documentElement;
  var dark = scheme === 'dark' || (scheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  var palettes = '__PALETTES__';
  var parts = (palettes.includes(palette) ? palette : '__DEFAULT_PALETTE__').split('/');
  d.dataset.scheme = dark ? 'dark' : 'light';
  d.dataset.family = parts[0];
  d.dataset.flavour = parts[1];
  d.dataset.wordmark = read('doona-wordmark') === 'plain' ? 'plain' : 'gradient';
  var locales = '__LOCALES__';
  // No saved language doona has: the browser's preferences, picked as browserLang in src/i18n/languages.ts picks them.
  // tools/stamp.test.mjs runs both on the same cases.
  if (!Object.hasOwn(locales, lang)) {
    var ids = Object.keys(locales);
    var wanted = navigator.languages?.length ? navigator.languages : [navigator.language];
    lang = null;
    for (var preference of wanted) {
      var want = preference.toLowerCase();
      var primary = want.split('-')[0];
      lang = ids.find(id => id.toLowerCase() === want || locales[id].toLowerCase() === want);
      if (!lang && primary === 'zh') lang = /-hans\b/.test(want) ? 'zh-CN' : /-(hant|tw|hk|mo)\b/.test(want) ? 'zh-TW' : 'zh-CN';
      if (!lang) lang = ids.find(id => id.toLowerCase().split('-')[0] === primary);
      if (lang) break;
    }
  }
  d.lang = locales[lang] ?? '__REFERENCE_LOCALE__';
  // The direction as pageDirection in src/i18n/direction.ts decides it: right to left in the mirrored layout, else the
  // locale's text info, else its likely script.
  var mirrored = read('doona-mirror') === 'on';
  var rtlScripts = '__RTL_SCRIPTS__';
  var dir = mirrored ? 'rtl' : 'ltr';
  if (!mirrored)
    try {
      var tag = new Intl.Locale(d.lang);
      var info = tag.getTextInfo ? tag.getTextInfo() : tag.textInfo;
      if (info && info.direction ? info.direction === 'rtl' : rtlScripts.includes(tag.maximize().script)) dir = 'rtl';
    } catch {
      // Left to right.
    }
  d.dir = dir;
  if (mirrored) d.dataset.mirror = '';
})();
