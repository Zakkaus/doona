// Activity page in the Rosé Pine skin: same content and data as the S2 page, controls from ./ui.
import {useState} from 'react';
import Download from '@react-spectrum/s2/icons/Download';
import Upload from '@react-spectrum/s2/icons/Upload';
import LinkIcon from '@react-spectrum/s2/icons/Link';
import Clock from '@react-spectrum/s2/icons/Clock';
import Shuffle from '@react-spectrum/s2/icons/Shuffle';
import Filter from '@react-spectrum/s2/icons/Filter';
import DeviceDesktop from '@react-spectrum/s2/icons/DeviceDesktop';
import DevicePhone from '@react-spectrum/s2/icons/DevicePhone';
import {runtime, checks, conns, groups, events, throughput, connSeries, type Mode} from '../app/mock';
import {useT} from '../app/i18n';
import {Button, Segmented, MenuButton, InlineSelect, Light, Bar} from './ui';
import {AreaChart, Donut, Legend, Spark, fmtRate, usePalette} from './Charts';

type Top = Array<[string, number, string, 'desktop' | 'phone']>;
const TOP: Record<string, Top> = {
  dev: [['10.0.0.7', 84, '84 MB', 'desktop'], ['10.0.0.31', 4, '3.6 MB', 'phone'], ['10.0.0.12', 2, '1.3 MB', 'desktop'], ['10.0.0.20', 1, '140 KB', 'phone'], ['10.0.0.9', 1, '96 KB', 'desktop']],
  host: [['cdn.bilibili.com', 83, '83 MB', 'desktop'], ['discord.com', 4, '3.4 MB', 'desktop'], ['api.telegram.org', 2, '1.2 MB', 'phone'], ['52.84.19.3', 1, '312 KB', 'desktop'], ['203.0.113.9', 1, '96 KB', 'phone']]
};
const NODES = [...new Map(groups.flatMap(g => g.nodes).map(n => [n.name, n])).values()];
const latest = throughput[throughput.length - 1];

export function Activity({go}: {go: (page: string) => void}) {
  const t = useT(); const p = usePalette();
  const failing = checks.filter(c => !c.ready);
  const [by, setBy] = useState('dev');
  const [range, setRange] = useState('live');
  const [mode, setMode] = useState<Mode>(runtime.mode);
  const [target, setTarget] = useState(runtime.globalTarget);
  const [nodeName, setNodeName] = useState(NODES[0].name);
  const node = NODES.find(n => n.name === nodeName) ?? NODES[0];
  const sep = t('act.sep2');
  const traffic = [{label: t('act.download'), color: p.pine, values: throughput.map(s => s.down)}, {label: t('act.upload'), color: p.rose, values: throughput.map(s => s.up)}];
  const OUT = [{name: 'direct', value: 78, text: '1.1 GB', color: p.pine}, {name: 'proxy', value: 20, text: '312 MB', color: p.foam}, {name: 'resilient', value: 1, text: '96 KB', color: p.iris}, {name: 'gaming', value: 1, text: '12 KB', color: p.gold}, {name: 'block', value: 0, text: '0', color: p.love}];
  type Issue = {level: 'err' | 'warn' | 'info', text: string, page: string};
  const RANK = {err: 0, warn: 1, info: 2};
  const issues: Issue[] = [
    ...[...new Set(groups.flatMap(g => g.nodes.filter(n => !n.alive).map(n => n.name)))].map(n => ({level: 'err' as const, text: n + ' ' + t('act.timeout'), page: 'policies'})),
    ...failing.map(c => ({level: 'warn' as const, text: t(`check.${c.id}` as 'check.ebpf') + ' ' + t('act.notReady') + sep + t('act.needRestart'), page: 'overview'})),
    ...events.filter(e => e.level !== 'error' && e.kind !== '探測').map(e => ({level: e.level === 'warn' ? 'warn' as const : 'info' as const, text: t(`ev.${e.id}` as 'ev.e1'), page: (e.ref ?? '#/events').replace('#/', '')}))
  ].sort((x, y) => RANK[x.level] - RANK[y.level]).slice(0, 6);
  const lvl = (l: Issue['level']) => l === 'err' ? t('act.lvlErr') : l === 'warn' ? t('act.lvlWarn') : t('act.lvlInfo');
  return (
    <>
      <div className="rp-quick">
        <div className="rp-card"><div className="rp-row"><span className="rp-qlabel"><Shuffle />{t('act.mode')}</span><Segmented label={t('act.mode')} value={mode} onChange={k => setMode(k as Mode)} items={[['rule', t('mode.rule')], ['global', t('mode.global')], ['direct', t('mode.direct')]]} /></div></div>
        <div className="rp-card"><div className="rp-row"><span className="rp-qlabel"><Filter />{t('act.global')}</span><MenuButton quiet label={t('act.global')} value={target} onChange={setTarget} items={groups.map(g => ({id: g.name, label: g.name}))}>{target}</MenuButton></div></div>
        <div className="rp-card"><div className="rp-row"><Light tone="ok">{t('act.running')}</Light><Button quiet onPress={() => go('overview')}>{t('act.viewDetails')}</Button></div></div>
      </div>

      <div className="rp-strip">
        <div className="rp-card"><span className="rp-tile-head"><Download />{t('act.download')}</span><div className="rp-tile-body"><span className="rp-tile-val"><span className="rp-big">{fmtRate(latest.down)}</span><span className="rp-delta">↑ 12%</span></span><span className="rp-spark"><Spark values={traffic[0].values} color={p.pine} /></span></div></div>
        <div className="rp-card"><span className="rp-tile-head"><Upload />{t('act.upload')}</span><div className="rp-tile-body"><span className="rp-tile-val"><span className="rp-big">{fmtRate(latest.up)}</span><span className="rp-delta">↓ 8%</span></span><span className="rp-spark"><Spark values={traffic[1].values} color={p.rose} /></span></div></div>
        <div className="rp-card"><span className="rp-tile-head"><LinkIcon />{t('act.active')}</span><div className="rp-tile-body"><span className="rp-tile-val"><span className="rp-big">{conns.length}</span><span className="rp-delta">↑ 2</span></span><span className="rp-spark"><Spark values={connSeries} color={p.iris} /></span></div></div>
        <div className="rp-card"><span className="rp-tile-head"><Clock />{t('act.latency')}<InlineSelect label={t('act.node')} value={nodeName} onChange={setNodeName} items={NODES.map(n => ({id: n.name, label: n.name, desc: n.alive ? n.tcp + ' ms' : t('act.timeout')}))} /></span><div className="rp-tile-body"><span className="rp-tile-val"><span className="rp-big">{node.alive ? node.tcp + ' ms' : t('act.timeout')}</span>{node.alive && <span className="rp-delta">↓ 12%</span>}</span><Light small tone={node.alive ? 'ok' : 'err'}>{node.alive ? t('act.good') : t('act.timeout')}</Light></div></div>
      </div>

      <div className="rp-g21">
        <div className="rp-card">
          <div className="rp-row"><span className="rp-title">{t('act.traffic')}</span><Segmented label={t('act.window')} value={range} onChange={setRange} items={[['live', t('act.live')], ['h1', t('act.h1')], ['h6', t('act.h6')], ['h24', t('act.h24')], ['d7', t('act.d7')]]} /></div>
          <Legend series={traffic} fmt={fmtRate} />
          <AreaChart series={traffic} fmt={fmtRate} height={120} />
        </div>
        <div className="rp-card">
          <div className="rp-row"><span className="rp-cluster"><span className="rp-title">{t('act.outUsage')}</span><span className="rp-label">{t('act.lastHour')}</span></span></div>
          <Donut rows={OUT} total="1.4 GB" />
        </div>
      </div>

      <div className="rp-g3">
        <div className="rp-card">
          <div className="rp-row"><span className="rp-title">{t('act.topDevices')}</span><Segmented label={t('act.topDevices')} value={by} onChange={setBy} items={[['dev', t('act.devices')], ['host', t('act.domains')]]} /></div>
          <div className="rp-list">{TOP[by].map(([k, v, tx, kind]) => <div key={k} className="rp-dev">{kind === 'phone' ? <DevicePhone /> : <DeviceDesktop />}<Bar label={k} value={tx + sep + v + '%'} pct={v} color={p.pine} /></div>)}</div>
        </div>
        <div className="rp-card">
          <div className="rp-row"><span className="rp-title">{t('act.probeLatency')}</span><Button quiet small onPress={() => go('policies')}>{t('act.viewAll')}</Button></div>
          <div className="rp-list">{[...NODES].sort((x, y) => (x.alive ? x.tcp ?? 0 : 1e9) - (y.alive ? y.tcp ?? 0 : 1e9)).map(n => <Bar key={n.name} label={n.name} value={n.alive ? (n.tcp ?? 0) + ' ms' : t('act.timeout')} pct={n.alive ? ((n.tcp ?? 0) / 250) * 100 : 100} color={n.alive ? ((n.tcp ?? 0) < 100 ? p.foam : p.gold) : p.love} />)}</div>
        </div>
        <div className="rp-card">
          <div className="rp-row"><span className="rp-cluster"><span className="rp-title">{t('act.issues')}</span>{issues.length > 0 && <span className="rp-label">{issues.length}</span>}</span><Button quiet small onPress={() => go('overview')}>{t('act.viewAll')}</Button></div>
          {issues.length === 0 ? <span className="rp-label">{t('act.noIssues')}</span> : <div className="rp-issues">{issues.map(i => <div key={i.text}><div className="rp-issue"><span className="lvl"><Light small tone={i.level}>{lvl(i.level)}</Light></span><span className="txt">{i.text}</span></div></div>)}</div>}
        </div>
      </div>
    </>
  );
}
