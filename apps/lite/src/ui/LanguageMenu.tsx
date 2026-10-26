import {DropdownMenu, DropdownMenuRadioGroup, DropdownMenuRadioItem} from '@astryxdesign/core/DropdownMenu';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import type {ComponentProps} from 'react';
import {usePreferences} from '../app/preferences';
import {useMessages, type Locale} from '../i18n';
import {Translate} from './icons';

export function LanguageMenu({size}: {size?: ComponentProps<typeof IconButton>['size']}) {
  const {locale, setLocale} = usePreferences();
  const t = useMessages();
  const names = {en: t.english, 'zh-CN': t.simplified, 'zh-TW': t.traditional};
  return (
    <DropdownMenu
      placement="below"
      alignment="start"
      renderTrigger={props => (
        <Tooltip content={t.language}>
          <IconButton data-language-menu {...props} label={t.language} variant="ghost" size={size} icon={<Icon icon={Translate} />} />
        </Tooltip>
      )}
    >
      <DropdownMenuRadioGroup label={t.language} value={locale} onChange={value => setLocale(value as Locale)}>
        {(Object.keys(names) as Locale[]).map(value => (
          <DropdownMenuRadioItem key={value} value={value} label={names[value]} />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  );
}
