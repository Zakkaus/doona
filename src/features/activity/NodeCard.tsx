import {useT} from '../../i18n';
import {Card, ErrorMessage, Light, Link, Loading, TextTooltip} from '../../ui/ui';
import Clock from '../../ui/icons/Clock';
import {useActivityNode} from './useActivityNode';
import {GroupMenu} from './GroupMenu';
import type {ConnectionList} from '../../api/model';

export function NodeCard({connections}: {connections: ConnectionList | undefined}) {
  const t = useT();
  const vm = useActivityNode(connections);
  return (
    <Card
      className="rp-latency"
      title={t('act.latency')}
      tile={{icon: <Clock />, tint: 5, kind: 'metric'}}
      aside={<GroupMenu label={t('policy.pickGroups')} model={vm} />}
    >
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <div className="rp-tile-body">
        {vm.loading ? (
          <Loading />
        ) : (
          <>
            <span className="rp-tile-val">
              <TextTooltip>{vm.name || '—'}</TextTooltip>
              {/* The value opens the node on the nodes page, as the connections tile opens the list it counts. */}
              {vm.href ? (
                <Link appearance="link" href={vm.href} label={t('ui.valuePair', {label: vm.name, value: vm.latency})}>
                  <span className={vm.latencyClass}>{vm.latency}</span>
                </Link>
              ) : (
                <span className={vm.latencyClass}>{vm.latency}</span>
              )}
            </span>
            {vm.status && (
              <TextTooltip text={vm.healthError}>
                <Light small tone={vm.tone}>
                  {vm.status}
                </Light>
              </TextTooltip>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
