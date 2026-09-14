import {useState} from 'react';
import {Provider} from '@react-spectrum/s2/Provider';
import {SideNav, SideNavHeader, SideNavItem, SideNavItemContent, SideNavItemLink, SideNavSection} from '@react-spectrum/s2/SideNav';
import {SearchField} from '@react-spectrum/s2/SearchField';
import {Button} from '@react-spectrum/s2/Button';
import {ButtonGroup} from '@react-spectrum/s2/ButtonGroup';
import {ActionButton} from '@react-spectrum/s2/ActionButton';
import {ActionButtonGroup} from '@react-spectrum/s2/ActionButtonGroup';
import {ToggleButton} from '@react-spectrum/s2/ToggleButton';
import {SegmentedControl, SegmentedControlItem} from '@react-spectrum/s2/SegmentedControl';
import {Switch} from '@react-spectrum/s2/Switch';
import {Checkbox} from '@react-spectrum/s2/Checkbox';
import {Picker, PickerItem} from '@react-spectrum/s2/Picker';
import {TextField} from '@react-spectrum/s2/TextField';
import {TableView, TableHeader, TableBody, Column, Row, Cell} from '@react-spectrum/s2/TableView';
import {StatusLight} from '@react-spectrum/s2/StatusLight';
import {Badge} from '@react-spectrum/s2/Badge';
import {Meter} from '@react-spectrum/s2/Meter';
import {ProgressBar} from '@react-spectrum/s2/ProgressBar';
import {DialogTrigger, Dialog} from '@react-spectrum/s2/Dialog';
import {Form} from '@react-spectrum/s2/Form';
import {Heading} from '@react-spectrum/s2/Heading';
import {Content} from '@react-spectrum/s2/Content';
import {Text} from '@react-spectrum/s2/Text';
import {Divider} from '@react-spectrum/s2/Divider';
import {InlineAlert} from '@react-spectrum/s2/InlineAlert';
import {LabeledValue} from '@react-spectrum/s2/LabeledValue';
import {Link} from '@react-spectrum/s2/Link';
import {TooltipTrigger, Tooltip} from '@react-spectrum/s2/Tooltip';
import {ToastQueue} from '@react-spectrum/s2/Toast';
import {style} from '@react-spectrum/s2/style' with {type: 'macro'};
import type {Key, Selection} from '@react-spectrum/s2';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import Add from '@react-spectrum/s2/icons/Add';
import Filter from '@react-spectrum/s2/icons/Filter';
import Settings from '@react-spectrum/s2/icons/Settings';
import Copy from '@react-spectrum/s2/icons/Copy';
import OpenIn from '@react-spectrum/s2/icons/OpenIn';
import Home from '@react-spectrum/s2/icons/Home';
import ChartTrend from '@react-spectrum/s2/icons/ChartTrend';
import LinkIcon from '@react-spectrum/s2/icons/Link';
import DeviceAll from '@react-spectrum/s2/icons/DeviceAll';
import Share from '@react-spectrum/s2/icons/Share';
import ListBulleted from '@react-spectrum/s2/icons/ListBulleted';
import GlobeGrid from '@react-spectrum/s2/icons/GlobeGrid';
import Data from '@react-spectrum/s2/icons/Data';
import FileText from '@react-spectrum/s2/icons/FileText';
import History from '@react-spectrum/s2/icons/History';

// ── Page typography and rhythm, all from S2 tokens ─────────────────────────
const inner = style({maxWidth: 1040});
const h1 = style({font: 'heading-2xl', marginTop: 0, marginBottom: 24});
const lead = style({font: 'body-lg', maxWidth: '[40em]', marginTop: 0, marginBottom: 40});
const section = style({marginTop: 64});
const h2 = style({font: 'heading-lg', marginTop: 0, marginBottom: 12});
const note = style({font: 'body', color: 'neutral-subdued', maxWidth: '[38em]', marginTop: 0, marginBottom: 24});
const well = style({borderRadius: 'lg', padding: {default: 16, lg: 32}, backgroundColor: 'gray-75'});
const wellTight = style({borderRadius: 'lg', padding: 8, backgroundColor: 'gray-75'});
const col = style({display: 'flex', flexDirection: 'column', gap: 12});
const stack = style({display: 'flex', flexDirection: 'column', gap: 24});
const row = style({display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'});
const between = style({display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'});
const nodeGrid = style({display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8});
const NODES: Array<[string, string]> = [['hk-01', '84 ms'], ['hk-02', '91 ms'], ['sg-01', '63 ms'], ['jp-01', '逾時'], ['us-01', '188 ms'], ['us-02', '203 ms'], ['tw-01', '47 ms'], ['de-01', '246 ms'], ['resilient', '組']];
const label = style({font: 'detail', color: 'neutral-subdued'});
const grid3 = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: ['repeat(3, minmax(0, 1fr))']}, gap: 16});
const grid2 = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: ['repeat(2, minmax(0, 1fr))']}, gap: 16});
const split = style({display: 'grid', gridTemplateColumns: ['1fr'], gap: 16});
const detail = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], lg: ['minmax(0, 1fr)', 'auto']}, gap: 24, alignItems: 'start'});
// tile sits on a white ground (the app frame); card sits in a grey well.
const tile = style({backgroundColor: 'gray-75', borderRadius: 'lg', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0});
const card = style({backgroundColor: 'base', borderRadius: 'lg', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0});
const big = style({font: 'heading-xl', fontWeight: 'extra-bold'});
const unit = style({font: 'detail', color: 'neutral-subdued', marginStart: 4});
const code = style({font: 'code-sm'});
const inline = style({display: 'flex'});
const spec = style({width: 'full', font: 'body-sm', borderCollapse: 'collapse'});
const th = style({textAlign: 'start', font: 'detail', color: 'neutral-subdued', paddingX: 12, paddingY: 8, borderWidth: 0, borderBottomWidth: 1, borderColor: 'gray-300', borderStyle: 'solid'});
const td = style({textAlign: 'start', paddingX: 12, paddingY: 8, borderWidth: 0, borderBottomWidth: 1, borderColor: 'gray-200', borderStyle: 'solid', verticalAlign: 'top'});
const skelTitle = style({font: 'title', marginTop: 0, marginBottom: 8});
const skelDesc = style({font: 'body-sm', color: 'neutral-subdued', margin: 0});
const skelGrid = style({display: 'grid', gridTemplateColumns: ['repeat(auto-fill, minmax(240px, 1fr))'], gap: 16});

const toast = (kind: 'positive' | 'negative', msg: string) => ToastQueue[kind](msg, {timeout: 4000});

function Sect({id, title, children, tight, note: n}: {id: string, title: string, note?: string, tight?: boolean, children?: React.ReactNode}) {
  return (
    <section id={id} className={section}>
      <h2 className={h2}>{title}</h2>
      {n && <p className={note}>{n}</p>}
      {children && <div className={tight ? wellTight : well}>{children}</div>}
    </section>
  );
}

function Spec({cols, rows}: {cols: string[], rows: string[][]}) {
  return (
    <table className={spec}>
      <thead><tr>{cols.map(c => <th key={c} className={th}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={td}>{j === 0 ? <span className={code}>{c}</span> : c}</td>)}</tr>)}</tbody>
    </table>
  );
}

const UP = [[0, 40], [20, 34], [40, 36], [60, 22], [80, 26], [100, 18], [120, 24], [140, 12], [160, 20], [180, 16], [200, 14]];
const spark = style({width: 'full', height: 56, marginTop: 'auto'});
function Spark({tone}: {tone: 'accent' | 'informative'}) {
  const d = UP.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ');
  return (
    <svg className={spark + ' ' + style({color: {tone: {accent: 'accent', informative: 'blue-900'}}})({tone})} viewBox="0 0 200 46" preserveAspectRatio="none" aria-hidden="true">
      <path d={d + ' L200 46 L0 46 Z'} fill="currentColor" opacity="0.12" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="200" cy={UP[10][1]} r="2.5" fill="currentColor" />
    </svg>
  );
}

// ── App frame: the product shell, rendered with S2 SideNav ─────────────────
const NAV: Array<[string | null, Array<[string, string, React.ComponentType]>]> = [
  [null, [['activity', '活動', ChartTrend], ['overview', '概覽', Home]]],
  ['網路', [['conns', '連線', LinkIcon], ['clients', '客戶端', DeviceAll]]],
  ['代理', [['policies', '策略', Share], ['rules', '規則', ListBulleted], ['dns', 'DNS', GlobeGrid]]],
  ['系統', [['resources', '資源', Data], ['config', '配置', FileText], ['events', '事件', History]]]
];
const TITLES: Record<string, string> = {activity: '活動', overview: '概覽', conns: '連線', clients: '客戶端', policies: '策略', rules: '規則', dns: 'DNS', resources: '資源', config: '配置', events: '事件'};
const frame = style({display: 'grid', gridTemplateColumns: {default: ['1fr'], xl: [200, 'minmax(0, 1fr)']}, borderRadius: 'lg', overflow: 'hidden', backgroundColor: 'base'});
const frameSide = style({display: {default: 'none', xl: 'block'}, borderEndWidth: 1, borderStyle: 'solid', borderColor: 'gray-200', paddingX: 16, paddingY: 16, overflow: 'auto'});
const frameMain = style({padding: {default: 16, lg: 24}, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0});
const fact = style({flexShrink: 0});
const facts = style({display: 'grid', gridTemplateColumns: {default: ['repeat(2, minmax(0, 1fr))'], xl: ['repeat(4, minmax(0, 1fr))']}, gap: 16});
const mobileNav = style({display: {default: 'block', xl: 'none'}});
// Activity page: a four-column card grid, like Surge's. Wide cards span two.
const cards = style({display: 'grid', gridTemplateColumns: {default: ['repeat(2, minmax(0, 1fr))'], xl: ['repeat(4, minmax(0, 1fr))']}, gridAutoRows: {default: 'auto', xl: 200}, gap: 16});
const span2 = style({gridColumnEnd: 'span 2'});
const tall = style({gridColumnEnd: 'span 2', gridRowEnd: {default: 'auto', xl: 'span 2'}});
const cardHead = style({display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32});
const stats = style({display: 'flex', alignItems: 'stretch', gap: 16, marginTop: 'auto'});
const stat = style({flexGrow: 1, flexBasis: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4});
const statVal = style({font: 'title-lg', fontWeight: 'bold'});
const axis = style({display: 'flex', justifyContent: 'space-between', font: 'detail', color: 'neutral-subdued'});

function Stat({k, v}: {k: string, v: string}) {
  return <div className={stat}><span className={label}>{k}</span><span className={statVal}>{v}</span></div>;
}
function Big({v, u}: {v: string, u: string}) {
  return <div className={style({display: 'flex', alignItems: 'baseline'})}><span className={big}>{v}</span><span className={unit}>{u}</span></div>;
}

function AppFrame({scheme}: {scheme: 'light dark' | 'light' | 'dark'}) {
  const [route, setRoute] = useState('activity');
  const items = NAV.flatMap(([, i]) => i);
  return (
    <Provider colorScheme={scheme === 'light dark' ? undefined : scheme} router={{navigate: (href: string) => setRoute(href.replace('#', ''))}}>
      <div className={frame}>
        <div className={frameSide}>
          <SideNav aria-label="導覽" selectedRoute={'#' + route}>
            {NAV.map(([grp, its]) => grp
              ? <SideNavSection key={grp}><SideNavHeader>{grp}</SideNavHeader>{its.map(([k, l, Icon]) => <SideNavItem key={k} id={k} href={'#' + k} textValue={l}><SideNavItemContent><Icon /><SideNavItemLink>{l}</SideNavItemLink></SideNavItemContent></SideNavItem>)}</SideNavSection>
              : its.map(([k, l, Icon]) => <SideNavItem key={k} id={k} href={'#' + k} textValue={l}><SideNavItemContent><Icon /><SideNavItemLink>{l}</SideNavItemLink></SideNavItemContent></SideNavItem>))}
          </SideNav>
        </div>
        <div className={frameMain}>
          <div className={between}>
            <Heading level={1} styles={style({margin: 0})}>{TITLES[route]}</Heading>
            <div className={row}>
              <div className={mobileNav}><Picker aria-label="頁面" selectedKey={route} onSelectionChange={k => setRoute(String(k))}>{items.map(([k, l]) => <PickerItem key={k} id={k}>{l}</PickerItem>)}</Picker></div>
              <SearchField aria-label="搜尋" placeholder="搜尋連線、節點、規則" />
              <ActionButton aria-label="設定"><Settings /></ActionButton>
            </div>
          </div>
          <div className={row}><StatusLight variant="notice"><Text>nfqueue 未就緒，nfnetlink_queue 未載入</Text></StatusLight><Link href="#overview"><Text>看檢查</Text></Link></div>
          <div className={facts}>{[['配置', 'config.dae'], ['出站模式', '規則，Global → proxy'], ['datapath', 'eBPF，wan0，lan0'], ['外部 IP', '203.0.113.7']].map(([k, v]) => <LabeledValue key={k} label={k} value={v} />)}</div>
          <div className={cards}>
            <div className={tile + ' ' + span2}>
              <div className={cardHead}><span className={label}>探測，hk-01</span><ActionButton size="S" onPress={() => toast('positive', '探測完成，TCP 39 ms，HTTP 121 ms，UDP DNS 9 ms')}><Refresh /><Text>重測</Text></ActionButton></div>
              <Big v="126" u="ms" />
              <div className={stats}><Stat k="TCP 連線" v="41 ms" /><Divider orientation="vertical" size="S" /><Stat k="HTTP" v="126 ms" /><Divider orientation="vertical" size="S" /><Stat k="UDP DNS" v="9 ms" /></div>
            </div>
            <div className={tile}>
              <div className={cardHead}><span className={label}>上傳</span><StatusLight variant="positive" size="S"><Text>wan0</Text></StatusLight></div>
              <Big v="312" u="KB/s" />
              <Spark tone="accent" />
            </div>
            <div className={tile}>
              <div className={cardHead}><span className={label}>下載</span><StatusLight variant="positive" size="S"><Text>wan0</Text></StatusLight></div>
              <Big v="4.8" u="MB/s" />
              <Spark tone="informative" />
            </div>
            <div className={tile + ' ' + span2}>
              <div className={cardHead}><span className={label}>活動連線</span><Link href="#conns"><Text>全部</Text></Link></div>
              <Big v="47" u="" />
              <div className={stats}><Stat k="內核" v="39" /><Divider orientation="vertical" size="S" /><Stat k="userspace" v="8" /><Divider orientation="vertical" size="S" /><Stat k="客戶端" v="6" /></div>
            </div>
            <div className={tile + ' ' + tall}>
              <div className={cardHead}><span className={label}>流量</span><SegmentedControl aria-label="範圍" defaultSelectedKey="all"><SegmentedControlItem id="all">全部</SegmentedControlItem><SegmentedControlItem id="proxy">僅代理</SegmentedControlItem></SegmentedControl></div>
              <div className={style({display: 'flex', flexDirection: 'column', gap: 8, flexGrow: 1, justifyContent: 'end'})}><Spark tone="informative" /><Spark tone="accent" /><div className={axis}><span>12 分鐘前</span><span>8</span><span>4</span><span>現在</span></div></div>
              <SegmentedControl aria-label="分組" defaultSelectedKey="clients" isJustified styles={style({width: 'full'})}><SegmentedControlItem id="clients">客戶端</SegmentedControlItem><SegmentedControlItem id="domains">域名</SegmentedControlItem><SegmentedControlItem id="policies">策略</SegmentedControlItem></SegmentedControl>
            </div>
            <div className={tile + ' ' + span2}>
              <div className={cardHead}><span className={label}>總計</span><SegmentedControl aria-label="期間" defaultSelectedKey="today"><SegmentedControlItem id="today">今日</SegmentedControlItem><SegmentedControlItem id="month">本月</SegmentedControlItem></SegmentedControl></div>
              <Big v="1.4" u="GB" />
              <div className={stats}><Stat k="direct" v="1.1 GB" /><Divider orientation="vertical" size="S" /><Stat k="proxy" v="312 MB" /><Divider orientation="vertical" size="S" /><Stat k="block" v="0" /></div>
            </div>
          </div>
        </div>
      </div>
    </Provider>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────
type Conn = {id: string, dst: string, src: string, out: string, path: string, bytes: string, age: string};
const CONNS: Conn[] = [
  {id: '1', dst: 'api.telegram.org:443', src: '10.0.0.12', out: 'proxy → hk-01', path: 'userspace', bytes: '1.2 MB', age: '4m 12s'},
  {id: '2', dst: 'cdn.bilibili.com:443', src: '10.0.0.7', out: 'direct', path: '內核', bytes: '84 MB', age: '12m 03s'},
  {id: '3', dst: '52.84.19.3:443', src: '10.0.0.7', out: 'proxy → hk-01', path: '內核', bytes: '312 KB', age: '18s'},
  {id: '4', dst: 'doubleclick.net:443', src: '10.0.0.31', out: 'block', path: '拒絕', bytes: '0', age: '—'},
  {id: '5', dst: '1.1.1.1:53 (udp)', src: '10.0.0.12', out: 'direct(must)', path: '內核', bytes: '2 KB', age: '1s'}
];
const RULES = [['1', 'domain(suffix: doubleclick.net)', 'block', '', 'config.dae:38', '廣告'], ['2', 'pname(NetworkManager, systemd-resolved) && l4proto(udp) && dport(53)', 'direct', 'must', 'config.dae:39', ''], ['3', 'dip(geoip: private)', 'direct', 'must', 'config.dae:40', 'LAN'], ['4', 'domain(geosite: cn)', 'direct', '', 'config.dae:41', ''], ['5', 'mac(aa:bb:cc:dd:ee:ff) && ipversion(4)', 'direct', '', 'rules.dae:3', '電視'], ['—', 'fallback', 'resilient', '', 'config.dae:44', '']];

const codeBlock = style({position: 'relative', backgroundColor: 'base', borderRadius: 'lg', paddingY: 20, paddingStart: 8, paddingEnd: 20, overflow: 'auto'});
const codeActs = style({position: 'absolute', top: 8, insetEnd: 8, display: 'flex', flexDirection: 'column', backgroundColor: 'elevated', borderRadius: 'default', boxShadow: 'elevated', padding: 2});
const ln = style({display: 'grid', gridTemplateColumns: [48, '1fr'], font: 'code', whiteSpace: 'pre'});
const lnNum = style({textAlign: 'end', paddingEnd: 12, color: 'gray-600', userSelect: 'none'});
const kw = style({color: 'red-900'});
const fn = style({color: 'red-900'});
const arg = style({color: 'blue-900'});
const str = style({color: 'orange-1000'});
const cmt = style({color: 'gray-600'});
const out = style({color: 'blue-900', fontWeight: 'bold'});
const lnNew = style({backgroundColor: 'blue-200'});
const lnErr = style({backgroundColor: 'red-200'});

function DaeLine({text}: {text: string}) {
  if (/^\s*#/.test(text)) return <span className={cmt}>{text}</span>;
  const m = text.match(/^(\s*)(routing|fallback)(.*)$/);
  if (m && m[2] === 'routing') return <span><span className={kw}>{m[1] + m[2]}</span>{m[3]}</span>;
  if (m && m[2] === 'fallback') { const t = m[3].match(/^: (\w+)$/); return <span><span className={kw}>{m[1] + m[2]}</span>: <span className={out}>{t?.[1]}</span></span>; }
  const r = text.match(/^(\s*)(\w+)\((\w+): ([^)]*)\) -> (\w+)(\(must\))?$/);
  if (r) return <span>{r[1]}<span className={fn}>{r[2]}</span>(<span className={arg}>{r[3]}:</span> <span className={str}>{r[4]}</span>) -&gt; <span className={out}>{r[5]}{r[6]}</span></span>;
  return <span>{text}</span>;
}
const LINES: Array<[number, string, 'new' | 'err' | undefined]> = [[36, 'routing {', undefined], [37, '    # 廣告', undefined], [38, '    domain(suffix: doubleclick.net) -> block', undefined], [39, '    dip(geoip: private) -> direct(must)', undefined], [40, '    domain(geosite: cn) -> direct', undefined], [41, '    domain(suffix: bilibili.com) -> direct', 'new'], [42, '    domain(geosite: category-games@cn) -> gaming', 'err'], [43, '    fallback: resilient', undefined], [44, '}', undefined]];

export function DesignPage({scheme}: {scheme: 'light dark' | 'light' | 'dark'}) {
  const [sel, setSel] = useState<Selection>(new Set<Key>(['2']));
  const [node, setNode] = useState('hk-01');
  return (
    <div className={inner}>
      <h1 className={h1}>doona 設計語言</h1>
      <p className={lead}>honk 的控制面板，用 Adobe Spectrum 2 做。色、字、間距、圓角、控件尺寸與亮暗都由它的 token 決定；這裡只決定怎麼組合，每一節先寫用了哪個元件，再放實樣。</p>

      <Sect id="pos" title="定位" note="對象是一台 Linux 網關上的 honk。使用者一天開幾次，每次為了一件事：看某條流為什麼走了那裡、給它加一條規則、換一個節點、改配置後 reload。介面照 Surge 的骨架與操作邏輯：左欄導覽、物件在哪就在哪操作、狀態用同一組語義色說話。" />

      <Sect id="shell" title="應用骨架" tight note="左欄 SideNav，右邊是活動頁：事實列，然後四欄卡片網格，探測、上傳、下載、活動連線、流量、總計，寬卡佔兩欄。窄於 xl 時折成兩欄，左欄收進 Picker。每張卡：標題行、大數字、底部一排子數值。">
        <AppFrame scheme={scheme} />
      </Sect>

      <Sect id="spec" title="規範" note="所有尺寸來自 style 宏的 token；頁面佈局只用它的間距步進：4、8、12、16、24、32、40。">
        <Spec cols={['項', '值', '用在']} rows={[['Button / ActionButton size M', '32px，最小寬 2.25 倍高', '所有按鈕；S 24px 用在卡片標題行'], ['TextField / Picker / SearchField', '32px', '表單與工具列'], ['TableView regular', '行 40px，內距 16', '連線、規則、DNS、資源、事件'], ['tile', '內距 16，圓角 lg，底 layer-2', '活動卡、狀態卡、窗格'], ['SideNav item', '32px 高，圖標 18，縮排 8', '左欄'], ['Toast', '52px', '操作結果'], ['字體角色', 'heading-2xl / heading-lg / title / body / detail / code', 'CJK 行高由 S2 自動加到 1.5 / 1.7'], ['間距', '同組 8，卡片內 12，卡片之間 16，區塊之間 24，頁面內距 48', '佈局層唯一要記的一組數']]} />
      </Sect>

      <Sect id="color" title="色彩" note="語義色：accent 做選中與主要動作；positive / notice / negative 只表示狀態；中性由 background 層決定。亮暗由 Provider 的 colorScheme 切換，不自訂色值。">
        <div className={stack}>
          <div className={row}><StatusLight variant="positive"><Text>監聽 :53，上游 2 個</Text></StatusLight><StatusLight variant="notice"><Text>127.0.0.1:9090，secret 為空</Text></StatusLight><StatusLight variant="negative"><Text>nfnetlink_queue 未載入</Text></StatusLight><StatusLight variant="neutral"><Text>未啟用</Text></StatusLight></div>
          <div className={row}><Badge variant="neutral"><Text>內核</Text></Badge><Badge variant="neutral" fillStyle="outline"><Text>must</Text></Badge><Badge variant="negative"><Text>拒絕</Text></Badge><Badge variant="informative"><Text>udp</Text></Badge><Badge variant="notice"><Text>未儲存</Text></Badge><Badge variant="positive"><Text>45 個節點</Text></Badge></div>
        </div>
      </Sect>

      <Sect id="controls" title="控件" note="Button variant accent / primary / secondary / negative，fillStyle fill / outline；圖標按鈕用 ActionButton，圖標配 Text；成組放 ButtonGroup 或 ActionButtonGroup；分段選擇用 SegmentedControl。">
        <div className={style({display: 'flex', flexDirection: 'column', gap: 20})}>
          <div className={col}><span className={label}>ButtonGroup</span><ButtonGroup><Button variant="secondary">取消</Button><Button variant="primary">校驗</Button><Button variant="accent">加入並 reload</Button></ButtonGroup></div>
          <div className={col}><span className={label}>變體</span><ButtonGroup><Button variant="negative" fillStyle="outline">中止這條連線</Button><Button variant="accent" isDisabled>中止（內核流）</Button><Button variant="primary" fillStyle="outline">重新探測</Button><Button variant="secondary" fillStyle="outline">看診斷</Button></ButtonGroup></div>
          <div className={col}><span className={label}>ActionButtonGroup</span><ActionButtonGroup><ActionButton><Refresh /><Text>重測</Text></ActionButton><ActionButton><Add /><Text>加規則</Text></ActionButton><ActionButton><Filter /><Text>只看未就緒</Text></ActionButton><ActionButton><Refresh /><Text>測試全部</Text></ActionButton></ActionButtonGroup></div>
          <div className={col}><span className={label}>SegmentedControl</span><div className={row}><SegmentedControl aria-label="出站模式" defaultSelectedKey="rule"><SegmentedControlItem id="direct">直連</SegmentedControlItem><SegmentedControlItem id="global">全域</SegmentedControlItem><SegmentedControlItem id="rule">規則</SegmentedControlItem></SegmentedControl><SegmentedControl aria-label="過濾" defaultSelectedKey="all"><SegmentedControlItem id="all">全部 47</SegmentedControlItem><SegmentedControlItem id="u">userspace 8</SegmentedControlItem><SegmentedControlItem id="b">拒絕 3</SegmentedControlItem></SegmentedControl></div></div>
          <div className={col}><span className={label}>Switch、Checkbox</span><div className={row}><Switch defaultSelected>must</Switch><Checkbox>只看未就緒</Checkbox></div></div>
          <div className={col}><span className={label}>Form</span><div className={style({display: 'flex', alignItems: 'end', gap: 16, flexWrap: 'wrap'})}><TextField label="條件" defaultValue="domain(suffix: bilibili.com)" styles={style({width: 320})} /><Picker label="出站" defaultSelectedKey="direct"><PickerItem id="direct">direct</PickerItem><PickerItem id="proxy">proxy</PickerItem><PickerItem id="block">block</PickerItem><PickerItem id="resilient">resilient</PickerItem></Picker><SearchField label="搜尋" placeholder="連線、節點、規則" /></div></div>
          <div className={col}><span className={label}>Meter 與 ProgressBar</span><div className={style({display: 'flex', gap: 24, flexWrap: 'wrap'})}><Meter label="proxy → hk-01" value={61} /><Meter label="direct" value={35} variant="positive" /><Meter label="block" value={4} variant="negative" /><ProgressBar label="reload" value={70} /></div></div>
        </div>
      </Sect>

      <Sect id="conns" title="連線與就地操作" note="TableView 一般密度；選中一條，右側列它的路由結果與能做的事。加規則走 DialogTrigger + Dialog：Heading、Content 裡放 Form、ButtonGroup 取消在前確認在後。">
        <div className={split}>
          <TableView aria-label="連線" selectionMode="single" selectedKeys={sel} onSelectionChange={setSel} styles={style({height: 284})}>
            <TableHeader><Column id="dst" isRowHeader minWidth={160}>目標</Column><Column id="src" width={112}>來源</Column><Column id="out" width={124}>出站</Column><Column id="path" width={96}>路徑</Column><Column id="bytes" align="end" width={72}>流量</Column><Column id="age" align="end" width={88}>時長</Column></TableHeader>
            <TableBody items={CONNS}>{item => <Row id={item.id} columns={['dst', 'src', 'out', 'path', 'bytes', 'age']}>{c => <Cell align={c === 'bytes' || c === 'age' ? 'end' : 'start'}>{c === 'path' ? (item.path === '拒絕' ? <div className={inline}><Badge variant="negative" size="S"><Text>拒絕</Text></Badge></div> : item.path) : c === 'src' ? <span className={code}>{item.src}</span> : item[c as keyof Conn]}</Cell>}</Row>}</TableBody>
          </TableView>
          <div className={card}><div className={detail}>
            <div className={style({display: 'flex', flexDirection: 'column', gap: 12})}>
            <Heading level={3} styles={style({margin: 0})}>cdn.bilibili.com:443</Heading>
            <StatusLight variant="positive" size="S"><Text>內核轉發，TCP</Text></StatusLight>
            <div className={style({display: 'flex', gap: 24, flexWrap: 'wrap'})}>{[['來源', '10.0.0.7:51422'], ['解析', '120.92.78.14'], ['命中', '#4 domain(geosite: cn) -> direct'], ['流量', '↑ 1.1 MB ↓ 83 MB']].map(([k, v]) => <div key={k} className={fact}><LabeledValue label={k} value={v} /></div>)}</div>
            </div>
            <div className={style({display: 'flex', flexDirection: 'column', gap: 8})}>
              <DialogTrigger>
                <Button variant="primary">為 bilibili.com 加規則</Button>
                <Dialog>{({close}) => <>
                  <Heading slot="title">加規則</Heading>
                  <Content><Form><TextField label="條件" defaultValue="domain(suffix: bilibili.com)" /><Picker label="出站" defaultSelectedKey="direct"><PickerItem id="direct">direct</PickerItem><PickerItem id="proxy">proxy</PickerItem><PickerItem id="block">block</PickerItem></Picker><Picker label="位置" defaultSelectedKey="fb"><PickerItem id="fb">fallback 之前（第 44 行）</PickerItem><PickerItem id="hit">命中的 #4 之前（第 41 行）</PickerItem></Picker><Switch>must</Switch></Form><div className={style({marginTop: 16})}><InlineAlert variant="notice" fillStyle="border"><Heading>第 40 行 geosite: cn 可能先命中</Heading><Content>寫進 config.dae，校驗通過後 reload。</Content></InlineAlert></div></Content>
                  <ButtonGroup><Button variant="secondary" onPress={close}>取消</Button><Button variant="accent" onPress={() => { close(); toast('positive', '已加入，domain(suffix: bilibili.com) -> direct，已 reload，r42'); }}>加入並 reload</Button></ButtonGroup>
                </>}</Dialog>
              </DialogTrigger>
              <Button variant="secondary">為 10.0.0.7 加規則</Button>
              <Button variant="secondary">切換 proxy 的選擇</Button>
              <TooltipTrigger><Button variant="negative" fillStyle="outline" isDisabled>中止這條連線</Button><Tooltip>這條流在內核轉發，honk 不能中止它</Tooltip></TooltipTrigger>
            </div>
          </div></div>
        </div>
      </Sect>

      <Sect id="policies" title="策略" note="出站模式是 SegmentedControl；節點卡是網格裡的 ToggleButton isEmphasized，欄數隨寬度增減、多到幾行都會換行，選中即 accent 藍底。">
        <div className={style({display: 'flex', flexDirection: 'column', gap: 24})}>
          <div className={row}><SegmentedControl aria-label="出站模式" defaultSelectedKey="rule"><SegmentedControlItem id="direct">直連</SegmentedControlItem><SegmentedControlItem id="global">全域</SegmentedControlItem><SegmentedControlItem id="rule">規則</SegmentedControlItem></SegmentedControl><span className={note}>規則由上至下逐條測試，第一條命中的決定出站。全域時走 proxy。</span></div>
          <div className={between}><Heading level={3} styles={style({margin: 0})}>proxy，selector</Heading><ActionButton onPress={() => toast('positive', 'proxy，9 個成員測完，jp-01 逾時')}><Refresh /><Text>測試全部</Text></ActionButton></div>
          <div role="radiogroup" aria-label="節點" className={nodeGrid}>
            {NODES.map(([n, l]) => (
              <ToggleButton key={n} size="L" isEmphasized isSelected={node === n} onChange={() => { setNode(n); toast('positive', 'proxy 改選 ' + n + '，已寫入 cache.db'); }} styles={style({width: 'full'})}><Text>{n} {l}</Text></ToggleButton>
            ))}
          </div>
        </div>
      </Sect>

      <Sect id="rules" title="規則表" note="TableView；條件用等寬字；must 獨立欄；來源指到檔案與行。">
        <TableView aria-label="規則" styles={style({height: 284})}>
          <TableHeader><Column id="n" width={56}>#</Column><Column id="c" isRowHeader>條件</Column><Column id="o" width={110}>出站</Column><Column id="m" width={100}>must</Column><Column id="s" width={150}>來源</Column><Column id="x" width={90}>注釋</Column></TableHeader>
          <TableBody>{RULES.map((r, i) => <Row key={i} id={i}><Cell>{r[0]}</Cell><Cell><span className={code}>{r[1]}</span></Cell><Cell>{r[2]}</Cell><Cell>{r[3] && <div className={inline}><Badge variant="neutral" fillStyle="outline" size="S"><Text>must</Text></Badge></div>}</Cell><Cell>{r[4]}</Cell><Cell>{r[5]}</Cell></Row>)}</TableBody>
        </TableView>
      </Sect>

      <Sect id="config" title="配置編輯器與回饋" note="編輯器本體之後接 CodeMirror；工具列、狀態與診斷用 S2。">
        <div className={style({display: 'flex', flexDirection: 'column', gap: 16})}>
          <div className={between}><div className={row}><span className={code}>/etc/honk/config.dae</span><Badge variant="notice" size="S"><Text>未儲存</Text></Badge><span className={label}>磁碟 r41，執行中 r40</span></div><ButtonGroup><Button variant="secondary" onPress={() => toast('negative', '校驗失敗，第 42 行出站 gaming 不存在')}>校驗</Button><Button variant="accent" onPress={() => toast('positive', '已 reload，45 個節點，8 條規則，r41')}>應用並 reload</Button></ButtonGroup></div>
          <div className={codeBlock}>
            <div className={codeActs}><ActionButton isQuiet size="S" aria-label="複製" onPress={() => toast('positive', '已複製 9 行')}><Copy /></ActionButton><ActionButton isQuiet size="S" aria-label="在編輯器打開"><OpenIn /></ActionButton></div>
            {LINES.map(([n, t, c]) => <div key={n} className={ln + (c === 'new' ? ' ' + lnNew : c === 'err' ? ' ' + lnErr : '')}><span className={lnNum}>{n}</span><DaeLine text={t} /></div>)}
          </div>
          <InlineAlert variant="negative" fillStyle="border"><Heading>第 42 行：出站 gaming 不存在</Heading><Content>可用的組：proxy、resilient。</Content></InlineAlert>
        </div>
      </Sect>

      <Sect id="skeleton" title="頁面骨架" note="只列 honk 有的能力。不做行程頁、HTTP 捕獲 / 解密 / 重寫、腳本、模組、多配置。">
        <div className={skelGrid}>
          {[['活動', '事實列、探測、流量、活動連線、本次觀察出站'], ['概覽', '狀態卡：datapath、nfqueue、TProxy、DNS、Clash API、內嵌介面；唯讀診斷'], ['連線', '列表加詳情，就地加規則、換組、中止（能力門控）'], ['客戶端', '可見連線聚合的來源 IP 與 MAC，就地加規則'], ['策略', '出站模式加 Global 目標、各組卡片、測速'], ['規則', '表、來源、fallback 行'], ['DNS', '查詢工具、快取列表、flush'], ['資源', '訂閱與 geo 資產狀態、刷新訂閱'], ['配置', '來源清單、原文編輯、校驗、應用、reload'], ['事件', '即時事件加有限重放']].map(([t, d]) => (
            <div key={t} className={card}><h3 className={skelTitle}>{t}</h3><p className={skelDesc}>{d}</p></div>
          ))}
        </div>
      </Sect>
    </div>
  );
}
