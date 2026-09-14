// Small control kit on react-aria-components, styled by theme.css with the Rosé Pine variables.
import type {ReactNode} from 'react';
import {Button as RButton, ToggleButton, ToggleButtonGroup, Menu, MenuItem, MenuTrigger, MenuSection, Header, Popover, Select, SelectValue, ListBox, ListBoxItem, Tooltip, TooltipTrigger, OverlayArrow, type Key} from 'react-aria-components';
import ChevronDown from '@react-spectrum/s2/icons/ChevronDown';

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

export function Button({children, onPress, quiet, small, icon, accent, primary, negative, label, isDisabled, tip}: {children?: ReactNode, onPress?: () => void, quiet?: boolean, small?: boolean, icon?: boolean, accent?: boolean, primary?: boolean, negative?: boolean, label?: string, isDisabled?: boolean, tip?: string}) {
  const btn = <RButton className={cx('rp-btn', quiet && 'quiet', small && 'sm', icon && 'icon', accent && 'accent', primary && 'primary', negative && 'negative')} onPress={onPress} aria-label={label} isDisabled={isDisabled}>{children}</RButton>;
  const text = label ?? tip;
  return text ? <TooltipTrigger delay={400}><Tip>{text}</Tip>{btn}</TooltipTrigger> : btn;
}
function Tip({children}: {children: ReactNode}) {
  return <Tooltip className="rp-tip" offset={6}><OverlayArrow /> {children}</Tooltip>;
}
export function Segmented({items, value, onChange, label}: {items: Array<[string, string]>, value: string, onChange: (k: string) => void, label: string}) {
  return (
    <ToggleButtonGroup className="rp-seg" aria-label={label} selectionMode="single" disallowEmptySelection selectedKeys={[value]} onSelectionChange={k => { const v = [...k][0]; if (v != null) onChange(String(v)); }}>
      {items.map(([k, l]) => <ToggleButton key={k} id={k} className="rp-btn">{l}</ToggleButton>)}
    </ToggleButtonGroup>
  );
}
type Item = {id: string, label: string, desc?: string};
const item = (i: Item) => <MenuItem key={i.id} id={i.id} className="rp-item" textValue={i.label}><span>{i.label}</span>{i.desc && <span className="desc">{i.desc}</span>}</MenuItem>;
export function MenuButton({children, items, sections, value, onChange, label, quiet, chevron = true}: {children: ReactNode, items?: Item[], sections?: Array<{title: string, items: Item[]}>, value: string, onChange: (k: string) => void, label: string, quiet?: boolean, chevron?: boolean}) {
  return (
    <MenuTrigger>
      <RButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label}>{children}{chevron && <ChevronDown />}</RButton>
      <Popover className="rp-popover" placement="bottom end">
        <Menu selectionMode="single" selectedKeys={[value]} onSelectionChange={k => { if (k === 'all') return; const v = [...k][0]; if (v != null) onChange(String(v)); }} aria-label={label}>
          {sections ? sections.map(sec => <MenuSection key={sec.title} id={sec.title}><Header className="rp-sec-h">{sec.title}</Header>{sec.items.map(item)}</MenuSection>) : (items ?? []).map(item)}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
export function InlineSelect({items, value, onChange, label}: {items: Array<{id: string, label: string, desc?: string}>, value: string, onChange: (k: string) => void, label: string}) {
  return (
    <Select aria-label={label} selectedKey={value} onSelectionChange={(k: Key | null) => { if (k != null) onChange(String(k)); }}>
      <RButton className="rp-select"><SelectValue>{({selectedItem}) => (selectedItem as {label?: string} | null)?.label ?? value}</SelectValue><ChevronDown /></RButton>
      <Popover className="rp-popover" placement="bottom start">
        <ListBox items={items}>{i => <ListBoxItem id={i.id} className="rp-item" textValue={i.label}><span>{i.label}</span>{i.desc && <span className="desc">{i.desc}</span>}</ListBoxItem>}</ListBox>
      </Popover>
    </Select>
  );
}
export function Light({tone, children, small}: {tone: 'ok' | 'warn' | 'err' | 'info', children: ReactNode, small?: boolean}) {
  return <span className={cx('rp-light', tone, small && 'sm')}>{children}</span>;
}
export function Bar({label, value, pct, color}: {label: string, value: string, pct: number, color: string}) {
  return <div className="rp-bar"><div className="top"><span className="l">{label}</span><span className="v">{value}</span></div><div className="track"><div className="fill" style={{width: `${Math.max(0, Math.min(100, pct))}%`, background: color}} /></div></div>;
}

// ---- Additions for the remaining pages ----
import {useEffect, useState, type ReactElement} from 'react';
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
export function LabeledSelect({label, items, value, onChange, isDisabled, side}: {label: string, items: Item[], value: string, onChange: (k: string) => void, isDisabled?: boolean, side?: boolean}) {
  const sel = (
    <Select aria-label={label} selectedKey={value} onSelectionChange={(k: Key | null) => { if (k != null) onChange(String(k)); }} isDisabled={isDisabled}>
      <RButton className="rp-selectbtn"><SelectValue>{({selectedItem}) => (selectedItem as Item | null)?.label ?? value}</SelectValue><ChevronDown /></RButton>
      <Popover className="rp-popover" placement="bottom start"><ListBox items={items}>{i => <ListBoxItem id={i.id} className="rp-item" textValue={i.label}><span>{i.label}</span>{i.desc && <span className="desc">{i.desc}</span>}</ListBoxItem>}</ListBox></Popover>
    </Select>
  );
  if (side) return <span className="rp-cluster"><span className="rp-label">{label}</span>{sel}</span>;
  return <div className="rp-field"><span className="lbl">{label}</span>{sel}</div>;
}
export function Badge({children, tone}: {children: ReactNode, tone?: 'warn'}) {
  return <span className={cx('rp-badge', tone)}>{children}</span>;
}
export function Kv({items, inline}: {items: Array<[string, string]>, inline?: boolean}) {
  return <div className={cx('rp-kv', inline && 'inline')}>{items.map(([k, v]) => <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>;
}
export function ToggleTile({selected, onPress, name, sub}: {selected: boolean, onPress: () => void, name: string, sub: string}) {
  return <ToggleButton className="rp-btn xl" isSelected={selected} onChange={onPress}><span className="n">{name}</span><span className="s">{sub}</span></ToggleButton>;
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
  return (
    <RTabs className="rp-tabs">
      <RTabList className="rp-tablist" aria-label={label}>{tabs.map(([id, l]) => <RTab key={id} id={id} className="rp-tab">{l}</RTab>)}</RTabList>
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

// Toasts: a tiny queue, rendered once by the shell.
type ToastKind = 'positive' | 'negative' | 'neutral' | 'info';
let listeners: Array<(t: {id: number, kind: ToastKind, msg: string}[]) => void> = [];
let queue: {id: number, kind: ToastKind, msg: string}[] = []; let seq = 0;
export const toast = (kind: ToastKind, msg: string) => { const id = ++seq; queue = [...queue, {id, kind, msg}]; listeners.forEach(l => l(queue)); setTimeout(() => { queue = queue.filter(t => t.id !== id); listeners.forEach(l => l(queue)); }, 5000); };
export function Toasts() {
  const [items, setItems] = useState(queue);
  useEffect(() => { listeners.push(setItems); return () => { listeners = listeners.filter(l => l !== setItems); }; }, []);
  return <div className="rp-toasts">{items.map(t => <div key={t.id} className={cx('rp-toast', t.kind)}>{t.msg}</div>)}</div>;
}
export type {SortDescriptor};
