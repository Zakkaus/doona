import type {ReactNode} from 'react';
import {
  type PopoverProps,
  Button as RButton,
  Menu,
  MenuItem,
  MenuTrigger,
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
        <ChevronDown className="rp-chevron" />
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
export const pickMenuKey = (on: (k: string) => void) => (k: 'all' | Set<Key>) => {
  if (k === 'all') return;
  const v = [...k][0];
  if (v != null) on(String(v));
};
export function MenuChoice({item, children}: {item: Item; children?: ReactNode}) {
  return (
    <MenuItem id={item.id} className="rp-item" textValue={item.label}>
      <Check />
      <ItemLabel i={item} />
      {children ?? (item.desc && <span className="desc">{item.desc}</span>)}
    </MenuItem>
  );
}

type MenuButtonProps = {
  children: ReactNode;
  content: ReactNode;
  label: string;
  quiet?: boolean;
  chevron?: boolean;
  isDisabled?: boolean;
  appearance?: 'select';
  placement?: PopoverProps['placement'];
};
export function MenuButton({children, content, label, quiet, chevron = true, isDisabled, appearance, placement = 'bottom end'}: MenuButtonProps) {
  return (
    <MenuTrigger>
      {appearance ? (
        <Button appearance={appearance} quiet={quiet} icon={!chevron} label={label} isDisabled={isDisabled}>
          {children}
          {chevron && <ChevronDown className="rp-chevron" />}
        </Button>
      ) : (
        <RButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label} isDisabled={isDisabled}>
          {children}
          {chevron && <ChevronDown className="rp-chevron" />}
        </RButton>
      )}
      <Popover className="rp-popover" placement={placement}>
        {content}
      </Popover>
    </MenuTrigger>
  );
}

export function ChoiceMenu({
  items,
  value,
  onChange,
  ...props
}: Omit<MenuButtonProps, 'content'> & {
  items: Item[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <MenuButton
      {...props}
      content={
        <Menu aria-label={props.label} selectionMode="single" selectedKeys={[value]} onSelectionChange={pickMenuKey(onChange)}>
          {items.map(item => (
            <MenuChoice key={item.id} item={item} />
          ))}
        </Menu>
      }
    />
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
