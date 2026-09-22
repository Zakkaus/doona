// Normalize appearance before first paint; keep accepted palettes aligned with src/shell/view.ts.
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
  var palettes = [
    'rose-pine/main',
    'rose-pine/moon',
    'catppuccin/frappe',
    'catppuccin/macchiato',
    'catppuccin/mocha',
    'nord/nord',
    'kary/kary',
    'antd/antd',
    'arco/arco',
    'semi/semi',
    'glass/glass'
  ];
  var parts = (palettes.includes(palette) ? palette : 'rose-pine/moon').split('/');
  d.dataset.scheme = dark ? 'dark' : 'light';
  d.dataset.family = parts[0];
  d.dataset.flavour = parts[1];
  d.dataset.wordmark = read('doona-wordmark') === 'plain' ? 'plain' : 'gradient';
  d.lang = lang === 'zh-CN' ? 'zh-CN' : lang === 'en' ? 'en-US' : 'zh-TW';
})();
