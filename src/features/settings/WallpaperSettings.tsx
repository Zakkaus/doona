import {useEffect, useId, useRef, useState} from 'react';
import {useT, type Key} from '../../i18n';
import {Button, InlineAlert, Switch} from '../../ui/ui';
import {FileButton} from '../../ui/FileButton';
import {Slider} from '../../ui/Slider';
import {WallpaperThumb} from '../../ui/WallpaperThumb';
import {DEFAULT_DIM, MAX_DIM, setWallpaper, useWallpaper, wallpaperState} from '../../shell/wallpaper';
import {MAX_BLUR, type PaletteId} from '../../shell/preferences';
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

// The blur strength of every glass surface, with or without a custom wallpaper.
export function BlurSetting({value, onChange}: {value: number; onChange: (value: number) => void}) {
  const t = useT();
  return (
    <div className="rp-field" data-setting="blur">
      <Slider label={t('settings.blur')} value={value} maxValue={MAX_BLUR} step={0.01} formatOptions={percent} onChange={onChange} />
    </div>
  );
}

function LensPauseSetting({value, onChange}: {value: boolean; onChange: (value: boolean) => void}) {
  const t = useT();
  const helpId = useId();
  return (
    <div className="rp-field" data-setting="lensPause">
      <Switch isSelected={value} onChange={onChange} aria-describedby={helpId}>
        {t('settings.lensPause')}
      </Switch>
      <span id={helpId} className="rp-label">
        {t('settings.lensPauseHelp')}
      </span>
    </div>
  );
}

export default function GlassSettings({
  palette,
  blur,
  onBlurChange,
  lensPause,
  onLensPauseChange
}: {
  palette: PaletteId;
  blur: number;
  onBlurChange: (value: number) => void;
  lensPause: boolean;
  onLensPauseChange: (value: boolean) => void;
}) {
  return (
    <>
      <WallpaperSettings />
      {/* Tinted draws no blur, so it has nothing to scale. */}
      {palette !== 'glass/tinted' && <BlurSetting value={blur} onChange={onBlurChange} />}
      {palette === 'glass/glass' && <LensPauseSetting value={lensPause} onChange={onLensPauseChange} />}
    </>
  );
}
