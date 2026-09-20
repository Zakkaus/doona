// Runs inline in <head> before the stylesheet paints: the stored appearance and language land on <html>
// in the first frame. Mirrors readSettings and readLang in src; the app stamps again once it starts.
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
  var parts = (palette && palette.indexOf('/') > 0 ? palette : 'rose-pine/moon').split('/');
  d.dataset.scheme = dark ? 'dark' : 'light';
  d.dataset.family = parts[0];
  d.dataset.flavour = parts[1];
  d.dataset.wordmark = read('doona-wordmark') === 'plain' ? 'plain' : 'gradient';
  d.lang = lang === 'zh-CN' ? 'zh-CN' : lang === 'en' ? 'en-US' : 'zh-TW';
})();
