import type {ReactNode} from 'react';
import {
  Autocomplete,
  ListLayout,
  Virtualizer,
  useFilter,
  type PopoverProps,
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
import {Button, TextTooltip} from './Button';
import {Check, TextField} from './Fields';

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
export function MenuButton<T extends Item>({
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
  isDisabled,
  appearance,
  placement = 'bottom end',
  searchLabel,
  virtualizeAbove,
  renderTrailing
}: {
  children: ReactNode;
  items?: T[];
  sections?: Array<{title: string; heading?: ReactNode; items: T[]}>;
  value: string | string[];
  onChange: (k: string) => void;
  multiple?: boolean;
  label: string;
  quiet?: boolean;
  chevron?: boolean;
  extra?: {title: string; items: Item[]} & Picked;
  isDisabled?: boolean;
  appearance?: 'select';
  placement?: PopoverProps['placement'];
  searchLabel?: string;
  virtualizeAbove?: number;
  renderTrailing?: (item: T) => ReactNode;
}) {
  const {contains} = useFilter({sensitivity: 'base'});
  const count = (sections ? sections.reduce((n, section) => n + section.items.length, 0) : (items?.length ?? 0)) + (extra?.items.length ?? 0);
  const virtual = virtualizeAbove !== undefined && count > virtualizeAbove;
  const item = (i: T) => (
    <MenuItem key={i.id} id={i.id} className="rp-item" textValue={i.label}>
      <Check />
      <ItemLabel i={i} />
      {renderTrailing ? renderTrailing(i) : i.desc && <span className="desc">{i.desc}</span>}
    </MenuItem>
  );
  const list = (
    <Menu
      className={virtualizeAbove !== undefined || searchLabel ? 'rp-menu-scroll' : undefined}
      selectionMode={sections ? undefined : multiple ? 'multiple' : 'single'}
      selectedKeys={sections ? undefined : typeof value === 'string' ? [value] : value}
      onSelectionChange={sections || multiple ? undefined : pick(onChange)}
      onAction={!sections && multiple ? key => onChange(String(key)) : undefined}
      shouldCloseOnSelect={!!sections || !multiple}
      aria-label={label}
    >
      {sections
        ? sections.map(sec => (
            <MenuSection
              key={sec.title}
              id={sec.title}
              selectionMode="single"
              selectedKeys={typeof value === 'string' ? [value] : value}
              onSelectionChange={pick(onChange)}
            >
              <Header className="rp-sec-h">{sec.heading ?? sec.title}</Header>
              {sec.items.map(item)}
            </MenuSection>
          ))
        : (items ?? []).map(item)}
      {sections && extra && (
        <MenuSection id={extra.title} selectionMode="single" selectedKeys={[extra.value]} onSelectionChange={pick(extra.onChange)}>
          <Header className="rp-sec-h">{extra.title}</Header>
          {extra.items.map(i => (
            <MenuItem key={i.id} id={i.id} className="rp-item" textValue={i.label}>
              <ItemBody i={i} />
            </MenuItem>
          ))}
        </MenuSection>
      )}
    </Menu>
  );
  // Virtual row heights match the item and section-header heights in the theme.
  const menu = virtual ? (
    <Virtualizer layout={ListLayout} layoutOptions={{rowHeight: 32, headingHeight: 26}}>
      {list}
    </Virtualizer>
  ) : (
    list
  );
  return (
    <MenuTrigger>
      {appearance ? (
        <Button appearance={appearance} quiet={quiet} icon={!chevron} label={label} isDisabled={isDisabled}>
          {children}
          {chevron && <ChevronDown />}
        </Button>
      ) : (
        <RButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label} isDisabled={isDisabled}>
          {children}
          {chevron && <ChevronDown />}
        </RButton>
      )}
      <Popover className="rp-popover" placement={placement}>
        {searchLabel ? (
          <Autocomplete filter={contains}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the menu the user just opened */}
            <TextField search label={searchLabel} autoFocus className="rp-menu-search" />
            {menu}
          </Autocomplete>
        ) : (
          menu
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
