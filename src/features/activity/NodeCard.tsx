import {useT} from '../../i18n';
import {ErrorMessage, Light, Loading, TextTooltip} from '../../ui/ui';
import Clock from '../../ui/icons/Clock';
import {useActivityNode} from './useActivityNode';
import {NodeMenu} from './NodeMenu';

export function NodeCard() {
  const t = useT();
  const vm = useActivityNode();
  return (
    <div className="rp-card">
      <span className="rp-tile-head rp-tint-c5">
        <Clock />
        {t('act.latency')}
        <NodeMenu label={t('act.node')} model={vm} />
      </span>
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <div className="rp-tile-body">
        {vm.loading ? (
          <Loading />
        ) : (
          <>
            <span className="rp-tile-val">
              <span className="rp-big">{vm.latency}</span>
            </span>
            <TextTooltip text={vm.healthError}>
              <Light small tone={vm.tone}>
                {vm.status}
              </Light>
            </TextTooltip>
          </>
        )}
      </div>
    </div>
  );
}
