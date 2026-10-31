import {useLang, useT} from '../../i18n';
import {Button, InlineAlert, Link, toast} from '../../ui/ui';
import type {ConfigSource} from '../../api/model';
import {fileName, type RestartSetting} from '../../dae/sources';
import {copyText} from '../shared/copy';
import {docsHref} from '../shared/docs';

// A write the engine refused because the change needs a restart: what needs it, that nothing was written, and how to
// apply it, with the engine's restart command when doona knows it. The alert takes focus so it is announced, and stays
// until the next edit, since the way forward is outside doona.
export function RestartNotice({settings, sources, command}: {settings: RestartSetting[]; sources: ConfigSource[]; command: string | null}) {
  const t = useT();
  const lang = useLang();
  const copy = async (text: string) => {
    const copied = await copyText(text);
    toast(copied ? 'positive' : 'negative', t(copied ? 'config.restart.copied' : 'config.restart.copyFailed'));
  };
  return (
    <InlineAlert
      takeFocus
      title={t('config.restart.title', {n: settings.length})}
      action={
        <>
          <span>{t('config.restart.planned')}</span>
          {settings.map(({key, sourceId, line}, index) => {
            const source = sources.find(item => item.id === sourceId);
            return (
              <span key={index}>
                {key && <code className="rp-code">{key}</code>} {t('config.restart.effect')}
                {line !== null && source && <span className="rp-label"> {`${fileName(source)}:${line}`}</span>}
              </span>
            );
          })}
          <span>{t('config.restart.next')}</span>
          {command && (
            <span className="rp-cluster">
              <code className="rp-code rp-limit-snippet">{command}</code>
              <Button small onPress={() => void copy(command)}>
                {t('config.restart.copy')}
              </Button>
            </span>
          )}
          <Link appearance="link" external href={docsHref(lang, 'reload-and-restart')}>
            {t('config.restart.docs')}
            <span aria-hidden="true">↗</span>
          </Link>
        </>
      }
    >
      {t('config.restart.body')}
    </InlineAlert>
  );
}
