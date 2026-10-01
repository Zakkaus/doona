import {Button, Dialog, DialogTrigger, ListBox, ListBoxItem, Popover} from 'react-aria-components';
import {useId} from 'react';
import {SearchList} from './SearchList';
import {Check} from './Check';
import {ItemText} from './Select';
import ChevronDown from './icons/ChevronDown';
import type {CheckboxChoice} from './CheckboxSet';

export function SearchMultiSelect({
  label,
  searchLabel,
  summary,
  items,
  value,
  onChange,
  isDisabled
}: {
  label: string;
  searchLabel: string;
  summary: string;
  items: CheckboxChoice[];
  value: string[];
  onChange: (value: string[]) => void;
  isDisabled?: boolean;
}) {
  const heading = useId();
  const description = useId();
  return (
    <div className="rp-field">
      <span id={heading} className="lbl">
        {label}
      </span>
      <DialogTrigger>
        <Button className="rp-selectbtn" aria-labelledby={heading} aria-describedby={description} isDisabled={isDisabled}>
          <span id={description}>{summary}</span>
          <ChevronDown />
        </Button>
        <Popover className="rp-popover rp-search-popover" placement="bottom start">
          <Dialog aria-label={label}>
            <SearchList label={searchLabel}>
              <ListBox
                className="rp-menu-scroll"
                aria-label={label}
                selectionMode="multiple"
                selectionBehavior="toggle"
                selectedKeys={value}
                disabledKeys={items.filter(item => item.isDisabled).map(item => item.id)}
                onSelectionChange={keys => onChange(keys === 'all' ? items.filter(item => !item.isDisabled).map(item => item.id) : [...keys].map(String))}
              >
                {items.map(item => (
                  <ListBoxItem key={item.id} id={item.id} textValue={item.label} className="rp-item">
                    <Check />
                    <ItemText i={item} />
                  </ListBoxItem>
                ))}
              </ListBox>
            </SearchList>
          </Dialog>
        </Popover>
      </DialogTrigger>
    </div>
  );
}
