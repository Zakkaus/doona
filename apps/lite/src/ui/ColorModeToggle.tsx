import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {usePreferences} from '../app/preferences';
import {useMessages} from '../i18n';
import {Contrast, Lighten} from './icons';

export function ColorModeToggle({size}: {size?: 'sm' | 'md' | 'lg'}) {
  const {mode, setMode} = usePreferences();
  const t = useMessages();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  const label = isDark ? t.toLight : t.toDark;
  return (
    <Tooltip content={label}>
      <IconButton
        data-theme-toggle
        label={label}
        variant="ghost"
        size={size}
        icon={<Icon icon={isDark ? Lighten : Contrast} />}
        onClick={() => setMode(isDark ? 'light' : 'dark')}
      />
    </Tooltip>
  );
}
