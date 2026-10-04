import {useId} from 'react';
import {Checkbox as RCheckbox} from 'react-aria-components';
import Checkmark from './icons/Checkmark';
import {useFormProps} from './Form';

// An option that is on or off, after S2's Checkbox: a 14px box beside its label, with an optional line of help under
// the label. The label alone names it; the help describes it.
export function Checkbox({
  label,
  description,
  isSelected,
  onChange,
  isDisabled
}: {
  label: string;
  description?: string;
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  isDisabled?: boolean;
}) {
  const labelId = useId();
  const descriptionId = useId();
  const form = useFormProps({isDisabled});
  return (
    <RCheckbox
      className="rp-radio rp-checkbox"
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={form.isDisabled}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <span className="rp-checkbox-mark">
        <Checkmark />
      </span>
      <span className="rp-radio-text">
        <span id={labelId}>{label}</span>
        {description && (
          <span id={descriptionId} className="rp-note">
            {description}
          </span>
        )}
      </span>
    </RCheckbox>
  );
}
