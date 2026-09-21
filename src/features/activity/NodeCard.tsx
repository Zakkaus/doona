import {useT} from '../../i18n';
import {ErrorMessage, Light, Loading} from '../../ui/ui';
import Clock from '../../ui/icons/Clock';
import {NodeMenu} from '../policies/Nodes';
import {useActivityNode} from './useActivityNode';

export function NodeCard() {
  const t = useT();
  const vm = useActivityNode();
  return (
    <div className="rp-card">
      <span className="rp-tile-head rp-tint-c5">
        <Clock />
        {t('act.latency')}
        <NodeMenu label={t('act.node')} value={vm.name} onChange={vm.setChosen} nodes={vm.options} />
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
            <Light small tone={vm.tone}>
              {vm.status}
            </Light>
          </>
        )}
      </div>
    </div>
  );
}
