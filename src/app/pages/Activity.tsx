// Activity: overview dashboard on static gray panels. Quick switches, stat strip with sparklines, traffic and outbound usage, breakdowns, notifications.
import {useState} from 'react';
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
import {runtime, checks, conns, groups, events, throughput, connSeries, type Mode} from '../mock';
import {Flag} from '../Flag';
const valueRow = style({display: 'inline-flex', alignItems: 'center'});
import {useT} from '../i18n';
import {AreaChart, BarRow, Donut, Legend, Spark, fmtRate, latest, type SeriesColor} from '../TrafficChart';
import type {PageProps} from '../Shell';

type Top = Array<[string, number, string, 'desktop' | 'phone']>; // name, share %, bytes, kind
const TOP: Record<string, Top> = {
  dev: [['10.0.0.7', 84, '84 MB', 'desktop'], ['10.0.0.31', 4, '3.6 MB', 'phone'], ['10.0.0.12', 2, '1.3 MB', 'desktop'], ['10.0.0.20', 1, '140 KB', 'phone'], ['10.0.0.9', 1, '96 KB', 'desktop']],
  host: [['cdn.bilibili.com', 83, '83 MB', 'desktop'], ['discord.com', 4, '3.4 MB', 'desktop'], ['api.telegram.org', 2, '1.2 MB', 'phone'], ['52.84.19.3', 1, '312 KB', 'desktop'], ['203.0.113.9', 1, '96 KB', 'phone']]
};
const OUT: Array<{name: string, value: number, text: string, color: SeriesColor}> = [{name: 'direct', value: 78, text: '1.1 GB', color: 'accent'}, {name: 'proxy', value: 20, text: '312 MB', color: 'accent2'}, {name: 'resilient', value: 1, text: '96 KB', color: 'muted'}, {name: 'gaming', value: 1, text: '12 KB', color: 'muted2'}, {name: 'block', value: 0, text: '0', color: 'red'}];
const NODES = [...new Map(groups.flatMap(g => g.nodes).map(n => [n.name, n])).values()];
// Sections by region once the list is long; sorted by latency inside each section.
const NODE_SECTIONS: Array<[string, typeof NODES]> = NODES.length > 12 ? [...NODES].sort((a, b) => (a.alive ? a.tcp ?? 0 : 1e9) - (b.alive ? b.tcp ?? 0 : 1e9)).reduce((acc, n) => { const r = regionOf(n.name) ?? '—'; const hit = acc.find(([k]) => k === r); if (hit) hit[1].push(n); else acc.push([r, [n]]); return acc; }, [] as Array<[string, typeof NODES]>) : [];

const quick = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], sm: ['repeat(2, minmax(0, 1fr))'], xl: ['minmax(0, 1.5fr)', 'repeat(2, minmax(0, 1fr))']}, gap: 12});
const strip = style({display: 'grid', gridTemplateColumns: {default: ['repeat(2, minmax(0, 1fr))'], lg: ['repeat(4, minmax(0, 1fr))']}, gap: 12});
const grid21 = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: ['minmax(0, 2fr)', 'minmax(0, 1fr)']}, gap: 12, alignItems: 'stretch'});
const grid3 = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: ['repeat(3, minmax(0, 1fr))']}, gap: 12, alignItems: 'stretch'});
const row = style({display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32, flexWrap: 'wrap'});
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
  const failing = checks.filter(c => !c.ready);
  const [by, setBy] = useState<Key>('dev');
  const [range, setRange] = useState<Key>('live');
  const [mode, setMode] = useState<Mode>(runtime.mode);
  const [target, setTarget] = useState(runtime.globalTarget);
  const [nodeName, setNodeName] = useState(NODES[0].name);
  const node = NODES.find(n => n.name === nodeName) ?? NODES[0];
  const sep = t('act.sep2');
  const sep2 = t('lang') === 'Language' ? ': ' : '：';
  const traffic = [{label: t('act.download'), color: 'accent' as const, values: throughput.map(s => s.down)}, {label: t('act.upload'), color: 'orange' as const, values: throughput.map(s => s.up)}];
  type Issue = {level: 'notice' | 'negative' | 'informative', text: string, page: string};
  const RANK = {negative: 0, notice: 1, informative: 2};
  // Errors first, then warnings, then plain notices from the event log; capped so the panel stays one screen.
  const issues: Issue[] = [
    ...timeoutIssues([...new Set(groups.flatMap(g => g.nodes.filter(n => !n.alive).map(n => n.name)))], t('act.timeout'), t('act.nTimeouts'), t('act.sep')).map(text => ({level: 'negative' as const, text, page: 'policies'})),
    ...failing.map(c => ({level: 'notice' as const, text: t(`check.${c.id}` as 'check.ebpf') + ' ' + t('act.notReady') + sep + t('act.needRestart'), page: 'overview'})),
    ...events.filter(e => e.level !== 'error' && e.kind !== '探測').map(e => ({level: e.level === 'warn' ? 'notice' as const : 'informative' as const, text: t(`ev.${e.id}` as 'ev.e1'), page: (e.ref ?? '#/events').replace('#/', '')}))
  ].sort((x, y) => RANK[x.level] - RANK[y.level]).slice(0, 6);
  return (
    <div className={page}>
      <div className={quick}>
        <div className={card}><div className={row}><span className={qLabel}><Shuffle styles={grayIcon} />{t('act.mode')}</span><SegmentedControl aria-label={t('act.mode')} selectedKey={mode} onSelectionChange={k => { setMode(k as Mode); toast('positive', t('act.mode') + sep2 + t(`mode.${String(k)}` as 'mode.rule')); }}><SegmentedControlItem id="rule">{t('mode.rule')}</SegmentedControlItem><SegmentedControlItem id="global">{t('mode.global')}</SegmentedControlItem><SegmentedControlItem id="direct">{t('mode.direct')}</SegmentedControlItem></SegmentedControl></div></div>
        <div className={card}><div className={row}><span className={qLabel}><Filter styles={grayIcon} />{t('act.global')}</span><MenuTrigger><ActionButton isQuiet><Text>{target}</Text><ChevronDown /></ActionButton><Menu selectionMode="multiple" disallowEmptySelection selectedKeys={[target]} onSelectionChange={k => { if (k === 'all') return; const next = [...k].find(x => x !== target); if (next) setTarget(String(next)); }}>{groups.map(g => <MenuItem key={g.name} id={g.name}>{g.name}</MenuItem>)}</Menu></MenuTrigger></div></div>
        <div className={card}><div className={row}><StatusLight variant="positive"><Text>{t('act.running')}</Text></StatusLight><ActionButton isQuiet onPress={() => go('overview')}><Text>{t('act.viewDetails')}</Text></ActionButton></div></div>
      </div>

      <div className={strip}>
        <Panel><span className={tileHead}><Download styles={grayIcon} />{t('act.download')}</span><div className={tileBody}><span className={tileVal}><span className={big}>{fmtRate(latest.down)}</span><span className={delta}>↑ 12%</span></span><span className={tileSpark}><Spark values={traffic[0].values} color="accent" /></span></div></Panel>
        <Panel><span className={tileHead}><Upload styles={grayIcon} />{t('act.upload')}</span><div className={tileBody}><span className={tileVal}><span className={big}>{fmtRate(latest.up)}</span><span className={delta}>↓ 8%</span></span><span className={tileSpark}><Spark values={traffic[1].values} color="orange" /></span></div></Panel>
        <Panel><span className={tileHead}><LinkIcon styles={grayIcon} />{t('act.active')}</span><div className={tileBody}><span className={tileVal}><span className={big}>{conns.length}</span><span className={delta}>↑ 2</span></span><span className={tileSpark}><Spark values={connSeries} color="orange" /></span></div></Panel>
        <Panel><span className={tileHead}><Clock styles={grayIcon} />{t('act.latency')}<Picker aria-label={t('act.node')} isQuiet size="S" selectedKey={nodeName} onSelectionChange={k => { if (k != null) setNodeName(String(k)); }} renderValue={items => { const name = (items[0] as typeof NODES[number] | undefined)?.name ?? nodeName; return <span className={valueRow}><Flag name={name} />{name}</span>; }}>{NODE_SECTIONS.length > 1 ? NODE_SECTIONS.map(([r, list]) => <PickerSection key={r} id={r}><Header><Heading>{r}</Heading></Header>{list.map(n => <PickerItem key={n.name} id={n.name} textValue={n.name}><Text slot="label"><Flag name={n.name} />{n.name}</Text><Text slot="description">{n.alive ? n.tcp + ' ms' : t('act.timeout')}</Text></PickerItem>)}</PickerSection>) : NODES.map(n => <PickerItem key={n.name} id={n.name} textValue={n.name}><Text slot="label"><Flag name={n.name} />{n.name}</Text><Text slot="description">{n.alive ? n.tcp + ' ms' : t('act.timeout')}</Text></PickerItem>)}</Picker></span><div className={tileBody}><span className={tileVal}><span className={big}>{node.alive ? node.tcp + ' ms' : '—'}</span>{node.alive && <span className={delta}>↓ 12%</span>}</span><StatusLight variant={node.alive ? 'positive' : 'negative'} size="S"><Text>{node.alive ? t('act.good') : t('act.timeout')}</Text></StatusLight></div></Panel>
      </div>

      <div className={grid21}>
        <Panel>
          <div className={row}><span className={title}>{t('act.traffic')}</span><SegmentedControl aria-label={t('act.window')} selectedKey={range} onSelectionChange={setRange}><SegmentedControlItem id="live">{t('act.live')}</SegmentedControlItem><SegmentedControlItem id="h1">{t('act.h1')}</SegmentedControlItem><SegmentedControlItem id="h6">{t('act.h6')}</SegmentedControlItem><SegmentedControlItem id="h24">{t('act.h24')}</SegmentedControlItem><SegmentedControlItem id="d7">{t('act.d7')}</SegmentedControlItem></SegmentedControl></div>
          <Legend series={traffic} fmt={fmtRate} />
          <AreaChart series={traffic} fmt={fmtRate} height={120} />
        </Panel>
        <Panel>
          <div className={row}><span className={cluster}><span className={title}>{t('act.outUsage')}</span><span className={label}>{t('act.lastHour')}</span></span></div>
          <Donut rows={OUT} total="1.4 GB" />
        </Panel>
      </div>

      <div className={grid3}>
        <Panel>
          <div className={row}><span className={title}>{t('act.topDevices')}</span><SegmentedControl aria-label={t('act.topDevices')} selectedKey={by} onSelectionChange={setBy}><SegmentedControlItem id="dev">{t('act.devices')}</SegmentedControlItem><SegmentedControlItem id="host">{t('act.domains')}</SegmentedControlItem></SegmentedControl></div>
          <div className={list}>{TOP[String(by)].map(([k, v, tx, kind]) => <div key={k} className={devRow}>{kind === 'phone' ? <DevicePhone styles={grayIcon} /> : <DeviceDesktop styles={grayIcon} />}<BarRow label={k} value={tx + sep + v + '%'} pct={v} color="orange" /></div>)}</div>
        </Panel>
        <Panel>
          <div className={row}><span className={title}>{t('act.probeLatency')}</span><More onPress={() => go('policies')}>{t('act.viewAll')}</More></div>
          <div className={list}>{[...NODES].sort((x, y) => (x.alive ? x.tcp ?? 0 : 1e9) - (y.alive ? y.tcp ?? 0 : 1e9)).slice(0, 6).map(n => <BarRow key={n.name} label={n.name} icon={<Flag name={n.name} />} value={n.alive ? (n.tcp ?? 0) + ' ms' : t('act.timeout')} pct={n.alive ? ((n.tcp ?? 0) / 250) * 100 : 100} color={n.alive ? ((n.tcp ?? 0) < 100 ? 'green' : 'warn') : 'red'} />)}</div>
        </Panel>
        <Panel>
          <div className={row}><span className={cluster}><span className={title}>{t('act.issues')}</span>{issues.length > 0 && <span className={label}>{issues.length}</span>}</span><More onPress={() => go('overview')}>{t('act.viewAll')}</More></div>
          {issues.length === 0 ? <span className={label}>{t('act.noIssues')}</span> : <div>{issues.map((i, idx) => <div key={i.text}>{idx > 0 && <Divider size="S" />}<div className={issueRow}><span className={issueLevel}><StatusLight variant={i.level} size="S"><Text>{i.level === 'negative' ? t('act.lvlErr') : i.level === 'notice' ? t('act.lvlWarn') : t('act.lvlInfo')}</Text></StatusLight></span><span className={issueText}>{i.text}</span></div></div>)}</div>}
        </Panel>
      </div>

    </div>
  );
}
