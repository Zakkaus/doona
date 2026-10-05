import {useId} from 'react';
import {Header, ListBox, ListBoxItem, ListBoxSection, Text} from 'react-aria-components';
import Checkmark from './icons/Checkmark';
import {Swatch, type SwatchProps} from './Swatch';
import './styles/select-box.css';

type SwatchChoice = SwatchProps & {id: string; label: string; desc?: string};
// `plain` marks a section whose title only gathers its choices, so their names do not start with it.
export type SwatchSection = {title: string; plain?: boolean; items: SwatchChoice[]};
type PickerProps = {label: string; sections: SwatchSection[]; value: string; onChange: (id: string) => void; help?: string};

// One choice from boxes that each show it, after S2's SelectBoxGroup, on React Aria's grid ListBox: arrow keys move
// through the boxes in two dimensions, Enter, Space or a click picks the focused one, and Tab leaves the group. A
// section is headed by its title unless its one choice already carries it, and a choice's name starts with that
// title unless its label holds it. `help` shows under the boxes, as a field's help does.
export function SelectBoxGroup({label, sections, value, onChange, help}: PickerProps) {
  const id = useId();
  return (
    <div className="rp-select-boxes">
      <span id={`${id}-label`} className="rp-label">
        {label}
      </span>
      <ListBox
        className="rp-select-grid"
        layout="grid"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[value]}
        onSelectionChange={keys => keys !== 'all' && onChange(String([...keys][0]))}
        aria-labelledby={`${id}-label`}
        aria-describedby={help ? `${id}-help` : undefined}
      >
        {sections.map(({title, plain, items}) => {
          const headed = items.length > 1 || items[0]!.label !== title;
          return (
            <ListBoxSection key={title} aria-label={headed ? undefined : title}>
              {headed && <Header className="rp-select-box-head">{title}</Header>}
              {items.map(item => (
                <ListBoxItem
                  key={item.id}
                  id={item.id}
                  className="rp-select-box"
                  textValue={item.label}
                  aria-label={headed && !plain && !item.label.includes(title) ? `${title} ${item.label}` : item.label}
                >
                  <Swatch swatch={item.swatch} look={item.look} />
                  <span>{item.label}</span>
                  {item.desc && (
                    <Text slot="description" className="rp-label rp-truncate">
                      {item.desc}
                    </Text>
                  )}
                  <Checkmark className="rp-select-box-check" />
                </ListBoxItem>
              ))}
            </ListBoxSection>
          );
        })}
      </ListBox>
      {help && (
        <span id={`${id}-help`} className="rp-label">
          {help}
        </span>
      )}
    </div>
  );
}
