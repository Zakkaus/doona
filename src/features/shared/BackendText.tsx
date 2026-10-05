import {Fragment} from 'react';
import {useT} from '../../i18n';
import {Disclosure} from '../../ui/ui';

// The backend's words a translated message leaves out, under Details for a bug report; nothing when there are none.
export function BackendText({texts}: {texts: readonly string[] | undefined}) {
  const t = useT();
  if (!texts?.length) return null;
  return (
    <Disclosure flush title={t('config.backendText')}>
      {texts.map((text, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          <code>{text}</code>
        </Fragment>
      ))}
    </Disclosure>
  );
}
