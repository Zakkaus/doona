// Activity: overview dashboard on static gray panels. Quick switches, stat strip with sparklines, traffic and outbound usage, breakdowns, notifications.
import {useEffect, useMemo, useState} from 'react';
import {Text} from '@react-spectrum/s2/Text';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Divider} from '@react-spectrum/s2/Divider';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {Menu, MenuTrigger, MenuItem} from '@react-spectrum/s2/Menu';
import {Picker, PickerItem, PickerSection} from '@react-spectrum/s2/Picker';
import {Header, Heading} from '@react-spectrum/s2';
import {regionOf} from '../geo';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {style, iconStyle} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key} from '@react-spectrum/s2';
import Download from '@react-spectrum/s2/icons/Download';
import Upload from '@react-spectrum/s2/icons/Upload';
import LinkIcon from '@react-spectrum/s2/icons/Link';
import Clock from '@react-spectrum/s2/icons/Clock';
import ChevronDown from '@react-spectrum/s2/icons/ChevronDown';
import Shuffle from '@react-spectrum/s2/icons/Shuffle';
import Filter from '@react-spectrum/s2/icons/Filter';
import DeviceDesktop from '@react-spectrum/s2/icons/DeviceDesktop';
import DevicePhone from '@react-spectrum/s2/icons/DevicePhone';
import {page, card, label, list, toast} from '../ui';
import {runtime, checks, events, type Mode} from '../mock';
import {useCapabilities, useGroups, useNodes, useRuntime, useRuntimeOutbounds, useTrafficHistory} from '../../api/store';
import {localTime, outboundUsage, preferredHealth, trafficSeries} from '../../api/selectors';
import {formatBytes, formatRate} from '../../api/u64';
import {Flag} from '../Flag';
const valueRow = style({display: 'inline-flex', alignItems: 'center'});
import {useT} from '../i18n';
import {AreaChart, BarRow, Donut, Legend, Spark, fmtRate, type SeriesColor} from '../TrafficChart';
import type {PageProps} from '../Shell';

type Top = Array<[string, number, string, 'desktop' | 'phone']>; // name, share %, bytes, kind
const TOP: Record<string, Top> = {
  dev: [['10.0.0.7', 84, '84 MB', 'desktop'], ['10.0.0.31', 4, '3.6 MB', 'phone'], ['10.0.0.12', 2, '1.3 MB', 'desktop'], ['10.0.0.20', 1, '140 KB', 'phone'], ['10.0.0.9', 1, '96 KB', 'desktop']],
  host: [['cdn.bilibili.com', 83, '83 MB', 'desktop'], ['discord.com', 4, '3.4 MB', 'desktop'], ['api.telegram.org', 2, '1.2 MB', 'phone'], ['52.84.19.3', 1, '312 KB', 'desktop'], ['203.0.113.9', 1, '96 KB', 'phone']]
};
type LatencyNode = {id: string; name: string; tcp?: number; alive: boolean; unavailable: boolean};
// Sections by region once the list is long; sorted by latency inside each section.
function useNodeSections(nodes: LatencyNode[], selectedName: string) {
  const all = useMemo(() => nodes.length > 12 ? [...nodes].sort((a, b) => (a.alive ? a.tcp ?? 0 : 1e9) - (b.alive ? b.tcp ?? 0 : 1e9)).reduce((acc, n) => {
    const region = regionOf(n.name) ?? '—';
    const section = acc.find(([key]) => key === region);
    if (section) section[1].push(n); else acc.push([region, [n]]);
    return acc;
  }, [] as Array<[string, LatencyNode[]]>) : [], [nodes]);
  const [pages, setPages] = useState(1);
  const [state, setState] = useState<'loadingMore' | 'idle'>('idle');
  useEffect(() => { if (state === 'idle') return; const id = setTimeout(() => { setPages(p => p + 1); setState('idle'); }, 350); return () => clearTimeout(id); }, [state]);
  const shown = all.slice(0, pages * 3);
  const selectedSection = all.find(([, members]) => members.some(n => n.name === selectedName));
  if (selectedSection && !shown.includes(selectedSection)) shown.push(selectedSection);
  const loadMore = () => { if (state === 'idle' && shown.length < all.length) setState('loadingMore'); };
  return {sections: shown, loadingState: state, loadMore, grouped: all.length > 1};
}

const quick = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], sm: ['repeat(2, minmax(0, 1fr))'], xl: ['minmax(0, 1.5fr)', 'repeat(2, minmax(0, 1fr))']}, gap: 12});
const strip = style({display: 'grid', gridTemplateColumns: {default: ['repeat(2, minmax(0, 1fr))'], lg: ['repeat(4, minmax(0, 1fr))']}, gap: 12});
const grid21 = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: ['minmax(0, 2fr)', 'minmax(0, 1fr)']}, gap: 12, alignItems: 'stretch'});
const grid3 = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: ['repeat(3, minmax(0, 1fr))']}, gap: 12, alignItems: 'stretch'});
const row = style({display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32, flexWrap: 'wrap'});
// Five range buttons do not fit a phone-width card; the control scrolls sideways rather than pushing the card wider.
const scroller = style({maxWidth: 'full', overflowX: 'auto'});
const cluster = style({display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0});
const qLabel = style({display: 'flex', alignItems: 'center', gap: 8, font: 'ui', fontWeight: 'medium', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis'});
const title = style({font: 'title-sm'});
const stack = style({display: 'flex', flexDirection: 'column', gap: 8});
const tileHead = style({display: 'flex', alignItems: 'center', gap: 8, minHeight: 24, font: 'detail', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'});
const tileBody = style({display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, minHeight: 32});
const tileVal = style({display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap'});
const big = style({font: 'title-lg', lineHeight: 'ui'});
const delta = style({font: 'ui-sm', color: 'gray-700'});
const tileSpark = style({flexGrow: 1, minWidth: 0, maxWidth: 120});
const grayIcon = iconStyle({color: 'gray'});
const issueRow = style({display: 'flex', alignItems: 'center', gap: 8, minHeight: 32});
const issueLevel = style({width: 80, flexShrink: 0});
const issueText = style({font: 'ui-sm', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'});
const devRow = style({display: 'flex', alignItems: 'center', gap: 8, minHeight: 28});

function Panel({children}: {children: React.ReactNode}) {
  return <div className={card}><div className={stack}>{children}</div></div>;
}
function More({onPress, children}: {onPress: () => void, children: string}) {
  return <ActionButton isQuiet size="S" onPress={onPress}><Text>{children}</Text></ActionButton>;
}

// One row per timed-out node, or a single summary row once there are more than three.
function timeoutIssues(names: string[], timeout: string, many: string, sep: string): string[] {
  if (names.length <= 3) return names.map(n => n + ' ' + timeout);
  return [many.replace('{n}', String(names.length)).replace('{list}', names.slice(0, 3).join(sep) + '…')];
}
export function Activity({go}: PageProps) {
  const t = useT();
  const runtimeResource = useRuntime(), nodesResource = useNodes(), groupsResource = useGroups(), capabilities = useCapabilities();
  const outbounds = useRuntimeOutbounds(capabilities.data?.resources.runtime_outbounds.available === true);
  const NODES = useMemo(() => (nodesResource.data ?? []).map(n => {
    const health = preferredHealth(n);
    return {id: n.id, name: n.name, tcp: health?.latency_ms ?? undefined, alive: health?.state === 'healthy', unavailable: health?.state === 'unavailable'};
  }), [nodesResource.data]);
  const failing = checks.filter(c => !c.ready);
  const [by, setBy] = useState<Key>('dev');
  const [range, setRange] = useState<Key>('live');
  const history = useTrafficHistory(String(range), capabilities.data);
  const series = useMemo(() => trafficSeries(history.data), [history.data]);
  const [mode, setMode] = useState<Mode>(runtime.mode);
  const [chosenTarget, setTarget] = useState(runtime.globalTarget);
  const [chosenNode, setNodeName] = useState('');
  const node = NODES.find(n => n.name === chosenNode) ?? NODES[0];
  const nodeName = node?.name ?? '';
  const sec = useNodeSections(NODES, nodeName);
  const error = runtimeResource.error ?? nodesResource.error ?? groupsResource.error ?? capabilities.error;
  if (error) return <div role="alert">{t('act.loadFailed')} {error.message}</div>;
  if (!runtimeResource.data || !nodesResource.data || !groupsResource.data) return <div role="status">{t('act.loading')}</div>;
  const liveRuntime = runtimeResource.data;
  const groups = groupsResource.data;
  const target = groups.some(g => g.name === chosenTarget) ? chosenTarget : groups[0]?.name ?? '—';
  const usage = outboundUsage(outbounds.data);
  const colors: SeriesColor[] = ['accent', 'accent2', 'muted', 'muted2'];
  const OUT = usage.rows.map((r, i) => ({name: r.name, value: r.percent === null ? null : Math.round(r.percent), text: formatBytes(r.bytes), color: r.name === 'block' ? 'red' as const : colors[i % colors.length]}));
  const sep = t('act.sep2');
  const sep2 = t('lang') === 'Language' ? ': ' : '：';
  const traffic = [{label: t('act.download'), color: 'accent' as const, values: series.down}, {label: t('act.upload'), color: 'orange' as const, values: series.up}];
  type Issue = {level: 'notice' | 'negative' | 'informative', text: string, page: string};
  const RANK = {negative: 0, notice: 1, informative: 2};
  // Errors first, then warnings, then plain notices from the event log; capped so the panel stays one screen.
  const issues: Issue[] = [
    ...timeoutIssues(NODES.filter(n => n.unavailable).map(n => n.name), t('act.timeout'), t('act.nTimeouts'), t('act.sep')).map(text => ({level: 'negative' as const, text, page: 'policies'})),
    ...failing.map(c => ({level: 'notice' as const, text: t(`check.${c.id}` as 'check.ebpf') + ' ' + t('act.notReady') + sep + t('act.needRestart'), page: 'overview'})),
    ...events.filter(e => e.level !== 'error' && e.kind !== '探測').map(e => ({level: e.level === 'warn' ? 'notice' as const : 'informative' as const, text: t(`ev.${e.id}` as 'ev.e1'), page: (e.ref ?? '#/events').replace('#/', '')}))
  ].sort((x, y) => RANK[x.level] - RANK[y.level]).slice(0, 6);
  return (
    <div className={page}>
      <div className={quick}>
        <div className={card}><div className={row}><span className={qLabel}><Shuffle styles={grayIcon} />{t('act.mode')}</span><SegmentedControl aria-label={t('act.mode')} selectedKey={mode} onSelectionChange={k => { setMode(k as Mode); toast('positive', t('act.mode') + sep2 + t(`mode.${String(k)}` as 'mode.rule')); }}><SegmentedControlItem id="rule">{t('mode.rule')}</SegmentedControlItem><SegmentedControlItem id="global">{t('mode.global')}</SegmentedControlItem><SegmentedControlItem id="direct">{t('mode.direct')}</SegmentedControlItem></SegmentedControl></div></div>
        <div className={card}><div className={row}><span className={qLabel}><Filter styles={grayIcon} />{t('act.global')}</span><MenuTrigger><ActionButton isQuiet><Text>{target}</Text><ChevronDown /></ActionButton><Menu selectionMode="multiple" disallowEmptySelection selectedKeys={[target]} onSelectionChange={k => { if (k === 'all') return; const next = [...k].find(x => x !== target); if (next) setTarget(String(next)); }}>{groups.map(g => <MenuItem key={g.name} id={g.name}>{g.name}</MenuItem>)}</Menu></MenuTrigger></div></div>
        <div className={card}><div className={row}><StatusLight variant={liveRuntime.lifecycle.state === 'running' ? 'positive' : 'notice'}><Text>{t(`lifecycle.${liveRuntime.lifecycle.state}` as 'lifecycle.running')}</Text></StatusLight><ActionButton isQuiet onPress={() => go('overview')}><Text>{t('act.viewDetails')}</Text></ActionButton></div></div>
      </div>

      <div className={strip}>
        <Panel><span className={tileHead}><Download styles={grayIcon} />{t('act.download')}</span><div className={tileBody}><span className={tileVal}><span className={big}>{formatRate(liveRuntime.traffic.rates?.download_bytes_per_second ?? null)}</span></span><span className={tileSpark}><Spark values={series.down} timestamps={series.timestamps} color="accent" /></span></div></Panel>
        <Panel><span className={tileHead}><Upload styles={grayIcon} />{t('act.upload')}</span><div className={tileBody}><span className={tileVal}><span className={big}>{formatRate(liveRuntime.traffic.rates?.upload_bytes_per_second ?? null)}</span></span><span className={tileSpark}><Spark values={series.up} timestamps={series.timestamps} color="orange" /></span></div></Panel>
        <Panel><span className={tileHead}><LinkIcon styles={grayIcon} />{t('act.active')}</span><div className={tileBody}><span className={tileVal}><span className={big}>{liveRuntime.traffic.connections.total ?? '—'}</span></span><span className={tileSpark}><Spark values={series.connections} timestamps={series.timestamps} color="orange" /></span></div></Panel>
        <Panel><span className={tileHead}><Clock styles={grayIcon} />{t('act.latency')}<Picker aria-label={t('act.node')} isQuiet size="S" selectedKey={nodeName} onSelectionChange={k => { if (k != null) setNodeName(String(k)); }} loadingState={sec.loadingState} onLoadMore={sec.loadMore} renderValue={items => { const name = (items[0] as typeof NODES[number] | undefined)?.name ?? nodeName; return <span className={valueRow}><Flag name={name} />{name}</span>; }}>{sec.grouped ? sec.sections.map(([r, list]) => <PickerSection key={r} id={r}><Header><Heading>{r}</Heading></Header>{list.map(n => <PickerItem key={n.name} id={n.name} textValue={n.name}><Text slot="label"><Flag name={n.name} />{n.name}</Text><Text slot="description">{n.alive && n.tcp !== undefined ? n.tcp + ' ms' : n.unavailable ? t('act.timeout') : t('act.unknown')}</Text></PickerItem>)}</PickerSection>) : NODES.map(n => <PickerItem key={n.name} id={n.name} textValue={n.name}><Text slot="label"><Flag name={n.name} />{n.name}</Text><Text slot="description">{n.alive && n.tcp !== undefined ? n.tcp + ' ms' : n.unavailable ? t('act.timeout') : t('act.unknown')}</Text></PickerItem>)}</Picker></span><div className={tileBody}><span className={tileVal}><span className={big}>{node?.alive ? (node.tcp === undefined ? '—' : node.tcp + ' ms') : '—'}</span>{node?.alive && <span className={delta}>↓ 12%</span>}</span><StatusLight variant={node?.alive ? 'positive' : 'negative'} size="S"><Text>{node?.alive ? t('act.good') : node?.unavailable ? t('act.timeout') : t('act.unknown')}</Text></StatusLight></div></Panel>
      </div>

      <div className={grid21}>
        <Panel>
          <div className={row}><span className={title}>{t('act.traffic')}</span><div className={scroller}><SegmentedControl aria-label={t('act.historyRange')} selectedKey={range} onSelectionChange={setRange}><SegmentedControlItem id="live">{t('act.live')}</SegmentedControlItem><SegmentedControlItem id="h1">{t('act.h1')}</SegmentedControlItem><SegmentedControlItem id="h6">{t('act.h6')}</SegmentedControlItem><SegmentedControlItem id="h24">{t('act.h24')}</SegmentedControlItem><SegmentedControlItem id="d7">{t('act.d7')}</SegmentedControlItem></SegmentedControl></div></div>
          {history.error ? <p role="alert">{history.error.message}</p> : capabilities.data?.resources.traffic_history.available === false ? <span className={label}>{t('act.noHistory')}</span> : !history.data ? <span role="status">{t('act.loading')}</span> : !history.data.samples.length ? <span className={label}>{t('act.emptyHistory')}</span> : <><Legend series={traffic} fmt={fmtRate} /><AreaChart series={traffic} timestamps={series.timestamps} fmt={fmtRate} height={120} /></>}
        </Panel>
        <Panel>
          <div className={row}><span className={cluster}><span className={title}>{t('act.outUsage')}</span>{outbounds.data && <span className={label}>{t('act.since').replace('{t}', localTime(outbounds.data.counter_since))}</span>}</span></div>
          {outbounds.error ? <p role="alert">{outbounds.error.message}</p> : capabilities.data?.resources.runtime_outbounds.available === false ? <span className={label}>{t('act.noOutbounds')}</span> : !outbounds.data ? <span role="status">{t('act.loading')}</span> : <Donut rows={OUT} total={formatBytes(usage.total)} />}
        </Panel>
      </div>

      <div className={grid3}>
        <Panel>
          <div className={row}><span className={title}>{t('act.topDevices')}</span><SegmentedControl aria-label={t('act.topDevices')} selectedKey={by} onSelectionChange={setBy}><SegmentedControlItem id="dev">{t('act.devices')}</SegmentedControlItem><SegmentedControlItem id="host">{t('act.domains')}</SegmentedControlItem></SegmentedControl></div>
          <div className={list}>{TOP[String(by)].map(([k, v, tx, kind]) => <div key={k} className={devRow}>{kind === 'phone' ? <DevicePhone styles={grayIcon} /> : <DeviceDesktop styles={grayIcon} />}<BarRow label={k} value={tx + sep + v + '%'} pct={v} color="orange" /></div>)}</div>
        </Panel>
        <Panel>
          <div className={row}><span className={title}>{t('act.probeLatency')}</span><More onPress={() => go('policies')}>{t('act.viewAll')}</More></div>
          <div className={list}>{[...NODES].sort((x, y) => (x.alive ? x.tcp ?? 0 : 1e9) - (y.alive ? y.tcp ?? 0 : 1e9)).slice(0, 6).map(n => <BarRow key={n.name} label={n.name} icon={<Flag name={n.name} />} value={n.alive && n.tcp !== undefined ? n.tcp + ' ms' : n.unavailable ? t('act.timeout') : t('act.unknown')} pct={n.alive ? ((n.tcp ?? 0) / 250) * 100 : 100} color={n.alive ? ((n.tcp ?? 0) < 100 ? 'green' : 'warn') : 'red'} />)}</div>
        </Panel>
        <Panel>
          <div className={row}><span className={cluster}><span className={title}>{t('act.issues')}</span>{issues.length > 0 && <span className={label}>{issues.length}</span>}</span><More onPress={() => go('overview')}>{t('act.viewAll')}</More></div>
          {issues.length === 0 ? <span className={label}>{t('act.noIssues')}</span> : <div>{issues.map((i, idx) => <div key={i.text}>{idx > 0 && <Divider size="S" />}<div className={issueRow}><span className={issueLevel}><StatusLight variant={i.level} size="S"><Text>{i.level === 'negative' ? t('act.lvlErr') : i.level === 'notice' ? t('act.lvlWarn') : t('act.lvlInfo')}</Text></StatusLight></span><span className={issueText}>{i.text}</span></div></div>)}</div>}
        </Panel>
      </div>

    </div>
  );
}
