import {useT} from '../i18n';

// The current Glass wallpaper in small, drawn by glass.css with the same layers as the page.
export function WallpaperThumb() {
  const t = useT();
  return <span className="rp-wallpaper-thumb" role="img" aria-label={t('ui.wallpaperCurrent')} />;
}
