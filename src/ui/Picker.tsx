import {Button as RButton, Select, SelectValue, Popover, ListBox, ListBoxItem, Label, type Key} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import {Check} from './Check';
import {ItemLabel, ItemText, type Item} from './Select';
import {cx} from './cx';

const ItemBody = ({i}: {i: Item}) => (
  <>
    <Check />
    <ItemText i={i} />
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
  layout,
  cut,
  takeFocus
}: Picked & {items: Item[]; label: string; isDisabled?: boolean; className: string; layout?: 'field' | 'side'; cut?: 'start' | 'path'; takeFocus?: boolean}) {
  return (
    <Select
      aria-label={layout ? undefined : label}
      className={cx('rp-picker', layout === 'field' && 'rp-field', layout === 'side' && 'rp-cluster')}
      selectedKey={value}
      onSelectionChange={(k: Key | null) => {
        if (k != null) onChange(String(k));
      }}
      isDisabled={isDisabled}
    >
      {layout && <Label className={layout === 'field' ? 'lbl' : 'rp-label'}>{label}</Label>}
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- An explicit jump focuses the requested field. */}
      <RButton className={className} autoFocus={takeFocus}>
        <SelectValue>{({selectedItem}) => (selectedItem ? <ItemLabel i={selectedItem as Item} cut={cut} /> : value)}</SelectValue>
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
  bare,
  cut,
  takeFocus
}: {
  label: string;
  items: Item[];
  value: string;
  onChange: (k: string) => void;
  isDisabled?: boolean;
  side?: boolean;
  bare?: boolean;
  // Path values truncate the directory while reserving the basename and revealing the full path.
  cut?: 'start' | 'path';
  takeFocus?: boolean;
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
      cut={cut}
      takeFocus={takeFocus}
    />
  );
}
