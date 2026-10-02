import {useMemo} from 'react';
import {useT, useLang, LOCALE, formatNumber} from '../../i18n';
import {formatBytes, localTime} from '../../i18n/format';
import {useCapabilities, useConnections, useRuntimeOutbounds, useDnsLog, poll} from '../../store';
import {connectionRows, outboundLabel, outboundUsage} from '../../api/selectors';
import {connectionRanking} from '../../features/shared/ranking';
import {outboundColor} from '../../features/activity/widgets';
import {dnsAnalysis, dnsOutcomes} from '../../features/dns/widgets';
import {ranked} from '../../features/shared/ranked';
import {Donut, Waffle, usePalette} from '../../ui/charts';
import {Bar, Empty, Kv} from '../../ui/ui';
import {contentLimit, registry, type Widget} from './layout';
import {Reading} from './Reading';

// One share chart for every module that splits a total: donut, waffle, ranked bars or key-value rows, by form.
type Share = {name: string; count: number; percent?: number; color?: string};
// The shares with a value, each with its percentage of their total unless it brings its own, and a colour.
export function shareRows(rows: Share[], colors: readonly string[]) {
  rows = rows.filter(row => row.count > 0);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {total, rows: rows.map((row, i) => ({...row, pct: row.percent ?? (row.count / total) * 100, color: row.color ?? colors[i % colors.length]}))};
}
function Shares({item, rows, bytes = false, empty}: {item: Widget; rows: Share[]; bytes?: boolean; empty: string}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const p = usePalette();
  const format = (value: number) => (bytes ? formatBytes(value, locale) : formatNumber(value, locale));
  const {total, rows: shown} = shareRows(rows, p.cat);
  const shares = shown.map(row => ({...row, text: format(row.count)}));
  const chart = {legendLimit: item.rows ?? contentLimit(item.size), label: t(registry[item.id].label)};
  if (!total) return <Empty>{empty}</Empty>;
  if (item.form === 'donut') return <Donut {...chart} total={format(total)} rows={shares.map(row => ({...row, value: Math.round(row.pct)}))} />;
  if (item.form === 'waffle') return <Waffle {...chart} shares={shares.map(row => ({...row, id: row.name, label: row.name}))} />;
  return (
    <div className="rp-list">
      {shares
        .slice(0, item.rows ?? contentLimit(item.size))
        .map(row =>
          item.form === 'ranked' ? (
            <Bar key={row.name} label={row.name} value={row.text} pct={row.pct} color={row.color} />
          ) : (
            <Kv truncate key={row.name} compact row={item.size !== 'small'} items={[[row.name, row.text]]} />
          )
        )}
    </div>
  );
}
export function RankingWidget({item}: {item: Widget}) {
  const t = useT();
  const list = useConnections(undefined, true, false, poll.summary);
  const rows = useMemo(
    () =>
      connectionRanking(list.data, item.by ?? 'dev', item.rows ?? 5).map(row => ({
        name: row.name,
        count: Number(row.download ?? 0n),
        percent: row.percent ?? undefined
      })),
    [list.data, item.by, item.rows]
  );
  return (
    <Reading state={list}>
      <Shares item={item} rows={rows} bytes empty={t('ui.empty')} />
      {list.data?.truncated && <span className="rp-label">{t('widgets.sampled')}</span>}
    </Reading>
  );
}
export function OutboundWidget({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resource = useRuntimeOutbounds(true);
  const p = usePalette();
  const usage = useMemo(() => outboundUsage(resource.data), [resource.data]);
  const rows = usage.rows.map((row, i) => ({name: row.name, count: Number(row.bytes ?? 0n), color: outboundColor(row, i, p)}));
  return (
    <Reading state={resource}>
      <Shares item={item} rows={rows} bytes empty={t('ui.empty')} />
      {item.size !== 'small' && (
        <span className="rp-label rp-counter-since">{t('act.since', {time: localTime(resource.data?.counter_since ?? null, locale)})}</span>
      )}
    </Reading>
  );
}
export function Connections({item}: {item: Widget}) {
  const t = useT();
  const resource = useConnections(undefined, true, false, poll.summary);
  // Connection statistics work without outbound traffic; the colours come only from a backend that has it.
  const outboundsAvailable = useCapabilities().data?.resources.runtime_outbounds.available === true;
  const usage = useRuntimeOutbounds(item.id === 'connectionOutbounds' && outboundsAvailable);
  const palette = usePalette();
  const rows = useMemo(() => {
    const colors = new Map(outboundUsage(usage.data).rows.map((row, i) => [row.name, outboundColor(row, i, palette)]));
    const summary = ranked(
      connectionRows(resource.data).map(row => (item.id === 'connectionOutbounds' ? row.outbound : row.network)),
      6
    );
    return [
      ...summary.top.map(row => ({
        name: item.id === 'connectionOutbounds' ? outboundLabel(row.key, t) : (row.key ?? '—'),
        count: row.count,
        color: item.id === 'connectionOutbounds' ? colors.get(row.key ?? '') : undefined
      })),
      ...(summary.rest ? [{name: t('dashboard.other'), count: summary.rest}] : [])
    ];
  }, [resource.data, usage.data, palette, item.id, t]);
  return (
    <Reading state={resource}>
      <Shares item={item} rows={rows} empty={t('dashboard.noConnections')} />
      {resource.data?.truncated && <span className="rp-label">{t('widgets.sampled')}</span>}
    </Reading>
  );
}
export function Dns({item}: {item: Widget}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resource = useDnsLog({});
  const analysis = useMemo(() => dnsAnalysis(resource.data?.records ?? [], locale), [resource.data, locale]);
  return (
    <Reading state={resource}>
      <Shares
        item={item}
        rows={dnsOutcomes.map(outcome => ({name: t(`dns.outcome.${outcome}`), count: analysis.counts[outcome]}))}
        empty={t('dashboard.noQueries')}
      />
      {analysis.total > 0 && <span className="rp-label">{t('dashboard.dnsSample', {n: analysis.total})}</span>}
    </Reading>
  );
}
