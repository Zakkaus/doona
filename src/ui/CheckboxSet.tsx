import {useId} from 'react';
import {Checkbox} from './Checkbox';

export type CheckboxChoice = {id: string; label: string; isDisabled?: boolean};
export function CheckboxSet({
  label,
  items,
  value,
  onChange,
  isDisabled
}: {
  label: string;
  items: CheckboxChoice[];
  value: string[];
  onChange: (value: string[]) => void;
  isDisabled?: boolean;
}) {
  const heading = useId();
  return (
    <div className="rp-checkbox-set" role="group" aria-labelledby={heading}>
      <span id={heading} className="rp-label">
        {label}
      </span>
      <div className="rp-checkbox-options">
        {items.map(item => (
          <Checkbox
            key={item.id}
            label={item.label}
            isSelected={value.includes(item.id)}
            isDisabled={isDisabled || item.isDisabled}
            onChange={selected => onChange(selected ? [...value, item.id] : value.filter(id => id !== item.id))}
          />
        ))}
      </div>
    </div>
  );
}
