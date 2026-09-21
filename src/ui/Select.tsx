import type {ReactNode} from 'react';
import {
  Button as RButton,
  ToggleButton,
  ToggleButtonGroup,
  Menu,
  MenuItem,
  MenuTrigger,
  MenuSection,
  Header,
  Popover,
  Select,
  SelectValue,
  ListBox,
  ListBoxItem,
  type Key
} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import {cx} from './cx';
import {TextTooltip} from './Button';
import {Check} from './Fields';

type Item = {id: string; label: string; desc?: string; icon?: ReactNode};
const ItemLabel = ({i}: {i: Item}) => (
  <span className="rp-il">
    {i.icon && <span className="ic">{i.icon}</span>}
    <TextTooltip>{i.label}</TextTooltip>
  </span>
);
const ItemBody = ({i}: {i: Item}) => (
  <>
    <Check />
    <ItemLabel i={i} />
    {i.desc && <span className="desc">{i.desc}</span>}
  </>
);
const item = (i: Item) => (
  <MenuItem key={i.id} id={i.id} className="rp-item" textValue={i.label}>
    <ItemBody i={i} />
  </MenuItem>
);
function SelectBody({items, value, onChange, label, isDisabled, className}: Picked & {items: Item[]; label: string; isDisabled?: boolean; className: string}) {
  return (
    <Select
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(k: Key | null) => {
        if (k != null) onChange(String(k));
      }}
      isDisabled={isDisabled}
    >
      <RButton className={className}>
        <SelectValue>{({selectedItem}) => (selectedItem ? <ItemLabel i={selectedItem as Item} /> : value)}</SelectValue>
        <ChevronDown />
      </RButton>
      <Popover className="rp-popover" placement="bottom start">
        <ListBox items={items}>
          {i => (
            <ListBoxItem id={i.id} className="rp-item" textValue={i.label}>
              <ItemBody i={i} />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
type Picked = {value: string; onChange: (k: string) => void};
const pick = (on: (k: string) => void) => (k: 'all' | Set<Key>) => {
  if (k === 'all') return;
  const v = [...k][0];
  if (v != null) on(String(v));
};
// `extra` is a second section with its own selection (a setting beside the main choice).
export function MenuButton({
  children,
  items,
  sections,
  value,
  onChange,
  multiple = false,
  label,
  quiet,
  chevron = true,
  extra,
  isDisabled
}: {
  children: ReactNode;
  items?: Item[];
  sections?: Array<{title: string; items: Item[]}>;
  value: string | string[];
  onChange: (k: string) => void;
  multiple?: boolean;
  label: string;
  quiet?: boolean;
  chevron?: boolean;
  extra?: {title: string; items: Item[]} & Picked;
  isDisabled?: boolean;
}) {
  return (
    <MenuTrigger>
      <RButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label} isDisabled={isDisabled}>
        {children}
        {chevron && <ChevronDown />}
      </RButton>
      <Popover className="rp-popover" placement="bottom end">
        {sections ? (
          <Menu aria-label={label}>
            {sections.map(sec => (
              <MenuSection
                key={sec.title}
                id={sec.title}
                selectionMode="single"
                selectedKeys={typeof value === 'string' ? [value] : value}
                onSelectionChange={pick(onChange)}
              >
                <Header className="rp-sec-h">{sec.title}</Header>
                {sec.items.map(item)}
              </MenuSection>
            ))}
            {extra && (
              <MenuSection id={extra.title} selectionMode="single" selectedKeys={[extra.value]} onSelectionChange={pick(extra.onChange)}>
                <Header className="rp-sec-h">{extra.title}</Header>
                {extra.items.map(item)}
              </MenuSection>
            )}
          </Menu>
        ) : (
          <Menu
            selectionMode={multiple ? 'multiple' : 'single'}
            selectedKeys={typeof value === 'string' ? [value] : value}
            onSelectionChange={multiple ? undefined : pick(onChange)}
            onAction={multiple ? key => onChange(String(key)) : undefined}
            shouldCloseOnSelect={!multiple}
            aria-label={label}
          >
            {(items ?? []).map(item)}
          </Menu>
        )}
      </Popover>
    </MenuTrigger>
  );
}
export function InlineSelect({items, value, onChange, label}: {items: Item[]; value: string; onChange: (k: string) => void; label: string}) {
  return <SelectBody items={items} value={value} onChange={onChange} label={label} className="rp-select" />;
}

export function LabeledSelect({
  label,
  items,
  value,
  onChange,
  isDisabled,
  side,
  bare
}: {
  label: string;
  items: Item[];
  value: string;
  onChange: (k: string) => void;
  isDisabled?: boolean;
  side?: boolean;
  bare?: boolean;
}) {
  const sel = <SelectBody items={items} value={value} onChange={onChange} label={label} isDisabled={isDisabled} className="rp-selectbtn" />;
  if (bare) return sel;
  if (side)
    return (
      <span className="rp-cluster">
        <span className="rp-label">{label}</span>
        {sel}
      </span>
    );
  return (
    <div className="rp-field">
      <span className="lbl">{label}</span>
      {sel}
    </div>
  );
}

// A wrapping row of toggle chips with one selectable at a time; a count sits after the label when given.
export function Chips({
  label,
  items,
  value,
  onChange
}: {
  label: string;
  items: Array<{id: string; label: string; count?: string; countLabel?: string}>;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <ToggleButtonGroup
      className="rp-chips"
      aria-label={label}
      selectionMode="single"
      selectedKeys={value ? [value] : []}
      onSelectionChange={keys => {
        const next = [...keys][0];
        onChange(next == null ? null : String(next));
      }}
    >
      {items.map(item => (
        <ToggleButton key={item.id} id={item.id} className="rp-btn sm">
          <span className="rp-truncate">{item.label}</span>
          {item.count !== undefined && (
            <span className="n" title={item.countLabel}>
              {item.count}
            </span>
          )}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
