// Small control kit on react-aria-components, styled by theme.css with the Rosé Pine variables.
import type {ReactNode} from 'react';
import {Button as RButton, ToggleButton, ToggleButtonGroup, Menu, MenuItem, MenuTrigger, MenuSection, Header, Popover, Select, SelectValue, ListBox, ListBoxItem, Tooltip, TooltipTrigger, OverlayArrow, type Key} from 'react-aria-components';
import ChevronDown from '@react-spectrum/s2/icons/ChevronDown';

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

export function Button({children, onPress, quiet, small, icon, accent, label}: {children?: ReactNode, onPress?: () => void, quiet?: boolean, small?: boolean, icon?: boolean, accent?: boolean, label?: string}) {
  const btn = <RButton className={cx('rp-btn', quiet && 'quiet', small && 'sm', icon && 'icon', accent && 'accent')} onPress={onPress} aria-label={label}>{children}</RButton>;
  return label ? <TooltipTrigger delay={400}><Tip>{label}</Tip>{btn}</TooltipTrigger> : btn;
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
export function Light({tone, children}: {tone: 'ok' | 'warn' | 'err' | 'info', children: ReactNode}) {
  return <span className={cx('rp-light', tone)}>{children}</span>;
}
export function Bar({label, value, pct, color}: {label: string, value: string, pct: number, color: string}) {
  return <div className="rp-bar"><div className="top"><span className="l">{label}</span><span className="v">{value}</span></div><div className="track"><div className="fill" style={{width: `${Math.max(0, Math.min(100, pct))}%`, background: color}} /></div></div>;
}
