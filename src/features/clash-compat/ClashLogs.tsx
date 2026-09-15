import {useT} from '../../i18n';
import {Frame, Line, LogLine} from '../../ui/ui';
import {clashLog} from './fixtures';

export function ClashLogs() {
  const t = useT();
  return (
    <div className="rp-page">
      <p className="rp-note">
        <span className="rp-badge rp-nav-compat">{t('nav.compat')}</span> {t('compat.demoData')}
      </p>
      <Frame title={t('event.clashTitle')} actions={<span>{t('event.clashLevel')}</span>}>
        {clashLog.map((line, i) => (
          <Line key={i} n={i + 1}>
            <LogLine text={line} />
          </Line>
        ))}
      </Frame>
    </div>
  );
}
