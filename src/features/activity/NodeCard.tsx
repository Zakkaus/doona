import {DeferredLoading} from './DeferredLoading';
import {useT} from '../../i18n';
import {Card, HelpRow, ErrorMessage, Light, Link, TextTooltip} from '../../ui/ui';
import Clock from '../../ui/icons/Clock';
import {useActivityNode} from './useActivityNode';
import {GroupMenu} from './GroupMenu';
import type {ConnectionList} from '../../api/model';

export function NodeCard({connections, selection}: {connections: ConnectionList | undefined; selection?: {chosen: string; setChosen: (id: string) => void}}) {
  const t = useT();
  const vm = useActivityNode(connections, selection);
  return (
    <Card
      className="rp-latency"
      title={t('act.latency')}
      tile={{icon: <Clock />, tint: 5, kind: 'metric', layout: 'responsive'}}
      aside={
        <HelpRow size="control" help={{title: t('act.latency'), text: t('act.groupPickHelp')}}>
          <GroupMenu label={t('policy.pickGroups')} model={vm} />
        </HelpRow>
      }
    >
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <div className="rp-tile-body">
        {vm.loading ? (
          <DeferredLoading />
        ) : (
          <>
            <span className="rp-tile-val">
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
