import type {ReactNode} from 'react';
import {
  type PopoverProps,
  Button as RButton,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Select,
  SelectValue,
  ListBox,
  ListBoxItem,
  Label,
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
// With a layout the label is visible and a real Label, so pressing it opens the picker; without one it only names it.
function SelectBody({
  items,
  value,
  onChange,
  label,
  isDisabled,
  className,
  layout
}: Picked & {items: Item[]; label: string; isDisabled?: boolean; className: string; layout?: 'field' | 'side'}) {
  return (
    <Select
      aria-label={layout ? undefined : label}
      className={layout === 'field' ? 'rp-field' : layout === 'side' ? 'rp-cluster' : undefined}
      selectedKey={value}
      onSelectionChange={(k: Key | null) => {
        if (k != null) onChange(String(k));
      }}
      isDisabled={isDisabled}
    >
      {layout && <Label className={layout === 'field' ? 'lbl' : 'rp-label'}>{label}</Label>}
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
          {chevron && <ChevronDown />}
        </Button>
      ) : (
        <RButton className={cx('rp-btn', quiet && 'quiet', !chevron && 'icon')} aria-label={label} isDisabled={isDisabled}>
          {children}
          {chevron && <ChevronDown />}
        </RButton>
      )}
      <Popover className="rp-popover" placement={placement}>
        {content}
      </Popover>
    </MenuTrigger>
  );
}

export type ChoiceSection = {title: string; items: Item[]; value: string; onChange?: (key: string) => void};
// A menu of choices, flat or in titled sections, each with its own selection. `onAction` hears every pick,
// including one of the already chosen item, for menus where picking it again clears it.
export function ChoiceMenu({
  items,
  value,
  onChange,
  sections,
  onAction,
  ...props
}: Omit<MenuButtonProps, 'content'> &
  (
    | {items: Item[]; value: string; onChange: (key: string) => void; sections?: never}
    | {sections: ChoiceSection[]; items?: never; value?: never; onChange?: never}
  ) & {
    onAction?: (key: string) => void;
  }) {
  return (
    <MenuButton
      {...props}
      content={
        sections ? (
          <Menu aria-label={props.label} onAction={onAction && (key => onAction(String(key)))}>
            {sections.map(section => (
              <MenuSection
                key={section.title}
                id={section.title}
                selectionMode="single"
                selectedKeys={[section.value]}
                onSelectionChange={section.onChange && pickMenuKey(section.onChange)}
              >
                <Header className="rp-sec-h">{section.title}</Header>
                {section.items.map(item => (
                  <MenuChoice key={item.id} item={item} />
                ))}
              </MenuSection>
            ))}
          </Menu>
        ) : (
          <Menu
            aria-label={props.label}
            selectionMode="single"
            selectedKeys={[value]}
            onSelectionChange={pickMenuKey(onChange)}
            onAction={onAction && (key => onAction(String(key)))}
          >
            {items.map(item => (
              <MenuChoice key={item.id} item={item} />
            ))}
          </Menu>
        )
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
  return (
    <SelectBody
      items={items}
      value={value}
      onChange={onChange}
      label={label}
      isDisabled={isDisabled}
      className="rp-selectbtn"
      layout={bare ? undefined : side ? 'side' : 'field'}
    />
  );
}
