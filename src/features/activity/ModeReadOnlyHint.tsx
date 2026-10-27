import type {EngineReason} from '../../api/engines';
import {useLang, useT} from '../../i18n';
import {docsHref} from '../shared/docs';
import {reasonHint} from '../shared/limitHint';
import {Link} from '../../ui/ui';

// Why the outbound mode is read-only: the overview's text for the engine's reason, or the general read-only advice when
// the engine gives none.
export function ModeReadOnlyHint({reason}: {reason?: EngineReason}) {
  const t = useT();
  const lang = useLang();
  const hint = reasonHint('mode', reason, t, lang);
  return hint ? (
    <>
      <p>{hint.text}</p>
      {hint.setting && <p>{hint.setting}</p>}
      <Link external appearance="link" href={hint.link.href}>
        {hint.link.text}
      </Link>
    </>
  ) : (
    <>
      <p>{t('act.modeReadOnlyReason')}</p>
      <p>{t('act.modeReadOnlyAction')}</p>
      <Link external appearance="link" href={docsHref(lang, 'read-only')}>
        {t('act.readOnlyDocs')}
      </Link>
    </>
  );
}
