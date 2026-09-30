import {Button as RButton, Header, Label, ListBox, ListBoxItem, ListBoxSection, Popover, Select, SelectValue, Text, type Key} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import {Check} from './Check';
import {cx} from './cx';
import {ItemLabel, ItemText, type Item} from './Select';
import {SearchList} from './SearchList';

// A choice whose description is a latency or a state, coloured by its tone as the node menus colour theirs.
// `keywords`: more text the filter matches besides the label, such as the rule a position is placed before.
export type SearchItem = Item & {tone?: 'ok' | 'warn' | 'err'; keywords?: string};
// A section without a title lists its items without a heading, such as a leading None.
export type SearchSection = {id: string; title?: string; items: SearchItem[]};

// A picker for a long list, after S2's Picker: the same field, trigger and help as LabeledSelect, and a popover that
// filters its sections by name and renders only the rows in view.
const choice = (item: SearchItem) => (
  <ListBoxItem key={item.id} id={item.id} className="rp-item" textValue={item.keywords ? `${item.label} ${item.keywords}` : item.label}>
    <Check />
    <ItemText i={item}>{item.desc && <span className={cx('desc', item.tone)}>{item.desc}</span>}</ItemText>
  </ListBoxItem>
);
export function SearchSelect({
  label,
  searchLabel,
  sections,
  value,
  onChange,
  isDisabled,
  description,
  takeFocus,
  side
}: {
  label: string;
  // Names the filter field in the popover.
  searchLabel: string;
  sections: SearchSection[];
  value: string;
  onChange: (key: string) => void;
  isDisabled?: boolean;
  description?: string;
  // Focuses the trigger when it mounts, for a dialog opened to change this field.
  takeFocus?: boolean;
  // The label beside the trigger, as LabeledSelect's `side`, for a toolbar.
  side?: boolean;
}) {
  const shown = sections.flatMap(section => section.items).find(item => item.id === value);
  return (
    <Select
      className={side ? 'rp-cluster' : 'rp-field'}
      selectedKey={value}
      onSelectionChange={(k: Key | null) => {
        if (k != null) onChange(String(k));
      }}
      isDisabled={isDisabled}
    >
      <Label className={side ? 'rp-label' : 'lbl'}>{label}</Label>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- a dialog opened for this field starts on it */}
      <RButton className="rp-selectbtn" autoFocus={takeFocus}>
        {/* The list is built only while the popover is open, so the trigger finds the chosen item itself. */}
        <SelectValue>{() => (shown ? <ItemLabel i={shown} /> : value)}</SelectValue>
        <ChevronDown />
      </RButton>
      {description && (
        <Text slot="description" className="rp-label">
          {description}
        </Text>
      )}
      <Popover className="rp-popover rp-search-popover" placement="bottom start">
        <SearchList label={searchLabel}>
          <ListBox className="rp-menu-scroll">
            {sections.map(section =>
              section.title ? (
                <ListBoxSection key={section.id} id={section.id}>
                  <Header className="rp-sec-h">{section.title}</Header>
                  {section.items.map(choice)}
                </ListBoxSection>
              ) : (
                section.items.map(choice)
              )
            )}
          </ListBox>
        </SearchList>
      </Popover>
    </Select>
  );
}
