import {Button, Dialog, DialogTrigger, ListBox, ListBoxItem, Popover} from 'react-aria-components';
import {useId, useState, type ReactNode} from 'react';
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
  isDisabled,
  description,
  action
}: {
  label: string;
  searchLabel: string;
  summary: string;
  items: CheckboxChoice[];
  value: string[];
  onChange: (value: string[]) => void;
  isDisabled?: boolean;
  description?: string;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const heading = useId();
  const summaryId = useId();
  const helpId = useId();
  return (
    <div className="rp-field">
      <span id={heading} className="lbl">
        {label}
      </span>
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <Button
          className="rp-selectbtn"
          aria-labelledby={heading}
          aria-describedby={[summaryId, description && helpId].filter(Boolean).join(' ')}
          isDisabled={isDisabled}
        >
          <span id={summaryId}>{summary}</span>
          <ChevronDown />
        </Button>
        <Popover className="rp-popover rp-search-popover" placement="bottom start">
          <Dialog
            aria-label={label}
            render={props => (
              <section
                {...props}
                onKeyDownCapture={event => {
                  // Autocomplete consumes Escape before the popover can dismiss.
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(false);
                }}
              />
            )}
          >
            <SearchList label={searchLabel}>
              <ListBox
                className="rp-menu-scroll rp-overlay-scroll"
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
      {(description || action) && (
        <div className="rp-field-help">
          {description && (
            <span id={helpId} className="rp-label" role="status">
              {description}
            </span>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
