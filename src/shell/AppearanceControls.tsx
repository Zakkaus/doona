import {useState} from 'react';
import Color from '../ui/icons/Color';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import Translate from '../ui/icons/Translate';
import {useT, type Lang} from '../i18n';
import {Button, ChoiceMenu} from '../ui/ui';
import type {PaletteId, SettingsContext} from './preferences';
import {languageItems, type PaletteSection} from './view';

type PaletteControls = Pick<NonNullable<React.ContextType<typeof SettingsContext>>['ap'], 'palette' | 'pickPalette'>;
export type PaletteMenuProps = {ap: PaletteControls; paletteSections: PaletteSection[]};

// The language and palette menus and the light and dark toggle, shared by the top bar and the sign-in page.
function SchemeIcon({dark}: {dark: boolean}) {
  return (
    <span className="rp-icon-stack" data-dark={dark || undefined}>
      <Contrast className="moon" />
      <Lighten className="sun" />
    </span>
  );
}

export function LanguageMenu({lang, pickLang}: {lang: Lang; pickLang: (lang: Lang) => void}) {
  const t = useT();
  // The icon turns in when the language changes, like the scheme icon; not on first paint.
  const [first] = useState(lang);
  return (
    <ChoiceMenu quiet chevron={false} label={t('ui.lang')} value={lang} onChange={k => pickLang(k as Lang)} items={languageItems}>
      <Translate key={lang} className={lang !== first ? 'rp-icon-in' : undefined} />
    </ChoiceMenu>
  );
}

export function SchemeToggle({dark, label, toggle}: {dark: boolean; label: string; toggle: () => void}) {
  return (
    <Button quiet icon label={label} onPress={toggle}>
      <SchemeIcon dark={dark} />
    </Button>
  );
}

// The palette sections, as the menus list them.
export function usePaletteChoices({ap, paletteSections}: PaletteMenuProps) {
  return {
    palettes: paletteSections.map(section => ({...section, value: ap.palette, onChange: (k: string) => ap.pickPalette(k as PaletteId)}))
  };
}

export function PaletteMenu(props: PaletteMenuProps) {
  const t = useT();
  const {palettes} = usePaletteChoices(props);
  const palette = props.ap.palette;
  // The icon turns in when the palette changes, like the scheme icon; not on first paint.
  const [first] = useState(palette);
  return (
    <ChoiceMenu quiet chevron={false} label={t('ui.palette')} sections={palettes}>
      <Color key={palette} className={palette !== first ? 'rp-icon-in' : undefined} />
    </ChoiceMenu>
  );
}
