import {Button as RButton, Select, SelectValue, Popover, ListBox, ListBoxItem, Label, Text, type Key} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import {Check} from './Check';
import {ItemLabel, ItemText, type Item} from './Select';
import {cx} from './cx';
import {useControlSize, type ControlSize} from './controlSize';

export function LabeledSelect({
  label,
  items,
  value,
  onChange,
  isDisabled,
  side,
  bare,
  cut,
  takeFocus,
  size,
  description
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
  description?: string;
  size?: ControlSize;
}) {
  const layout = bare ? undefined : side ? 'side' : 'field';
  const controlSize = useControlSize(size);
  // With a layout the label is visible and a real Label, so pressing it opens the picker; without one it only names it.
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
      <RButton className="rp-selectbtn" data-size={controlSize} autoFocus={takeFocus}>
        <SelectValue>{({selectedItem}) => (selectedItem ? <ItemLabel i={selectedItem as Item} cut={cut} /> : value)}</SelectValue>
        <ChevronDown />
      </RButton>
      {description && (
        <Text slot="description" className="rp-label">
          {description}
        </Text>
      )}
      <Popover className="rp-popover" placement="bottom start">
        <ListBox items={items}>
          {i => (
            <ListBoxItem id={i.id} className="rp-item" textValue={i.label}>
              <Check />
              <ItemText i={i} />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
