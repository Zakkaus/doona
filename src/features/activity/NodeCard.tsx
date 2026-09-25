import {useT} from '../../i18n';
import {Card, ErrorMessage, Light, Loading, TextTooltip} from '../../ui/ui';
import Clock from '../../ui/icons/Clock';
import {useActivityNode} from './useActivityNode';
import {NodeMenu} from './NodeMenu';

export function NodeCard() {
  const t = useT();
  const vm = useActivityNode();
  return (
    <Card title={t('act.latency')} tile={{icon: <Clock />, tint: 5, kind: 'metric'}} aside={<NodeMenu label={t('act.node')} model={vm} />}>
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
    </Card>
  );
}
