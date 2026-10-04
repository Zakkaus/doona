import {useEffect, useId, useRef, useState} from 'react';
import {useT, type Key} from '../../i18n';
import {Button, InlineAlert, Switch} from '../../ui/ui';
import {FileButton} from '../../ui/FileButton';
import {Slider} from '../../ui/Slider';
import {WallpaperThumb} from '../../ui/WallpaperThumb';
import {DEFAULT_DIM, MAX_DIM, setWallpaper, useWallpaper, wallpaperState} from '../../shell/wallpaper';
import {prepareWallpaper, WallpaperError, type WallpaperProblem} from './wallpaperImage';

const problems: Record<WallpaperProblem, Key> = {
  type: 'settings.wallpaperNotImage',
  size: 'settings.wallpaperTooLarge',
  decode: 'settings.wallpaperUnreadable'
};
const percent: Intl.NumberFormatOptions = {style: 'percent'};

// The Glass palettes' wallpaper: a custom image in place of the built-in shapes, with an optional veil and its strength.
export function WallpaperSettings() {
  const t = useT();
  const {wallpaper, stored} = useWallpaper();
  const [problem, setProblem] = useState<WallpaperProblem | null>(null);
  const [pending, setPending] = useState(false);
  const labelId = useId();
  const helpId = useId();
  // Each pick gets a number; a reset, another pick or leaving the row drops an image still being prepared.
  const pick = useRef(0);
  useEffect(() => () => void pick.current++, []);
  const choose = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const current = ++pick.current;
    setProblem(null);
    setPending(true);
    let problem: WallpaperProblem | null = null;
    try {
      const image = await prepareWallpaper(file);
      // The veil may have changed while the image was prepared, so it is read now.
      const latest = wallpaperState().wallpaper;
      if (current === pick.current) void setWallpaper({image, veil: latest?.veil ?? true, dim: latest?.dim ?? DEFAULT_DIM});
    } catch (error) {
      problem = error instanceof WallpaperError ? error.problem : 'decode';
    }
    if (current !== pick.current) return;
    setProblem(problem);
    setPending(false);
  };
  return (
    <div className="rp-field" data-setting="wallpaper" role="group" aria-labelledby={labelId} aria-describedby={helpId}>
      <span id={labelId} className="lbl">
        {t('settings.wallpaper')}
      </span>
      <div className="rp-cluster">
        <WallpaperThumb />
        <FileButton acceptedFileTypes={['image/*']} onSelect={files => void choose(files)} isPending={pending}>
          {t('settings.wallpaperChoose')}
        </FileButton>
        <Button
          onPress={() => {
            pick.current++;
            setPending(false);
            setProblem(null);
            void setWallpaper(null);
          }}
          isDisabled={!wallpaper}
        >
          {t('settings.wallpaperDefault')}
        </Button>
      </div>
      <span id={helpId} className="rp-label">
        {t('settings.wallpaperHelp')}
      </span>
      {problem && <InlineAlert>{t(problems[problem])}</InlineAlert>}
      {!stored && <InlineAlert tone="informative">{t('settings.wallpaperSession')}</InlineAlert>}
      {wallpaper && (
        <Switch isSelected={wallpaper.veil} onChange={veil => void setWallpaper({...wallpaper, veil})}>
          {t('settings.wallpaperVeil')}
        </Switch>
      )}
      {wallpaper?.veil && (
        <Slider
          label={t('settings.wallpaperDim')}
          value={wallpaper.dim}
          minValue={0}
          maxValue={MAX_DIM}
          step={0.01}
          formatOptions={percent}
          onChange={dim => void setWallpaper({...wallpaper, dim}, false)}
          onChangeEnd={dim => void setWallpaper({...wallpaper, dim})}
        />
      )}
    </div>
  );
}
