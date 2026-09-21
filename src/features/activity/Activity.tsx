import {useMemo, useState} from 'react';
import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Clock from '../../ui/icons/Clock';
import Data from '../../ui/icons/Data';
import {useCapabilities, useConnections, useEventFeed, useNodes, useRuntime, useRuntimeMemory, useRuntimeOutbounds, useTrafficHistory} from '../../api/store';
import {
  connectionRows,
  eventSummary,
  healthMillis,
  lifecycleStates,
  lifecycleTone,
  localTime,
  outboundLabel,
  outboundUsage,
  preferredHealth,
  routineGap,
  sourceIp
} from '../../api/selectors';
import {addU64, formatBytes, formatRate, millis, parseU64, pctU64} from '../../api/u64';
import {useT, useLang, LOCALE} from '../../i18n';
import {Badge, CardLink, Segmented, Light, Bar, ErrorMessage, Loading, TextTooltip, Empty, Link} from '../../ui/ui';
import {buildHash} from '../../shell/route';
import {NodeMenu} from '../policies/Nodes';
import {AreaChart, Donut, Legend, Spark, fmtRate, usePalette} from '../../ui/Charts';
import {useMemorySeries} from '../overview/memory';
import {historyTrafficSamples, trafficWindow, trafficWindows, useTrafficSamples} from './traffic';
import {ModeCards} from './ModeSwitch';

export function Activity() {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const chartRate = (value: number | null | undefined) => fmtRate(value, locale, t);
  const p = usePalette();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  // Node and group tiles need those resources; a backend without them still gets traffic and connections.
  const hasNodes = resources?.nodes.available === true;
  const runtimeResource = useRuntime(),
    nodesResource = useNodes(hasNodes);
  const outbounds = useRuntimeOutbounds(capabilities.data?.resources.runtime_outbounds.available === true);
  const memory = useRuntimeMemory(capabilities.data?.resources.runtime_memory.available === true);
  const [range, setRange] = useState('live');
  const windowSeconds = trafficWindows[range] ?? 120;
  const rss = memory.data?.process?.rss_bytes ?? null;
  const memoryHistory = useMemorySeries(capabilities.data, memory.data, windowSeconds);
  const memorySamples = memoryHistory.samples;
  const memorySeries = [
    {label: t('act.rss'), color: p.cat[0], values: memorySamples.map(sample => sample.rss)},
    {label: t('act.cgroup'), color: p.cat[3], values: memorySamples.map(sample => sample.cgroup)}
  ];
  const memoryBytes = (value: number | null | undefined) => formatBytes(value == null ? null : BigInt(Math.round(value)));
  const cgroupPercent = pctU64(parseU64(memory.data?.cgroup?.current_bytes ?? null), parseU64(memory.data?.cgroup?.limit_bytes ?? null));
  const NODES = useMemo(
    () =>
      (nodesResource.data ?? []).map(n => {
        const health = preferredHealth(n);
        const alive = health?.state === 'unavailable' ? false : health?.state === 'healthy' ? true : undefined;
        return {id: n.id, name: n.name, tcp: healthMillis(health), alive, unavailable: health?.state === 'unavailable'};
      }),
    [nodesResource.data]
  );
  const [by, setBy] = useState('dev');
  const hasConnections = resources?.connections.available === true;
  const connections = useConnections(undefined, hasConnections);
  const feed = useEventFeed();
  const ranking = useMemo(() => {
    const totals = new Map<string, bigint | null>();
    for (const row of connectionRows(connections.data)) {
      const name = by === 'dev' ? sourceIp(row.src) : row.domain || row.dst;
      if (!name) continue;
      totals.set(name, addU64(totals.has(name) ? totals.get(name)! : 0n, row.download_bytes));
    }
    const rows = [...totals].map(([name, download]) => ({name, download}));
    const total = addU64(...rows.map(row => row.download));
    rows.sort((a, b) => (a.download === b.download ? 0 : a.download === null ? 1 : b.download === null ? -1 : a.download > b.download ? -1 : 1));
    return rows.slice(0, 5).map(row => ({...row, percent: pctU64(row.download, total)}));
  }, [by, connections.data]);
  const history = useTrafficHistory(windowSeconds, capabilities.data);
  // The backend's ring reaches back before the page opened; the session's own polls carry the chart past it.
  const polledTraffic = useTrafficSamples(runtimeResource.data);
  const historySamples = useMemo(() => (history.data ? historyTrafficSamples(history.data) : []), [history.data]);
  const series = useMemo(() => trafficWindow(polledTraffic, historySamples, windowSeconds), [polledTraffic, historySamples, windowSeconds]);
  // Sparklines use 24 five-second means over the last two minutes, independent of the chart window.
  const spark = useMemo(() => trafficWindow(polledTraffic, historySamples, trafficWindows.live, undefined, 24), [polledTraffic, historySamples]);
  const [chosenNode, setNodeName] = useState('');
  // Until a node is chosen: the first with a measurement, else the first proxy node; the built-ins come last.
  const node =
    NODES.find(n => n.name === chosenNode) ?? NODES.find(n => n.tcp !== undefined) ?? NODES.find(n => n.name !== 'direct' && n.name !== 'block') ?? NODES[0];
  const nodeName = node?.name ?? '';
  // A failed refresh keeps what the page already shows, with the error above it.
  const error = runtimeResource.error ?? nodesResource.error ?? capabilities.error;
  const alert = error && (
    <ErrorMessage
      error={error}
      onRetry={() => {
        capabilities.refetch();
        runtimeResource.refetch();
        nodesResource.refetch();
      }}
    />
  );
  if (!runtimeResource.data || (hasNodes && !nodesResource.data)) return alert || <Loading>{t('act.loading')}</Loading>;
  const liveRuntime = runtimeResource.data;
  const usage = outboundUsage(outbounds.data);
  const traffic = [
    {label: t('act.download'), color: p.cat[0], values: series.down},
    {label: t('act.upload'), color: p.cat[3], values: series.up}
  ];
  const OUT = usage.rows.map((r, i) => ({
    name: outboundLabel(r.name, t),
    value: r.percent === null ? null : Math.round(r.percent),
    text: formatBytes(r.bytes),
    // Only the engine's own block outbound is drawn as a refusal; a group may not take that name, but the kind says so.
    color: r.kind === 'builtin' && r.name === 'block' ? p.love : p.cat[i % p.cat.length]
  }));
  // Show actionable events only; runtime/flow ticks and routine ring gaps are chart housekeeping. Limit the list to 30 so the card scrolls instead of stretching its row.
  const events = feed.events.filter(event => event.event !== 'runtime.updated' && event.event !== 'flow.updated' && !routineGap(event)).slice(0, 30);
  return (
    <>
      {alert}
      <div className="rp-quick">
        <ModeCards />
        <div className="rp-card">
          <div className="rp-row">
            <Light tone={lifecycleTone(liveRuntime.lifecycle.state)}>{t(lifecycleStates[liveRuntime.lifecycle.state])}</Light>
            <Link appearance="button" className="quiet" href={buildHash('overview')}>
              {t('act.viewDetails')}
            </Link>
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
              <Spark values={spark.down} timestamps={spark.timestamps} color={p.cat[0]} floor={100} />
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
              <Spark values={spark.up} timestamps={spark.timestamps} color={p.cat[3]} floor={100} />
            </span>
          </div>
        </div>
        <CardLink href="#/connections" label={t('act.active')}>
          <span className="rp-tile-head rp-tint-c3">
            <LinkIcon />
            {t('act.active')}
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{liveRuntime.traffic.connections.total ?? '—'}</span>
            </span>
            <span className="rp-spark">
              <Spark values={spark.connections} timestamps={spark.timestamps} color={p.cat[2]} />
            </span>
          </div>
        </CardLink>
        <div className="rp-card">
          <span className="rp-tile-head rp-tint-c5">
            <Clock />
            {t('act.latency')}
            <NodeMenu label={t('act.node')} value={nodeName} onChange={setNodeName} nodes={NODES} />
          </span>
          <div className="rp-tile-body">
            <span className="rp-tile-val">
              <span className="rp-big">{node?.alive ? (node.tcp === undefined ? '—' : t('ui.latency', {n: millis(node.tcp)})) : '—'}</span>
            </span>
            <Light small tone={node?.alive ? 'ok' : node?.unavailable ? 'err' : 'muted'}>
              {node?.alive ? t('act.good') : node?.unavailable ? t('act.timeout') : t('act.unknown')}
            </Light>
          </div>
        </div>
        {capabilities.data?.resources.runtime_memory.available && (
          <div className="rp-card">
            <span className="rp-tile-head rp-tint-c2">
              <Data />
              {t('act.memory')}
            </span>
            <div className="rp-tile-body">
              <span className="rp-tile-val">
                <span className="rp-big">{formatBytes(rss)}</span>
              </span>
              {cgroupPercent !== null && (
                <Light small tone={cgroupPercent > 90 ? 'err' : cgroupPercent > 75 ? 'warn' : 'ok'}>
                  {t(cgroupPercent > 90 ? 'act.memoryNearLimit' : cgroupPercent > 75 ? 'act.memoryHigh' : 'act.memoryOk')}
                </Light>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rp-g21">
        <section className="rp-card" aria-labelledby="activity-traffic">
          <div className="rp-row">
            <h3 className="rp-h3" id="activity-traffic">
              {t('act.traffic')}
            </h3>
            <Segmented
              label={t('act.historyRange')}
              value={range}
              onChange={setRange}
              items={[
                ['live', t('act.live')],
                ['m10', t('act.m10')],
                ['h1', t('act.h1')],
                ['h6', t('act.h6')],
                ['h24', t('act.h24')],
                ['d7', t('act.d7')]
              ]}
            />
          </div>
          {history.error ? (
            <ErrorMessage error={history.error} />
          ) : capabilities.data?.resources.traffic_history.available === false ? (
            <span className="rp-label">{t('act.noHistory')}</span>
          ) : !history.data ? (
            <Loading>{t('act.loading')}</Loading>
          ) : !history.data.samples.length ? (
            <Empty>{t('act.emptyHistory')}</Empty>
          ) : (
            <>
              <Legend series={traffic} fmt={chartRate} />
              <AreaChart
                series={traffic}
                timestamps={series.timestamps}
                fmt={chartRate}
                locale={locale}
                height={120}
                fill
                window={{since: series.since, until: series.until}}
              />
            </>
          )}
        </section>
        <div className="rp-card">
          <div className="rp-row">
            <div className="rp-cluster">
              <h3 className="rp-h3">{t('act.outUsage')}</h3>
              {outbounds.data && <span className="rp-label">{t('act.since', {t: localTime(outbounds.data.counter_since, locale)})}</span>}
            </div>
          </div>
          {outbounds.error ? (
            <ErrorMessage error={outbounds.error} />
          ) : capabilities.data?.resources.runtime_outbounds.available === false ? (
            <span className="rp-label">{t('act.noOutbounds')}</span>
          ) : !outbounds.data ? (
            <Loading>{t('act.loading')}</Loading>
          ) : !OUT.length ? (
            <Empty>{t('ui.empty')}</Empty>
          ) : (
            <Donut rows={OUT} total={formatBytes(usage.total)} />
          )}
        </div>
      </div>

      <div className="rp-g3">
        <div className="rp-card">
          <div className="rp-row">
            <TextTooltip text={t('act.rankingScope')}>
              <h3 className="rp-h3">{t('act.topDevices')}</h3>
            </TextTooltip>
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
          {connections.error && <ErrorMessage error={connections.error} />}
          {connections.data?.truncated && (
            <TextTooltip text={t('act.rankingTruncated')}>
              <Badge tone="warn">{t('act.truncated')}</Badge>
            </TextTooltip>
          )}
          {!connections.data ? (
            connections.error ? null : hasConnections ? (
              <Loading>{t('act.loading')}</Loading>
            ) : (
              <Empty>{t('shell.notOfferedShort')}</Empty>
            )
          ) : ranking.length === 0 ? (
            <Empty>{t('act.rankingEmpty')}</Empty>
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
        <section className="rp-card" aria-labelledby="activity-memory">
          <div className="rp-row">
            <h3 className="rp-h3" id="activity-memory">
              {t('act.memory')}
            </h3>
            <Link appearance="button" className="quiet sm" href={buildHash('overview')}>
              {t('act.viewDetails')}
            </Link>
          </div>
          {memory.error || memoryHistory.error ? (
            <ErrorMessage error={memory.error ?? memoryHistory.error} />
          ) : memorySamples.length > 1 ? (
            <>
              <Legend series={memorySeries} fmt={memoryBytes} />
              <AreaChart
                series={memorySeries}
                timestamps={memorySamples.map(sample => sample.time)}
                fmt={memoryBytes}
                locale={locale}
                height={150}
                fill
                baseline="auto"
                window={{since: memoryHistory.since, until: memoryHistory.until}}
              />
            </>
          ) : capabilities.data?.resources.runtime_memory.available === false ? (
            <Empty>{t('act.noHistory')}</Empty>
          ) : (
            <div className="rp-chart-wait">
              <Loading>{t('act.sampling')}</Loading>
            </div>
          )}
        </section>
        <section className="rp-card" aria-label={t('act.issues')}>
          <div className="rp-row">
            <div className="rp-cluster">
              <h3 className="rp-h3">{t('act.issues')}</h3>
              {events.length > 0 && <span className="rp-label">{events.length}</span>}
            </div>
            <Link appearance="button" className="quiet sm" href={buildHash('events')}>
              {t('act.viewAll')}
            </Link>
          </div>
          {feed.error && <ErrorMessage error={feed.error} />}
          {!feed.error && feed.available === null ? (
            <Loading />
          ) : events.length === 0 ? (
            <Empty>{t(feed.available === false ? 'event.unavailable' : 'act.noIssues')}</Empty>
          ) : (
            <div className="rp-list rp-feed" role="list">
              {events.map(event => {
                const summary = eventSummary(event, t);
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
