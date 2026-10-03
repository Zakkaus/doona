import {DeferredLoading} from './DeferredLoading';
import {useCallback, useContext} from 'react';
import {useT, useLang, LOCALE} from '../../i18n';
import {formatLatency} from '../../i18n/format';
import {Spark, usePalette} from '../../ui/charts';
import {SettingsContext} from '../../shell/preferences';
import {Card, HelpRow, ErrorMessage, Light, Link, TextTooltip} from '../../ui/ui';
import Clock from '../../ui/icons/Clock';
import {useActivityNode, useLatencySpark} from './useActivityNode';
import {GroupMenu} from './GroupMenu';
import type {ConnectionList} from '../../api/model';

export function NodeCard({connections, selection}: {connections: ConnectionList | undefined; selection?: {chosen: string; setChosen: (id: string) => void}}) {
  const t = useT();
  const vm = useActivityNode(connections, selection);
  const p = usePalette();
  const locale = LOCALE[useLang()];
  const sparklines = useContext(SettingsContext)?.ap.sparklines ?? true;
  const latencyText = useCallback((value: number) => formatLatency(value, t), [t]);
  const spark = useLatencySpark(vm.nodes, vm.id, JSON.stringify([vm.chosen, vm.id]), sparklines, vm.refetchNodes);
  return (
    <Card
      className="rp-latency"
      title={t('act.latency')}
      tile={{icon: <Clock />, tint: 5, kind: 'metric', layout: 'responsive'}}
      aside={
        <HelpRow help={{title: t('act.latency'), text: t('act.groupPickHelp')}}>
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
            {/* An unavailable or unknown node's light takes the sparkline's place. */}
            {vm.status ? (
              <TextTooltip text={vm.healthError}>
                <Light small tone={vm.tone}>
                  {vm.status}
                </Light>
              </TextTooltip>
            ) : (
              sparklines && (
                <span className="rp-spark">
                  <Spark values={spark.values} timestamps={spark.timestamps} color={p.cat[4]} fmt={latencyText} locale={locale} />
                </span>
              )
            )}
          </>
        )}
      </div>
    </Card>
  );
}
