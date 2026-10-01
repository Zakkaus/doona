import Contrast from '../ui/icons/Contrast';
import Lighten from '../ui/icons/Lighten';
import {Button} from '../ui/ui';

export function SchemeIcon({dark}: {dark: boolean}) {
  return (
    <span className="rp-icon-stack" data-dark={dark || undefined}>
      <Contrast className="moon" />
      <Lighten className="sun" />
    </span>
  );
}

export function SchemeToggle({dark, label, toggle}: {dark: boolean; label: string; toggle: () => void}) {
  return (
    <Button quiet icon label={label} onPress={toggle}>
      <SchemeIcon dark={dark} />
    </Button>
  );
}
