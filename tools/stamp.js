// Normalize appearance before first paint. The build fills the palette list and default from src/shell/palettes.ts, and
// the right-to-left scripts from src/i18n/direction.ts.
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
  var lang = read('doona-lang');
  var d = document.documentElement;
  var dark = scheme === 'dark' || (scheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  var palettes = '__PALETTES__';
  var parts = (palettes.includes(palette) ? palette : '__DEFAULT_PALETTE__').split('/');
  d.dataset.scheme = dark ? 'dark' : 'light';
  d.dataset.family = parts[0];
  d.dataset.flavour = parts[1];
  d.dataset.wordmark = read('doona-wordmark') === 'plain' ? 'plain' : 'gradient';
  d.lang = lang === 'zh-CN' ? 'zh-CN' : lang === 'en' ? 'en-US' : 'zh-TW';
  // The direction as textDirection in src/i18n/direction.ts decides it: the locale's text info, else its likely script.
  var rtlScripts = '__RTL_SCRIPTS__';
  var dir = 'ltr';
  try {
    var tag = new Intl.Locale(d.lang);
    var info = tag.getTextInfo ? tag.getTextInfo() : tag.textInfo;
    if (info && info.direction ? info.direction === 'rtl' : rtlScripts.includes(tag.maximize().script)) dir = 'rtl';
  } catch {
    // Left to right.
  }
  d.dir = dir;
})();
