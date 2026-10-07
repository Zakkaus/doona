import {useId, type ReactNode} from 'react';
import {RadioGroup as RRadioGroup, Radio as RRadio, Label, Text} from 'react-aria-components';
import {ContextualHelp, type Help} from './ContextualHelp';

// One choice from a vertical list, after S2's RadioGroup: a label (or the id of a heading that names the group), the
// radios, then help text for the whole group. Arrow keys move the selection and Tab leaves the group. `value` null
// selects nothing. Other content may sit between the radios, such as a Disclosure holding more of them.
export function RadioGroup({
  label,
  'aria-labelledby': labelledBy,
  description,
  value,
  onChange,
  isDisabled,
  children
}: {
  label?: string;
  'aria-labelledby'?: string;
  description?: string;
  value: string | null;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <RRadioGroup className="rp-radios" value={value} onChange={onChange} isDisabled={isDisabled} aria-labelledby={labelledBy}>
      {label && <Label className="rp-label">{label}</Label>}
      {children}
      {description && (
        <Text slot="description" className="rp-label">
          {description}
        </Text>
      )}
    </RRadioGroup>
  );
}

// A radio with its label and an optional line of help under it. The label alone names it; the help describes it.
export function Radio({value, label, description, help, isDisabled}: {value: string; label: string; description?: string; help?: Help; isDisabled?: boolean}) {
  const labelId = useId();
  const descriptionId = useId();
  const radio = (
    <RRadio className="rp-radio" value={value} isDisabled={isDisabled} aria-labelledby={labelId} aria-describedby={description ? descriptionId : undefined}>
      <span className="rp-radio-mark" />
      <span className="rp-radio-text">
        <span id={labelId}>{label}</span>
        {description && (
          <span id={descriptionId} className="rp-label">
            {description}
          </span>
        )}
      </span>
    </RRadio>
  );
  return help ? (
    <span className="rp-radio-option">
      {radio}
      <ContextualHelp {...help} />
    </span>
  ) : (
    radio
  );
}
