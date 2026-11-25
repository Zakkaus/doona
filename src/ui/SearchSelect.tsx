import {useRef, type ReactNode} from 'react';
import {
  Button as RButton,
  ButtonContext,
  FieldError,
  Header,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  Select,
  SelectValue,
  Text,
  type Key
} from 'react-aria-components';
import AlertTriangle from './icons/AlertTriangle';
import ChevronDown from './icons/ChevronDown';
import {Check} from './Check';
import {cx} from './cx';
import {usePopoverBoundary} from './hooks';
import {ItemLabel, ItemText, type Item} from './ItemText';
import {SearchList} from './SearchList';
import {Toolbar} from './Toolbar';
import {useControlSize, type ControlSize} from './controlSize';

// A choice whose description is a latency or a state, coloured by its tone as the node menus colour theirs.
// `keywords`: more text the filter matches besides the label, such as the rule a position is placed before.
export type SearchItem = Item & {tone?: 'ok' | 'warn' | 'err'; keywords?: string; isDisabled?: boolean};
// A section without a title lists its items without a heading, such as a leading None.
export type SearchSection = {id: string; title?: string; items: SearchItem[]};

// A picker for a long list, after S2's Picker: the same field, trigger and help as LabeledSelect, and a popover that
// filters its sections by name and renders only the rows in view.
const choice = (item: SearchItem) => (
  <ListBoxItem key={item.id} id={item.id} className="rp-item" textValue={item.keywords ? `${item.label} ${item.keywords}` : item.label}>
    <Check />
    <ItemText i={item}>
      {item.desc && (
        <Text slot="description" className={cx('desc', item.tone)}>
          {item.desc}
        </Text>
      )}
    </ItemText>
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
  side,
  size,
  placeholder,
  error,
  action
}: {
  label: string;
  // Names the filter field in the popover.
  searchLabel: string;
  sections: SearchSection[];
  value: string;
  onChange: (key: string) => void;
  isDisabled?: boolean;
  description?: string;
  // The label beside the trigger, as LabeledSelect's `side`, for a toolbar.
  side?: boolean;
  size?: ControlSize;
  // The trigger's text while no item is chosen, as S2's Picker shows it.
  placeholder?: string;
  // Shown under the trigger as a text field shows its error.
  error?: string | null;
  // Controls beside the trigger, as a text field's action; the error then spans them too.
  action?: ReactNode;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const controlSize = useControlSize(size);
  const boundary = usePopoverBoundary();
  const shown = sections.flatMap(section => section.items).find(item => item.id === value);
  const trigger = (
    <RButton ref={buttonRef} className="rp-selectbtn" data-size={controlSize}>
      {/* The list is built only while the popover is open, so the trigger finds the chosen item itself. */}
      <SelectValue>{() => (shown ? <ItemLabel i={shown} /> : value || placeholder)}</SelectValue>
      <ChevronDown />
    </RButton>
  );
  return (
    <Select
      className={cx('rp-picker', side ? 'rp-cluster' : 'rp-field')}
      selectedKey={value}
      disabledKeys={sections.flatMap(section => section.items.filter(item => item.isDisabled).map(item => item.id))}
      onSelectionChange={(k: Key | null) => {
        if (k != null) onChange(String(k));
      }}
      isDisabled={isDisabled}
      {...(error ? {isInvalid: true, validationBehavior: 'aria' as const} : {})}
    >
      <div ref={fieldRef} className={side ? 'rp-cluster' : 'rp-field'}>
        <Label className={side ? 'rp-label' : 'lbl'}>{label}</Label>
        {action ? (
          <Toolbar>
            {trigger}
            {/* Buttons of their own, not more triggers of this select. */}
            <ButtonContext.Provider value={null}>{action}</ButtonContext.Provider>
          </Toolbar>
        ) : (
          trigger
        )}
      </div>
      {description && (
        <Text slot="description" className="rp-label">
          {description}
        </Text>
      )}
      {error && (
        <FieldError className="rp-field-error">
          <AlertTriangle />
          {error}
        </FieldError>
      )}
      {/* Include the label in the anchor so a flipped list clears both label and trigger. */}
      <Popover className="rp-popover rp-search-popover" placement="bottom start" triggerRef={side ? buttonRef : fieldRef} boundaryElement={boundary}>
        <SearchList label={searchLabel}>
          <ListBox className="rp-menu-scroll rp-overlay-scroll">
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
