import {useT} from '../../i18n';
import {Badge, Frame, Line, LogLine} from '../../ui/ui';
import {clashLog} from './fixtures';

export function ClashLogs() {
  const t = useT();
  return (
    <div className="rp-page">
      <p className="rp-note">
        <Badge>{t('nav.compat')}</Badge> {t('compat.demoData')}
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
