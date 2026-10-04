import {useContext, useMemo} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {formatLatency} from '../../i18n/format';
import {useCapabilities, useNodes, useProviders, useGroups} from '../../store';
import {ResourceSamples} from '../../store/preview';
import {activityGroupView, nodeView, useActivityNode, GroupMenu} from '../../features/activity/widgets';
import {latencyAverages, latencyGroups, latencyMax, latencyPlotRow, latencySummary, providerRowView} from '../../features/nodes/widgets';
import {MarkerPlot} from '../../ui/charts';
import {columns, ContextualHelp, Empty, ErrorMessage, Kv, Light, Meter} from '../../ui/ui';
import {contentLimit, WidgetSurface, type Widget} from './layout';
import {Reading} from './Reading';

// Only the inert previews render it without `onChange`, so their choice goes nowhere.
export function CurrentLatency({item, onChange}: {item: Widget; onChange?: (item: Widget) => void}) {
  const t = useT();
  const vm = useActivityNode(undefined, {chosen: item.group ?? '', setChosen: group => onChange?.({...item, group})});
  return (
    <>
      <div className="rp-cluster">
        <GroupMenu label={t('policy.pickGroups')} model={vm} />
        <ContextualHelp title={t('act.latency')} text={t('act.groupPickHelp')} />
      </div>
      <ErrorMessage error={vm.error} onRetry={vm.retry} />
      <Kv compact row={item.size !== 'small'} items={[[vm.name || '—', vm.status ?? vm.latency]]} />
    </>
  );
}

export function Latency({item}: {item: Widget}) {
  const t = useT();
  const surface = useContext(WidgetSurface);
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
  // The panel gallery's preview shows the summary and the first rows whole inside its frame; a dashboard thumbnail
  // shows the rows the card will.
  const limit = useContext(ResourceSamples) && surface === 'panel' ? 3 : (item.rows ?? contentLimit(item.size, [3, 6, 12]));
  return (
    <Reading state={{...nodes, error: nodes.error ?? groups.error, refetch: () => (nodes.refetch(), groups.refetch())}}>
      {!view.length ? (
        <Empty>{t('dashboard.noNodes')}</Empty>
      ) : item.form === 'dots' && item.size !== 'small' ? (
        <MarkerPlot
          label={t('ui.nodeLatency')}
          summary={
            <Kv
              compact
              row
              items={[
                [t('nodes.latency.lowest'), formatLatency(measured[0]?.latest ?? null, t)],
                [t('nodes.latency.highest'), formatLatency(measured.at(-1)?.latest ?? null, t)]
              ]}
            />
          }
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
              notes: missing.map(row => t('ui.valuePair', {label: row.name, value: t(row.state === 'unavailable' ? 'ui.unavailable' : 'ui.unknown')}))
            }
          ]}
        />
      ) : (
        <div className="rp-list">
          {measured.slice(0, limit).map(row => (
            <Kv key={row.id} compact row={item.size !== 'small'} items={[[row.name, formatLatency(row.latest, t)]]} />
          ))}
          {missing.slice(0, Math.max(0, limit - measured.length)).map(row => (
            <Kv key={row.id} compact row={item.size !== 'small'} items={[[row.name, t(row.state === 'unavailable' ? 'ui.unavailable' : 'ui.unknown')]]} />
          ))}
        </div>
      )}
    </Reading>
  );
}
// Every node once, by its preferred health: available, unavailable or not yet measured.
export function NodeAvailability({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const nodes = useNodes(useCapabilities().data?.resources.nodes.available === true);
  const {measured, missing, down} = latencySummary(latencyGroups(nodes.data ?? [], undefined, 'protocol', locale));
  const available = t('ui.fraction', {part: measured.length, whole: measured.length + missing.length});
  const count = (n: number, tone: 'err' | 'neutral') => <Light tone={n ? tone : 'muted'}>{formatNumber(n, locale)}</Light>;
  return (
    <Reading state={nodes}>
      {!nodes.data?.length ? (
        <Empty>{t('dashboard.noNodes')}</Empty>
      ) : item.size === 'small' ? (
        <Kv compact items={[[t('ov.available'), available]]} />
      ) : (
        <Kv
          compact
          row
          items={[
            [t('ov.available'), <Light tone={measured.length ? 'ok' : 'muted'}>{available}</Light>],
            [t('ui.unavailable'), count(down, 'err')],
            [t('ui.unknown'), count(missing.length - down, 'neutral')]
          ]}
        />
      )}
    </Reading>
  );
}
// Source health lists every source with its status, and its quota under it when the provider reports one; the quota
// widget lists the subscriptions, each as its quota's meter or, without an allowance, its usage, and its expiry.
export function Sources({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resource = useProviders();
  const quota = item.id === 'providerBudget';
  const providers = (resource.data?.providers ?? []).filter(provider => !quota || provider.kind === 'subscription').slice(0, item.rows);
  return (
    <Reading state={resource}>
      {!providers.length ? (
        <Empty>{t(quota ? 'act.noSubscriptions' : 'dashboard.noSources')}</Empty>
      ) : (
        <div className="rp-list rp-columns" style={columns(providers.length)}>
          {providers.map(provider => {
            const row = providerRowView(provider, undefined, locale, t);
            const meter = row.quota && <Meter label={quota ? row.name : t('nodes.usage')} value={row.quota.pct} valueLabel={row.usage} tone={row.quota.tone} />;
            const kv = (value: string) => <Kv compact row={item.size !== 'small'} items={[[row.name, value]]} />;
            return (
              <div key={row.id} className="rp-entry">
                {quota ? (
                  <>
                    {meter ?? kv(row.usage)}
                    {provider.expires_at && <span className="rp-note">{t('ui.valuePair', {label: t('nodes.expires'), value: row.expires})}</span>}
                  </>
                ) : (
                  <>
                    {kv(row.status ?? '—')}
                    {meter}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Reading>
  );
}
export function Groups({item}: {item: Widget}) {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const nodes = useNodes(resources?.nodes.available === true);
  const rows = activityGroupView(groups.data ?? [], nodes.data ?? [], '', t)
    .options.filter(group => !item.group || group.id === item.group)
    .slice(0, item.rows ?? contentLimit(item.size));
  return (
    <Reading state={{...groups, error: groups.error ?? nodes.error, refetch: () => (groups.refetch(), nodes.refetch())}}>
      {!rows.length ? (
        <Empty>{t('dashboard.noGroups')}</Empty>
      ) : (
        <div className="rp-list rp-columns" style={columns(rows.length)}>
          {rows.map(group => {
            const health = nodeView(group.node ? [group.node] : [], '', t);
            return (
              <Kv
                key={group.id}
                compact
                row={item.size !== 'small'}
                items={[[group.label, t('ui.valuePair', {label: group.node?.name ?? '—', value: health.status ?? health.latency})]]}
              />
            );
          })}
        </div>
      )}
    </Reading>
  );
}
