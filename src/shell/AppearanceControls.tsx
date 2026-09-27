import {useState} from 'react';
import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import Translate from '../ui/icons/Translate';
import {useT, type Lang} from '../i18n';
import {Button, ChoiceMenu} from '../ui/ui';
import {languageItems} from './view';

// The language menu and the light and dark toggle, shared by the top bar and the sign-in page.
export function SchemeIcon({dark}: {dark: boolean}) {
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
    <ChoiceMenu quiet chevron={false} label={t('lang')} value={lang} onChange={k => pickLang(k as Lang)} items={languageItems}>
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
