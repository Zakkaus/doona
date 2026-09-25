import {localTime, relativeStart} from '../i18n/format';
import {LOCALE, useLang} from '../i18n';
import {useNow} from './clock';
import {TextTooltip} from './Button';

// A time relative to now, with the local time as its tooltip. The cell follows the clock itself, so a tick re-renders
// the visible cells rather than the page and every row it projects.
export function TimeCell({at}: {at: string | null}) {
  const locale = LOCALE[useLang()];
  const now = useNow();
  return <TextTooltip text={at ? localTime(at, locale) : undefined}>{relativeStart(at, locale, now)}</TextTooltip>;
}
