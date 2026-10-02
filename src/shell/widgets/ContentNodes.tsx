import {useContext, useMemo} from 'react';
import {useT, useLang, LOCALE} from '../../i18n';
import {formatLatency} from '../../i18n/format';
import {useCapabilities, useNodes, useProviders, useGroups} from '../../store';
import {ResourceSamples} from '../../store/preview';
import {activityGroupView, nodeView, useActivityNode, GroupMenu} from '../../features/activity/widgets';
import {latencyAverages, latencyGroups, latencyMax, latencyPlotRow, latencySummary, providerRowView} from '../../features/nodes/widgets';
import {MarkerPlot} from '../../ui/charts';
import {ContextualHelp, Empty, ErrorMessage, Kv} from '../../ui/ui';
import {contentLimit, instanceId, type Widget} from './layout';
import {saveLayout} from './settings';
import {saveDashboard} from './dashboardSettings';
import {mapWidgets} from './dashboardLayout';
import {Reading} from './Reading';

export function CurrentLatency({item, dashboard, onChange}: {item: Widget; dashboard: boolean; onChange?: (item: Widget) => void}) {
  const t = useT();
  const vm = useActivityNode(undefined, {
    chosen: item.group ?? '',
    setChosen: group => {
      if (onChange) onChange({...item, group});
      else if (dashboard) saveDashboard(previous => mapWidgets(previous, old => (instanceId(old) === instanceId(item) ? {...old, group} : old)));
      else saveLayout(previous => ({...previous, items: previous.items.map(old => (instanceId(old) === instanceId(item) ? {...old, group} : old))}));
    }
  });
  return (
    <>
      <div className="rp-cluster">
        <GroupMenu label={t('policy.pickGroups')} model={vm} />
        <ContextualHelp title={t('act.latency')} text={t('act.groupPickHelp')} />
      </div>
      <ErrorMessage error={vm.error} onRetry={vm.retry} />
      <Kv truncate compact row={item.size !== 'small'} items={[[vm.name || '—', vm.status ?? vm.latency]]} />
    </>
  );
}

export function Latency({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const nodes = useNodes(resources?.nodes.available === true);
  const groups = useGroups(resources?.groups.available === true);
  const view = useMemo(
    () => latencyGroups(nodes.data ?? [], groups.data, 'group', locale).filter(group => !item.group || group.id === `group:${item.group}`),
    [nodes.data, groups.data, item.group, locale]
  );
  const {measured, missing} = latencySummary(view);
  const averages = latencyAverages(view);
  // A gallery preview shows the summary and the first rows whole inside its frame.
  const limit = useContext(ResourceSamples) ? 3 : contentLimit(item.size, [3, 6, 12]);
  return (
    <Reading state={{...nodes, error: nodes.error ?? groups.error, refetch: () => (nodes.refetch(), groups.refetch())}}>
      {!view.length ? (
        <Empty>{t('dashboard.noNodes')}</Empty>
      ) : item.form === 'dots' ? (
        <>
          <span className="rp-label">{t('dashboard.latencyOrder')}</span>
          <Kv
            truncate
            compact
            row={item.size !== 'small'}
            items={[
              [t('nodes.latency.lowest'), formatLatency(measured[0]?.latest ?? null, t)],
              [t('nodes.latency.highest'), formatLatency(measured.at(-1)?.latest ?? null, t)]
            ]}
          />
          <MarkerPlot
            label={t('ui.nodeLatency')}
            max={latencyMax(view)}
            fmt={value => formatLatency(value, t)}
            limit={limit}
            showAll={n => t('nodes.latency.showAll', {n})}
            legend={
              averages.moving || averages.avg10
                ? [
                    {kind: 'dot', label: t('nodes.latency.latest')},
                    {kind: 'ring', label: t('nodes.latency.average')},
                    {kind: 'line', label: t('nodes.latency.range')}
                  ]
                : []
            }
            groups={[
              {
                id: 'nodes',
                label: item.group ? (view[0]?.label ?? t('nodes.latency.noGroup')) : t('dashboard.allGroups'),
                rows: measured.map(row => latencyPlotRow(row, t)),
                notes: missing.map(row => t('ui.valuePair', {label: row.name, value: t(row.state === 'unavailable' ? 'act.unavailable' : 'act.unknown')}))
              }
            ]}
          />
        </>
      ) : (
        <div className="rp-list">
          {measured.slice(0, limit).map(row => (
            <Kv truncate key={row.id} compact row={item.size !== 'small'} items={[[row.name, formatLatency(row.latest, t)]]} />
          ))}
          {missing.slice(0, Math.max(0, limit - measured.length)).map(row => (
            <Kv
              truncate
              key={row.id}
              compact
              row={item.size !== 'small'}
              items={[[row.name, t(row.state === 'unavailable' ? 'act.unavailable' : 'act.unknown')]]}
            />
          ))}
        </div>
      )}
    </Reading>
  );
}
export function Sources({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resource = useProviders();
  return (
    <Reading state={resource}>
      {!resource.data?.providers.length ? (
        <Empty>{t('dashboard.noSources')}</Empty>
      ) : (
        resource.data.providers.map(provider => {
          const row = providerRowView(provider, undefined, locale, t);
          return <Kv truncate key={row.id} compact row={item.size !== 'small'} items={[[row.name, row.status ?? '—']]} />;
        })
      )}
    </Reading>
  );
}
export function Groups({item}: {item: Widget}) {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const rows = activityGroupView(groups.data ?? [], nodes.data ?? [], '', t).options.filter(group => !item.group || group.id === item.group);
  return (
    <Reading state={{...groups, error: groups.error ?? nodes.error, refetch: () => (groups.refetch(), nodes.refetch())}}>
      {!rows.length ? (
        <Empty>{t('dashboard.noGroups')}</Empty>
      ) : (
        rows.slice(0, contentLimit(item.size)).map(group => {
          const health = nodeView(group.node ? [group.node] : [], '', t);
          return (
            <Kv
              truncate
              key={group.id}
              compact
              row={item.size !== 'small'}
              items={[[group.label, t('ui.valuePair', {label: group.node?.name ?? '—', value: health.status ?? health.latency})]]}
            />
          );
        })
      )}
    </Reading>
  );
}
