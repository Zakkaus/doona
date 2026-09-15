// Small control kit on react-aria-components, styled by theme.css with the Rosé Pine variables.
import {useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject} from 'react';
import {flushSync} from 'react-dom';
import {Button as RButton, ToggleButton, ToggleButtonGroup, Menu, MenuItem, MenuTrigger, MenuSection, Header, Popover, Select, SelectValue, ListBox, ListBoxItem, Tooltip, TooltipTrigger, OverlayArrow, type Key} from 'react-aria-components';
import ChevronDown from '@react-spectrum/s2/icons/ChevronDown';
import Close from '@react-spectrum/s2/icons/Close';
import Checkmark from '@react-spectrum/s2/icons/Checkmark';
import CheckmarkCircle from '@react-spectrum/s2/icons/CheckmarkCircle';
import AlertTriangle from '@react-spectrum/s2/icons/AlertTriangle';
import InfoCircle from '@react-spectrum/s2/icons/InfoCircle';

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

// Wrap a state change in a view transition (a page-wide crossfade) where the browser supports it.
export function withCrossfade(fn: () => void) {
  const d = document as Document & {startViewTransition?: (cb: () => void) => void};
  if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
  d.startViewTransition(() => flushSync(fn));
}

// Press feedback is pure CSS (a small scale on [data-pressed], see theme.css): a JS-computed perspective transform
// on every press promoted the button to its own layer mid-gesture and felt abrupt. The hook stays for the ref.
export function usePress(): [RefObject<HTMLButtonElement | null>, (rp: {isPressed: boolean}) => CSSProperties] {
  const ref = useRef<HTMLButtonElement>(null);
  return [ref, () => ({})];
}
function PressButton(props: Parameters<typeof RButton>[0]) {
  const [ref, style] = usePress();
  return <RButton {...props} ref={ref} style={style} />;
}
function PressToggle(props: Parameters<typeof ToggleButton>[0]) {
  const [ref, style] = usePress();
  return <ToggleButton {...props} ref={ref} style={style} />;
}

// A selection indicator that slides between items, as in S2's SegmentedControl and Tabs.
export function useSlider(value: string, selector = '[data-selected]') {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => { const sel = el.querySelector<HTMLElement>(selector); if (!sel) return setPos(null); setPos({x: sel.offsetLeft, y: sel.offsetTop, w: sel.offsetWidth, h: sel.offsetHeight}); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [value, selector]);
  return [ref, pos] as const;
}

export function Button({children, onPress, quiet, small, icon, accent, primary, negative, label, isDisabled, tip}: {children?: ReactNode, onPress?: () => void, quiet?: boolean, small?: boolean, icon?: boolean, accent?: boolean, primary?: boolean, negative?: boolean, label?: string, isDisabled?: boolean, tip?: string}) {
  const btn = <PressButton className={cx('rp-btn', quiet && 'quiet', small && 'sm', icon && 'icon', accent && 'accent', primary && 'primary', negative && 'negative')} onPress={onPress} aria-label={label} isDisabled={isDisabled}>{children}</PressButton>;
  const text = label ?? tip;
  return text ? <TooltipTrigger delay={400}><Tip>{text}</Tip>{btn}</TooltipTrigger> : btn;
}
function Tip({children}: {children: ReactNode}) {
  return <Tooltip className="rp-tip" offset={6}><OverlayArrow /> {children}</Tooltip>;
}
export function Segmented({items, value, onChange, label}: {items: Array<[string, string]>, value: string, onChange: (k: string) => void, label: string}) {
  const [ref, pos] = useSlider(value);
  return (
    <ToggleButtonGroup ref={ref} className="rp-seg" aria-label={label} selectionMode="single" disallowEmptySelection selectedKeys={[value]} onSelectionChange={k => { const v = [...k][0]; if (v != null) onChange(String(v)); }}>
      {pos && <span className="rp-slider" style={{translate: `${pos.x}px 0`, width: pos.w}} />}
      {items.map(([k, l]) => <PressToggle key={k} id={k} className="rp-btn">{l}</PressToggle>)}
    </ToggleButtonGroup>
  );
}
type Item = {id: string, label: string, desc?: string, icon?: ReactNode, tone?: 'ok' | 'warn' | 'err'};
// Label with an optional leading icon (a flag, a swatch); shared by menu items and the rendered value of a select.
const ItemLabel = ({i}: {i: Item}) => <span className="rp-il">{i.icon && <span className="ic">{i.icon}</span>}<span>{i.label}</span></span>;
// S2 marks the selected item with a checkmark in a leading column, not with a background.
export const Check = () => <Checkmark UNSAFE_className="rp-check-mark" />;
const item = (i: Item) => <MenuItem key={i.id} id={i.id} className="rp-item" textValue={i.label}><Check /><ItemLabel i={i} />{i.desc && <span className={cx('desc', i.tone)}>{i.desc}</span>}</MenuItem>;
type Picked = {value: string, onChange: (k: string) => void};
const pick = (on: (k: string) => void) => (k: 'all' | Set<Key>) => { if (k === 'all') return; const v = [...k][0]; if (v != null) on(String(v)); };
// `extra` is a second section with its own selection (a setting beside the main choice).
export function MenuButton({children, items, sections, value, onChange, label, quiet, chevron = true, extra}: {children: ReactNode, items?: Item[], sections?: Array<{title: string, items: Item[]}>, value: string, onChange: (k: string) => void, label: string, quiet?: boolean, chevron?: boolean, extra?: {title: string, items: Item[]} & Picked}) {
  return (
    <MenuTrigger>
      <PressButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label}>{children}{chevron && <ChevronDown />}</PressButton>
      <Popover className="rp-popover" placement="bottom end">
        {sections
          ? <Menu aria-label={label}>
              {sections.map(sec => <MenuSection key={sec.title} id={sec.title} selectionMode="single" selectedKeys={[value]} onSelectionChange={pick(onChange)}><Header className="rp-sec-h">{sec.title}</Header>{sec.items.map(item)}</MenuSection>)}
              {extra && <MenuSection id={extra.title} selectionMode="single" selectedKeys={[extra.value]} onSelectionChange={pick(extra.onChange)}><Header className="rp-sec-h">{extra.title}</Header>{extra.items.map(item)}</MenuSection>}
            </Menu>
          : <Menu selectionMode="single" selectedKeys={[value]} onSelectionChange={pick(onChange)} aria-label={label}>{(items ?? []).map(item)}</Menu>}
      </Popover>
    </MenuTrigger>
  );
}
export function InlineSelect({items, value, onChange, label}: {items: Item[], value: string, onChange: (k: string) => void, label: string}) {
  return (
    <Select aria-label={label} selectedKey={value} onSelectionChange={(k: Key | null) => { if (k != null) onChange(String(k)); }}>
      <PressButton className="rp-select"><SelectValue>{({selectedItem}) => selectedItem ? <ItemLabel i={selectedItem as Item} /> : value}</SelectValue><ChevronDown /></PressButton>
      <Popover className="rp-popover" placement="bottom start">
        <ListBox items={items}>{i => <ListBoxItem id={i.id} className="rp-item" textValue={i.label}><Check /><ItemLabel i={i} />{i.desc && <span className={cx('desc', i.tone)}>{i.desc}</span>}</ListBoxItem>}</ListBox>
      </Popover>
    </Select>
  );
}
export function Light({tone, children, small}: {tone: 'ok' | 'warn' | 'err' | 'info', children: ReactNode, small?: boolean}) {
  return <span className={cx('rp-light', tone, small && 'sm')}>{children}</span>;
}
export function Bar({label, value, pct, color, icon}: {label: string, value: string, pct: number, color: string, icon?: ReactNode}) {
  return <div className="rp-bar"><div className="top"><span className="l">{icon && <span className="ic">{icon}</span>}{label}</span><span className="v">{value}</span></div><div className="track"><div className="fill" style={{width: `${Math.max(0, Math.min(100, pct))}%`, background: color}} /></div></div>;
}

// ---- Additions for the remaining pages ----
import {useEffect, type ReactElement} from 'react';
import {Switch as RSwitch, TextField as RTextField, TextArea as RTextArea, Label, Input as RInput, Table, TableHeader, Column, TableBody, Row, Cell, DialogTrigger, Modal, ModalOverlay, Dialog, Heading, Tabs as RTabs, TabList as RTabList, Tab as RTab, TabPanel as RTabPanel, type Selection, type SortDescriptor} from 'react-aria-components';

export function Switch({children, isSelected, onChange, isDisabled}: {children: ReactNode, isSelected: boolean, onChange: (v: boolean) => void, isDisabled?: boolean}) {
  return <RSwitch className="rp-switch" isSelected={isSelected} onChange={onChange} isDisabled={isDisabled}><span className="track" />{children}</RSwitch>;
}
export function TextField({label, value, onChange, defaultValue, width}: {label: string, value?: string, onChange?: (v: string) => void, defaultValue?: string, width?: number}) {
  return <RTextField className="rp-field" value={value} onChange={onChange} defaultValue={defaultValue} style={width ? {width} : undefined}><Label>{label}</Label><span className="rp-input"><RInput /></span></RTextField>;
}
export function TextArea({label, value, onChange}: {label: string, value: string, onChange: (v: string) => void}) {
  return <RTextField className="rp-field" value={value} onChange={onChange} aria-label={label}><RTextArea /></RTextField>;
}
export function LabeledSelect({label, items, value, onChange, isDisabled, side, bare}: {label: string, items: Item[], value: string, onChange: (k: string) => void, isDisabled?: boolean, side?: boolean, bare?: boolean}) {
  const sel = (
    <Select aria-label={label} selectedKey={value} onSelectionChange={(k: Key | null) => { if (k != null) onChange(String(k)); }} isDisabled={isDisabled}>
      <PressButton className="rp-selectbtn"><SelectValue>{({selectedItem}) => selectedItem ? <ItemLabel i={selectedItem as Item} /> : value}</SelectValue><ChevronDown /></PressButton>
      <Popover className="rp-popover" placement="bottom start"><ListBox items={items}>{i => <ListBoxItem id={i.id} className="rp-item" textValue={i.label}><Check /><ItemLabel i={i} />{i.desc && <span className={cx('desc', i.tone)}>{i.desc}</span>}</ListBoxItem>}</ListBox></Popover>
    </Select>
  );
  if (bare) return sel;
  if (side) return <span className="rp-cluster"><span className="rp-label">{label}</span>{sel}</span>;
  return <div className="rp-field"><span className="lbl">{label}</span>{sel}</div>;
}
export function Badge({children, tone}: {children: ReactNode, tone?: 'warn'}) {
  return <span className={cx('rp-badge', tone)}>{children}</span>;
}
export function Kv({items, inline}: {items: Array<[string, string]>, inline?: boolean}) {
  return <div className={cx('rp-kv', inline && 'inline')}>{items.map(([k, v]) => <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>;
}
// Node tile: name and the TCP latency up front, coloured by health; UDP and IPv6 underneath.
// With onPress it is a toggle (selector groups); without, a static member that may be the group's current pick.
export type NodeTileProps = {name: string, icon?: ReactNode, tcp?: number, udp?: number, v6?: boolean, alive?: boolean, nested?: boolean, selected?: boolean, cur?: boolean, onPress?: () => void, labels: {timeout: string, nested: string, cur: string}};
export const latencyTone = (ms: number) => ms < 100 ? 'ok' : ms < 180 ? 'warn' : 'err';
export function NodeTile({name, icon, tcp, udp, v6, alive = true, nested, selected, cur, onPress, labels}: NodeTileProps) {
  const body = <>
    <span className="top"><span className="n">{icon && <span className="ic">{icon}</span>}{name}</span>{nested ? <span className="ms nested">{labels.nested}</span> : alive && tcp != null ? <span className={'ms ' + latencyTone(tcp)}>{tcp} ms</span> : <span className="ms err">{labels.timeout}</span>}</span>
    <span className="s">{nested ? ' ' : alive ? ['UDP ' + udp + ' ms', v6 && 'IPv6'].filter(Boolean).join(' · ') : ' '}{cur && !onPress && <span className="cur">{labels.cur}</span>}</span>
  </>;
  if (onPress) { const [ref, style] = usePress(); return <ToggleButton ref={ref} style={style} className="rp-node" isSelected={selected} onChange={onPress}>{body}</ToggleButton>; }
  return <div className={cx('rp-node', cur && 'cur')}>{body}</div>;
}

// Table: fixed height, scrolls, optional single selection.
export type Col = {id: string, label: string, width?: number, isRowHeader?: boolean, align?: 'end'};
export function DataTable<T extends {id: string}>({label, cols, rows, render, height = 442, selected, onSelect, empty}: {label: string, cols: Col[], rows: T[], render: (r: T) => ReactNode[], height?: number, selected?: string | null, onSelect?: (id: string | null) => void, empty?: string}) {
  const keys: Selection = selected ? new Set([selected]) : new Set();
  return (
    <div className="rp-table" style={{height}}>
      <Table aria-label={label} selectionMode={onSelect ? 'single' : 'none'} selectedKeys={keys} onSelectionChange={k => onSelect && onSelect(k === 'all' ? null : (k.size ? String([...k][0]) : null))} disallowEmptySelection={!!onSelect}>
        <TableHeader>{cols.map(c => <Column key={c.id} id={c.id} isRowHeader={c.isRowHeader} className={c.align === 'end' ? 'end' : undefined} style={c.width ? {width: c.width} : undefined}>{c.label}</Column>)}</TableHeader>
        <TableBody items={rows} renderEmptyState={() => <div className="empty">{empty ?? ''}</div>}>
          {r => <Row id={r.id}>{render(r).map((cell, i) => <Cell key={cols[i].id} className={cols[i].align === 'end' ? 'end' : undefined}>{cell}</Cell>)}</Row>}
        </TableBody>
      </Table>
    </div>
  );
}

// Dialogs
export function ModalDialog({trigger, title, children, footer, narrow, alert}: {trigger: ReactElement, title: string, children: ReactNode | ((close: () => void) => ReactNode), footer?: (close: () => void) => ReactNode, narrow?: boolean, alert?: boolean}) {
  return (
    <DialogTrigger>
      {trigger}
      <ModalOverlay className="rp-underlay" isDismissable={!alert}><Modal><Dialog className={cx('rp-dialog', narrow && 'narrow')} role={alert ? 'alertdialog' : 'dialog'}>
        {({close}) => <><Heading slot="title">{title}</Heading>{typeof children === 'function' ? children(close) : children}{footer && <div className="foot">{footer(close)}</div>}</>}
      </Dialog></Modal></ModalOverlay>
    </DialogTrigger>
  );
}
export function Tabs({tabs, children, label}: {tabs: Array<[string, string]>, children: (id: string) => ReactNode, label: string}) {
  const [sel, setSel] = useState(tabs[0][0]);
  const [ref, pos] = useSlider(sel);
  return (
    <RTabs className="rp-tabs" selectedKey={sel} onSelectionChange={k => setSel(String(k))}>
      <div ref={ref} className="rp-tabhead"><RTabList className="rp-tablist" aria-label={label}>{tabs.map(([id, l]) => <RTab key={id} id={id} className="rp-tab">{l}</RTab>)}</RTabList>{pos && <span className="rp-slider" style={{translate: `${pos.x}px 0`, width: pos.w}} />}</div>
      {tabs.map(([id]) => <RTabPanel key={id} id={id}>{children(id)}</RTabPanel>)}
    </RTabs>
  );
}

// Code and log frames
export function Frame({title, actions, children}: {title: ReactNode, actions?: ReactNode, children: ReactNode}) {
  return <div className="rp-frame"><div className="head"><span>{title}</span>{actions}</div><div className="body">{children}</div></div>;
}
export function Line({n, err, children}: {n: number, err?: boolean, children: ReactNode}) {
  return <div className={cx('rp-line', err && 'err')}><span className="n">{n}</span>{children}</div>;
}
export function DaeLine({text}: {text: string}) {
  if (/^\s*#/.test(text)) return <span className="rp-cmt">{text}</span>;
  const sec = text.match(/^(\s*)(global|dns|upstream|routing|request|response|subscription|group|include|fallback)(\b.*)$/);
  if (sec && sec[2] === 'fallback') { const t = sec[3].match(/^: (\w+)$/); return <span>{sec[1]}<span className="rp-kw">fallback</span>: <span className="rp-out">{t?.[1]}</span></span>; }
  if (sec) return <span>{sec[1]}<span className="rp-kw">{sec[2]}</span>{sec[3]}</span>;
  const r = text.match(/^(\s*)(.+?) -> (\w+)(\(must\))?$/);
  if (r) return <span>{r[1]}<span className="rp-arg">{r[2]}</span> -&gt; <span className="rp-out">{r[3]}{r[4]}</span></span>;
  const s = text.match(/^(\s*)([\w-]+): ('.*')$/);
  if (s) return <span>{s[1]}{s[2]}: <span className="rp-str">{s[3]}</span></span>;
  return <span>{text}</span>;
}
export function LogLine({text}: {text: string}) {
  const m = text.match(/^\[(\w+)\]\s?(.*)$/);
  if (!m) return <span>{text}</span>;
  const cls = m[1] === 'WARN' ? 'rp-lv-warn' : m[1] === 'ERROR' ? 'rp-lv-err' : 'rp-lv-info';
  return <span><span className={'rp-lv ' + cls}>{m[1]}</span>{m[2]}</span>;
}

// Toasts: a queue rendered once by the shell, stacked like S2's ToastContainer.
// The newest toast sits on top; older ones peek out behind it. Clicking the stack or "show all" expands the list over an underlay.
type ToastKind = 'positive' | 'negative' | 'neutral' | 'info';
type ToastItem = {id: number, kind: ToastKind, msg: string, exiting?: boolean, timer?: ReturnType<typeof setTimeout>, left: number, since: number};
let listeners: Array<(t: ToastItem[]) => void> = [];
let queue: ToastItem[] = []; let seq = 0; let paused = false;
const publish = () => listeners.forEach(l => l(queue));
const EXIT_MS = 400; const TIMEOUT_MS = 5000;
const arm = (t: ToastItem) => { t.since = Date.now(); t.timer = setTimeout(() => dismiss(t.id), t.left); };
const disarm = (t: ToastItem) => { if (t.timer) { clearTimeout(t.timer); t.timer = undefined; t.left = Math.max(1000, t.left - (Date.now() - t.since)); } };
const setPaused = (p: boolean) => { if (p === paused) return; paused = p; queue.forEach(t => { if (t.exiting) return; if (p) disarm(t); else if (!t.timer) arm(t); }); };
const dismiss = (id: number) => {
  const t = queue.find(t => t.id === id); if (!t || t.exiting) return;
  disarm(t); queue = queue.map(x => x.id === id ? {...x, exiting: true} : x); publish();
  setTimeout(() => { queue = queue.filter(x => x.id !== id); publish(); }, EXIT_MS);
};
const clearAll = () => queue.forEach(t => dismiss(t.id));
export const toast = (kind: ToastKind, msg: string) => { const t: ToastItem = {id: ++seq, kind, msg, left: TIMEOUT_MS, since: Date.now()}; if (!paused) arm(t); queue = [...queue, t]; publish(); };
const TOAST_ICON = {positive: CheckmarkCircle, negative: AlertTriangle, info: InfoCircle, neutral: null};
export function Toasts({labels}: {labels: {close: string, showAll: string, collapse: string, clearAll: string}}) {
  const [items, setItems] = useState(queue);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { listeners.push(setItems); return () => { listeners = listeners.filter(l => l !== setItems); }; }, []);
  const live = items.filter(t => !t.exiting);
  useEffect(() => { if (live.length === 0 && expanded) setExpanded(false); }, [live.length, expanded]);
  useEffect(() => { setPaused(expanded); }, [expanded]);
  useEffect(() => { if (!expanded) return; const on = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); }; addEventListener('keydown', on); return () => removeEventListener('keydown', on); }, [expanded]);
  if (items.length === 0) return null;
  // Newest first: index 0 is the main toast, the rest stack behind it when collapsed.
  const ordered = [...items].reverse();
  return (
    <>
      {expanded && <div className="rp-toast-underlay" onClick={() => setExpanded(false)} />}
      <div className={cx('rp-toasts', expanded && 'expanded')} role="region" aria-live="polite" onMouseEnter={() => setPaused(true)} onMouseLeave={() => { if (!expanded) setPaused(false); }}>
        {expanded && <div className="rp-toast-controls"><RButton className="rp-btn sm" onPress={clearAll}>{labels.clearAll}</RButton><RButton className="rp-btn sm" onPress={() => setExpanded(false)}>{labels.collapse}</RButton></div>}
        <div className="rp-toast-list" onClick={e => { if (!expanded && live.length > 1 && !(e.target as Element).closest('button')) setExpanded(true); }}>
          {ordered.map((t, i) => {
            const idx = t.exiting ? 0 : live.length - 1 - live.indexOf(t); const Icon = TOAST_ICON[t.kind];
            const background = !expanded && idx > 0;
            return (
              <div key={t.id} className={cx('rp-toast', t.kind, t.exiting && 'exiting', background && 'background')} style={{zIndex: ordered.length - i, '--i': Math.min(idx, 3)} as CSSProperties} aria-hidden={background || undefined}>
                <div className="main">
                  <span className="body">{Icon && <Icon />}<span className="grow">{t.msg}</span></span>
                  {!expanded && idx === 0 && live.length > 1 && <RButton className="rp-btn sm quiet more" onPress={() => setExpanded(true)}>{labels.showAll} ({live.length})</RButton>}
                </div>
                <RButton className="rp-btn quiet icon close" aria-label={labels.close} onPress={() => dismiss(t.id)}><Close /></RButton>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
export type {SortDescriptor};
