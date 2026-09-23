import {useT} from '../../../i18n';
import {Light, TextTooltip} from '../../../ui/ui';
import type {CoverageView} from './view';

export function Coverage({view}: {view: CoverageView}) {
  const t = useT();
  return (
    <div className="rp-cluster" role="group" aria-label={t('flow.coverage')}>
      {view.summary && (
        <TextTooltip text={view.detail}>
          <Light small tone="warn">
            {view.summary}
          </Light>
        </TextTooltip>
      )}
      {view.dropped && (
        <Light small tone="warn">
          {view.dropped}
        </Light>
      )}
    </div>
  );
}
