import {useMemo, useState} from 'react';
import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Clock from '../../ui/icons/Clock';
import {useCapabilities, useConnections, useEventFeed, useGroups, useNodes, useRuntime, useRuntimeOutbounds, useTrafficHistory} from '../../api/store';
import {clientRows, connectionRows, eventSummary, lifecycleStates, localTime, outboundUsage, preferredHealth, trafficSeries} from '../../api/selectors';
import {addU64, formatBytes, formatRate, pctU64} from '../../api/u64';
import {useT, useLang, LOCALE} from '../../i18n';
import {Button, Segmented, Light, Bar} from '../../ui/ui';
import {NodeMenu} from '../policies/Nodes';
import {Flag} from '../policies/Flag';
import {AreaChart, Donut, Legend, Spark, fmtRate, usePalette} from '../../ui/Charts';

export function Activity({go}: {go: (page: string) => void}) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const chartRate = (value: number | null | undefined) => fmtRate(value, locale, t);
  const p = usePalette();
  const runtimeResource = useRuntime(),
    nodesResource = useNodes(),
    groupsResource = useGroups(),
    capabilities = useCapabilities();
  const outbounds = useRuntimeOutbounds(capabilities.data?.resources.runtime_outbounds.available === true);
  const NODES = useMemo(
    () =>
      (nodesResource.data ?? []).map(n => {
        const health = preferredHealth(n);
        return {id: n.id, name: n.name, tcp: health?.latency_ms ?? undefined, alive: health?.state === 'healthy', unavailable: health?.state === 'unavailable'};
      }),
    [nodesResource.data]
  );
  const [by, setBy] = useState('dev');
  const connections = useConnections();
  const feed = useEventFeed();
  const ranking = useMemo(() => {
    let rows: Array<{name: string; download: bigint | null}>;
    if (by === 'dev') rows = clientRows(connections.data).map(row => ({name: row.ip, download: row.download}));
    else {
      const totals = new Map<string, bigint | null>();
      for (const row of connectionRows(connections.data)) {
        const name = row.domain || row.dst;
        if (!name) continue;
        totals.set(name, addU64(totals.has(name) ? totals.get(name)! : 0n, row.download_bytes));
      }
      rows = [...totals].map(([name, download]) => ({name, download}));
    }
    const total = addU64(...rows.map(row => row.download));
    rows.sort((a, b) => (a.download === b.download ? 0 : a.download === null ? 1 : b.download === null ? -1 : a.download > b.download ? -1 : 1));
    return rows.slice(0, 5).map(row => ({...row, percent: pctU64(row.download, total)}));
  }, [by, connections.data]);
  const [range, setRange] = useState('live');
  const history = useTrafficHistory(range, capabilities.data);
  const series = useMemo(() => trafficSeries(history.data), [history.data]);
  const [chosenNode, setNodeName] = useState('');
  const node = NODES.find(n => n.name === chosenNode) ?? NODES[0];
  const nodeName = node?.name ?? '';
  const error = runtimeResource.error ?? nodesResource.error ?? groupsResource.error ?? capabilities.error;
  if (error)
    return (
      <div role="alert">
        {t('act.loadFailed')} {error.message}
      </div>
    );
  if (!runtimeResource.data || !nodesResource.data || !groupsResource.data) return <div role="status">{t('act.loading')}</div>;
  const liveRuntime = runtimeResource.data;
  const usage = outboundUsage(outbounds.data);
  const traffic = [
    {label: t('act.download'), color: p.cat[0], values: series.down},
    {label: t('act.upload'), color: p.cat[3], values: series.up}
  ];
  const OUT = usage.rows.map((r, i) => ({
    name: r.name,
    value: r.percent === null ? null : Math.round(r.percent),
    text: formatBytes(r.bytes),
    color: r.name === 'block' ? p.love : p.cat[i % p.cat.length]
  }));
  const events = feed.events.slice(0, 6);
  return (
    <>
      <div className="rp-col">
        <div className="rp-card">
          <div className="rp-row">
            <Light tone={liveRuntime.lifecycle.state === 'running' ? 'ok' : 'warn'}>{t(lifecycleStates[liveRuntime.lifecycle.state])}</Light>
            <Button quiet onPress={() => go('overview')}>
              {t('act.viewDetails')}
            </Button>
          </div>
        </div>
      </div>

      <div className="rp-strip">
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c1">
            <Download />
            {t('act.download')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{formatRate(liveRuntime.traffic.rates?.download_bytes_per_second ?? null)}</span>
            </span>
            <span className="rp-spark">
              <Spark values={series.down} timestamps={series.timestamps} color={p.cat[0]} />
            </span>
          </div>
        </div>
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c4">
            <Upload />
            {t('act.upload')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{formatRate(liveRuntime.traffic.rates?.upload_bytes_per_second ?? null)}</span>
            </span>
            <span className="rp-spark">
              <Spark values={series.up} timestamps={series.timestamps} color={p.cat[3]} />
            </span>
          </div>
        </div>
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c3">
            <LinkIcon />
            {t('act.active')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{liveRuntime.traffic.connections.total ?? '—'}</span>
            </span>
            <span className="rp-spark">
              <Spark values={series.connections} timestamps={series.timestamps} color={p.cat[2]} />
            </span>
          </div>
        </div>
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c5">
            <Clock />
            {t('act.latency')}
            <NodeMenu
              label={t('act.node')}
              value={nodeName}
              onChange={setNodeName}
              nodes={NODES}
              labels={{timeout: t('act.timeout'), filter: t('act.filterNodes'), loading: t('act.loading')}}
            />
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{node?.alive ? (node.tcp === undefined ? '—' : t('ui.latency', {n: node.tcp})) : '—'}</span>
            </span>
            <Light small tone={node?.alive ? 'ok' : 'err'}>
              {node?.alive ? t('act.good') : node?.unavailable ? t('act.timeout') : t('act.unknown')}
            </Light>
          </div>
        </div>
      </div>

      <div className="rp-g21">
        <div className="rp-card">
          <div className="rp-row">
            <h3 className="rp-h3">{t('act.traffic')}</h3>
            <Segmented
              label={t('act.historyRange')}
              value={range}
              onChange={setRange}
              items={[
                ['live', t('act.live')],
                ['h1', t('act.h1')],
                ['h6', t('act.h6')],
                ['h24', t('act.h24')],
                ['d7', t('act.d7')]
              ]}
            />
          </div>
          {history.error ? (
            <p role="alert">{history.error.message}</p>
          ) : capabilities.data?.resources.traffic_history.available === false ? (
            <span className="rp-label">{t('act.noHistory')}</span>
          ) : !history.data ? (
            <span role="status">{t('act.loading')}</span>
          ) : !history.data.samples.length ? (
            <span className="rp-label">{t('act.emptyHistory')}</span>
          ) : (
            <>
              <Legend series={traffic} fmt={chartRate} />
              <AreaChart series={traffic} timestamps={series.timestamps} fmt={chartRate} locale={locale} height={120} />
            </>
          )}
        </div>
        <div className="rp-card">
          <div className="rp-row">
            <div className="rp-cluster">
              <h3 className="rp-h3">{t('act.outUsage')}</h3>
              {outbounds.data && <span className="rp-label">{t('act.since', {t: localTime(outbounds.data.counter_since, locale)})}</span>}
            </div>
          </div>
          {outbounds.error ? (
            <p role="alert">{outbounds.error.message}</p>
          ) : capabilities.data?.resources.runtime_outbounds.available === false ? (
            <span className="rp-label">{t('act.noOutbounds')}</span>
          ) : !outbounds.data ? (
            <span role="status">{t('act.loading')}</span>
          ) : (
            <Donut rows={OUT} total={formatBytes(usage.total)} />
          )}
        </div>
      </div>

      <div className="rp-g3">
        <div className="rp-card">
          <div className="rp-row">
            <h3 className="rp-h3">{t('act.topDevices')}</h3>
            <Segmented
              label={t('act.topDevices')}
              value={by}
              onChange={setBy}
              items={[
                ['dev', t('act.devices')],
                ['host', t('act.domains')]
              ]}
            />
          </div>
          <p className="rp-note">{t('act.rankingScope')}</p>
          {connections.error && <p role="alert">{connections.error.message}</p>}
          {connections.data?.truncated && <p className="rp-note">{t('act.rankingTruncated')}</p>}
          {!connections.data ? (
            <span role="status">{t('act.loading')}</span>
          ) : ranking.length === 0 ? (
            <span className="rp-label">{t('act.rankingEmpty')}</span>
          ) : (
            <div className="rp-list">
              {ranking.map((row, i) => (
                <Bar
                  key={row.name}
                  label={row.name}
                  value={row.percent === null ? formatBytes(row.download) : t('ui.share', {bytes: formatBytes(row.download), percent: row.percent})}
                  pct={row.percent ?? 0}
                  color={p.cat[i % p.cat.length]}
                />
              ))}
            </div>
          )}
        </div>
        <div className="rp-card">
          <div className="rp-row">
            <h3 className="rp-h3">{t('act.probeLatency')}</h3>
            <Button quiet small onPress={() => go('policies')}>
              {t('act.viewAll')}
            </Button>
          </div>
          <div className="rp-list">
            {[...NODES]
              .sort((x, y) => (x.alive ? (x.tcp ?? 0) : 1e9) - (y.alive ? (y.tcp ?? 0) : 1e9))
              .slice(0, 6)
              .map(n => (
                <Bar
                  key={n.name}
                  icon={<Flag name={n.name} />}
                  label={n.name}
                  value={n.alive && n.tcp !== undefined ? t('ui.latency', {n: n.tcp}) : n.unavailable ? t('act.timeout') : t('act.unknown')}
                  pct={n.alive ? ((n.tcp ?? 0) / 250) * 100 : 100}
                  color={n.alive ? ((n.tcp ?? 0) < 100 ? p.foam : p.gold) : p.love}
                />
              ))}
          </div>
        </div>
        <section className="rp-card" aria-label={t('act.issues')}>
          <div className="rp-row">
            <div className="rp-cluster">
              <h3 className="rp-h3">{t('act.issues')}</h3>
              {events.length > 0 && <span className="rp-label">{events.length}</span>}
            </div>
            <Button quiet small onPress={() => go('events')}>
              {t('act.viewAll')}
            </Button>
          </div>
          {feed.error && <p role="alert">{feed.error.message}</p>}
          {events.length === 0 ? (
            <span className="rp-label">{t(feed.available === false ? 'event.unavailable' : 'act.noIssues')}</span>
          ) : (
            <div className="rp-list" role="list">
              {events.map(event => {
                const summary = eventSummary(event);
                return (
                  <div key={event.id} role="listitem" className="rp-row">
                    <Light small tone={event.event === 'flow.gap' ? 'warn' : 'info'}>
                      {t(event.event === 'flow.gap' ? 'ui.warning' : 'ui.notice')}
                    </Light>
                    <span className="rp-note rp-grow">
                      {event.event} · {t(summary.key, summary.params)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
