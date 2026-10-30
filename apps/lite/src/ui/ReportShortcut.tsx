import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {issuesUrl} from '../../../../src/api/problemReport';
import {useMessages} from '../i18n';
import {Bug} from './icons';

export function ReportShortcut() {
  const t = useMessages();
  return (
    <Tooltip content={t.reportProblem}>
      <IconButton
        data-report-shortcut
        label={t.reportProblem}
        variant="ghost"
        icon={<Icon icon={Bug} />}
        href={issuesUrl}
        target="_blank"
        rel="noopener noreferrer"
      />
    </Tooltip>
  );
}
