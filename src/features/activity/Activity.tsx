import {useMemo, useState} from 'react';
import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Clock from '../../ui/icons/Clock';
import Data from '../../ui/icons/Data';
import Shuffle from '../../ui/icons/Shuffle';
import Filter from '../../ui/icons/Filter';
import {
  useCapabilities,
  useConnections,
  useEventFeed,
  useGroups,
  useNodes,
  useRuntime,
  useRuntimeMemory,
  useRuntimeOutbounds,
  useTrafficHistory
} from '../../api/store';
import {connectionRows, eventSummary, lifecycleStates, localTime, outboundUsage, preferredHealth, sourceIp, trafficSeries} from '../../api/selectors';
import {addU64, formatBytes, formatRate, parseU64, pctU64} from '../../api/u64';
import {useT, useLang, LOCALE} from '../../i18n';
import {Badge, Button, CardLink, Segmented, MenuButton, Light, Bar, ErrorMessage, Loading, TextTooltip, toast} from '../../ui/ui';
import type {Key} from '../../i18n/messages';

const modeLabels: Record<string, Key> = {rule: 'mode.rule', global: 'mode.global', direct: 'mode.direct'};
import {NodeMenu} from '../policies/Nodes';
import {AreaChart, Donut, Legend, Spark, fmtRate, usePalette} from '../../ui/Charts';
import {useMemorySeries} from '../overview/memory';

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
  const memory = useRuntimeMemory(capabilities.data?.resources.runtime_memory.available === true);
  const rss = memory.data?.process?.rss_bytes ?? null;
  const memoryHistory = useMemorySeries(capabilities.data, memory.data);
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
        return {id: n.id, name: n.name, tcp: health?.latency_ms ?? undefined, alive: health?.state === 'healthy', unavailable: health?.state === 'unavailable'};
      }),
    [nodesResource.data]
  );
  const [by, setBy] = useState('dev');
  const connections = useConnections();
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
  const [range, setRange] = useState('live');
  const history = useTrafficHistory(range, capabilities.data);
  const series = useMemo(() => trafficSeries(history.data), [history.data]);
  // The quick row keeps its choice locally until the contract carries an outbound mode and a global target.
  const [mode, setMode] = useState('rule');
  const [chosenTarget, setTarget] = useState('');
  const [chosenNode, setNodeName] = useState('');
  const node = NODES.find(n => n.name === chosenNode) ?? NODES[0];
  const nodeName = node?.name ?? '';
  const error = runtimeResource.error ?? nodesResource.error ?? groupsResource.error ?? capabilities.error;
  if (error) return <ErrorMessage error={error} />;
  if (!runtimeResource.data || !nodesResource.data || !groupsResource.data) return <Loading>{t('act.loading')}</Loading>;
  const liveRuntime = runtimeResource.data;
  const groups = groupsResource.data;
  const target = groups.some(g => g.name === chosenTarget) ? chosenTarget : (groups[0]?.name ?? '—');
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
      <div className="rp-quick">
        <div className="rp-card">
          <div className="rp-row">
            <span className="rp-qlabel rp-tint-c3">
              <Shuffle />
              {t('act.mode')}
            </span>
            <Segmented
              label={t('act.mode')}
              value={mode}
              onChange={k => {
                setMode(k);
                toast('positive', t('act.modeChanged', {mode: t(modeLabels[k])}));
              }}
              items={[
                ['rule', t('mode.rule')],
                ['global', t('mode.global')],
                ['direct', t('mode.direct')]
              ]}
            />
          </div>
        </div>
        <div className="rp-card">
          <div className="rp-row">
            <span className="rp-qlabel rp-tint-c2">
              <Filter />
              {t('act.global')}
            </span>
            <MenuButton quiet label={t('act.global')} value={target} onChange={setTarget} items={groups.map(g => ({id: g.name, label: g.name}))}>
              {target}
            </MenuButton>
          </div>
        </div>
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
              <Spark values={series.connections} timestamps={series.timestamps} color={p.cat[2]} />
            </span>
          </div>
        </CardLink>
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
            <span className="rp-empty">{t('act.emptyHistory')}</span>
          ) : (
            <>
              <Legend series={traffic} fmt={chartRate} />
              <AreaChart series={traffic} timestamps={series.timestamps} fmt={chartRate} locale={locale} height={120} />
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
            <span className="rp-empty">{t('ui.empty')}</span>
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
            connections.error ? null : (
              <Loading>{t('act.loading')}</Loading>
            )
          ) : ranking.length === 0 ? (
            <span className="rp-empty">{t('act.rankingEmpty')}</span>
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
            <Button quiet small onPress={() => go('overview')}>
              {t('act.viewDetails')}
            </Button>
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
                baseline="auto"
              />
            </>
          ) : capabilities.data?.resources.runtime_memory.available === false ? (
            <span className="rp-empty">{t('act.noHistory')}</span>
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
            <Button quiet small onPress={() => go('events')}>
              {t('act.viewAll')}
            </Button>
          </div>
          {feed.error && <ErrorMessage error={feed.error} />}
          {!feed.error && feed.available === null ? (
            <Loading />
          ) : events.length === 0 ? (
            <span className="rp-empty">{t(feed.available === false ? 'event.unavailable' : 'act.noIssues')}</span>
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
