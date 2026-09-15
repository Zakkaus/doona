// Activity page in the Rosé Pine skin: same content and data as the S2 page, controls from ./ui.
import {useMemo, useState} from 'react';
import Download from '../../ui/icons/Download';
import Upload from '../../ui/icons/Upload';
import LinkIcon from '../../ui/icons/Link';
import Clock from '../../ui/icons/Clock';
import Shuffle from '../../ui/icons/Shuffle';
import Filter from '../../ui/icons/Filter';
import DeviceDesktop from '../../ui/icons/DeviceDesktop';
import DevicePhone from '../../ui/icons/DevicePhone';
import {runtime, checks, events, type Mode} from '../clash-compat/fixtures';
import {useCapabilities, useGroups, useNodes, useRuntime, useRuntimeOutbounds, useTrafficHistory} from '../../api/store';
import {localTime, outboundUsage, preferredHealth, trafficSeries} from '../../api/selectors';
import {formatBytes, formatRate} from '../../api/u64';
import {useT} from '../../i18n/i18n';
import {Button, Segmented, MenuButton, Light, Bar, toast} from '../../ui/ui';
import {NodeMenu} from '../policies/Nodes';
import {Flag} from '../policies/Flag';
import {AreaChart, Donut, Legend, Spark, fmtRate, usePalette} from '../../ui/Charts';

type Top = Array<[string, number, string, 'desktop' | 'phone']>;
const TOP: Record<string, Top> = {
  dev: [
    ['10.0.0.7', 84, '84 MB', 'desktop'],
    ['10.0.0.31', 4, '3.6 MB', 'phone'],
    ['10.0.0.12', 2, '1.3 MB', 'desktop'],
    ['10.0.0.20', 1, '140 KB', 'phone'],
    ['10.0.0.9', 1, '96 KB', 'desktop']
  ],
  host: [
    ['cdn.bilibili.com', 83, '83 MB', 'desktop'],
    ['discord.com', 4, '3.4 MB', 'desktop'],
    ['api.telegram.org', 2, '1.2 MB', 'phone'],
    ['52.84.19.3', 1, '312 KB', 'desktop'],
    ['203.0.113.9', 1, '96 KB', 'phone']
  ]
};

// One row per timed-out node, or a single summary row once there are more than three.
function timeoutIssues(names: string[], timeout: string, many: string, sep: string): string[] {
  if (names.length <= 3) return names.map(n => n + ' ' + timeout);
  return [many.replace('{n}', String(names.length)).replace('{list}', names.slice(0, 3).join(sep) + '…')];
}
export function Activity({go}: {go: (page: string) => void}) {
  const t = useT();
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
  const failing = checks.filter(c => !c.ready);
  const [by, setBy] = useState('dev');
  const [range, setRange] = useState('live');
  const history = useTrafficHistory(range, capabilities.data);
  const series = useMemo(() => trafficSeries(history.data), [history.data]);
  const [mode, setMode] = useState<Mode>(runtime.mode);
  const [chosenTarget, setTarget] = useState(runtime.globalTarget);
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
  const groups = groupsResource.data;
  const target = groups.some(g => g.name === chosenTarget) ? chosenTarget : (groups[0]?.name ?? '—');
  const usage = outboundUsage(outbounds.data);
  const sep = t('act.sep2');
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
  type Issue = {level: 'err' | 'warn' | 'info'; text: string; page: string};
  const RANK = {err: 0, warn: 1, info: 2};
  const issues: Issue[] = [
    ...timeoutIssues(
      NODES.filter(n => n.unavailable).map(n => n.name),
      t('act.timeout'),
      t('act.nTimeouts'),
      t('act.sep')
    ).map(text => ({level: 'err' as const, text, page: 'policies'})),
    ...failing.map(c => ({
      level: 'warn' as const,
      text: t(`check.${c.id}` as 'check.ebpf') + ' ' + t('act.notReady') + sep + t('act.needRestart'),
      page: 'overview'
    })),
    ...events
      .filter(e => e.level !== 'error' && e.kind !== '探測')
      .map(e => ({
        level: e.level === 'warn' ? ('warn' as const) : ('info' as const),
        text: t(`ev.${e.id}` as 'ev.e1'),
        page: (e.ref ?? '#/events').replace('#/', '')
      }))
  ]
    .sort((x, y) => RANK[x.level] - RANK[y.level])
    .slice(0, 6);
  const lvl = (l: Issue['level']) => (l === 'err' ? t('act.lvlErr') : l === 'warn' ? t('act.lvlWarn') : t('act.lvlInfo'));
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
                setMode(k as Mode);
                toast('positive', t('act.mode') + (t('lang') === 'Language' ? ': ' : '：') + t(`mode.${k}` as 'mode.rule'));
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
            <Light tone={liveRuntime.lifecycle.state === 'running' ? 'ok' : 'warn'}>
              {t(`lifecycle.${liveRuntime.lifecycle.state}` as 'lifecycle.running')}
            </Light>
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
              <span className="rp-big">{node?.alive ? (node.tcp === undefined ? '—' : node.tcp + ' ms') : '—'}</span>
              {node?.alive && <span className="rp-delta good">↓ 12%</span>}
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
            <span className="rp-title">{t('act.traffic')}</span>
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
              <Legend series={traffic} fmt={fmtRate} />
              <AreaChart series={traffic} timestamps={series.timestamps} fmt={fmtRate} height={120} />
            </>
          )}
        </div>
        <div className="rp-card">
          <div className="rp-row">
            <span className="rp-cluster">
              <span className="rp-title">{t('act.outUsage')}</span>
              {outbounds.data && <span className="rp-label">{t('act.since').replace('{t}', localTime(outbounds.data.counter_since))}</span>}
            </span>
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
            <span className="rp-title">{t('act.topDevices')}</span>
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
          <div className="rp-list">
            {TOP[by].map(([k, v, tx, kind], i) => (
              <div key={k} className="rp-dev">
                {kind === 'phone' ? <DevicePhone /> : <DeviceDesktop />}
                <Bar label={k} value={tx + sep + v + '%'} pct={v} color={p.cat[i % p.cat.length]} />
              </div>
            ))}
          </div>
        </div>
        <div className="rp-card">
          <div className="rp-row">
            <span className="rp-title">{t('act.probeLatency')}</span>
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
                  value={n.alive && n.tcp !== undefined ? n.tcp + ' ms' : n.unavailable ? t('act.timeout') : t('act.unknown')}
                  pct={n.alive ? ((n.tcp ?? 0) / 250) * 100 : 100}
                  color={n.alive ? ((n.tcp ?? 0) < 100 ? p.foam : p.gold) : p.love}
                />
              ))}
          </div>
        </div>
        <div className="rp-card">
          <div className="rp-row">
            <span className="rp-cluster">
              <span className="rp-title">{t('act.issues')}</span>
              {issues.length > 0 && <span className="rp-label">{issues.length}</span>}
            </span>
            <Button quiet small onPress={() => go('overview')}>
              {t('act.viewAll')}
            </Button>
          </div>
          {issues.length === 0 ? (
            <span className="rp-label">{t('act.noIssues')}</span>
          ) : (
            <div className="rp-issues">
              {issues.map(i => (
                <div key={i.text}>
                  <div className="rp-issue">
                    <span className="lvl">
                      <Light small tone={i.level}>
                        {lvl(i.level)}
                      </Light>
                    </span>
                    <span className="txt">{i.text}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
