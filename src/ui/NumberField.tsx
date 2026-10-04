import {Button as RButton, FieldError, Group, Input, Label, NumberField as RNumberField, Text, type NumberFieldProps} from 'react-aria-components';
import Add from './icons/Add';
import Dash from './icons/Dash';
import AlertTriangle from './icons/AlertTriangle';
import {useT} from '../i18n';
import {cx} from './cx';
import {useControlSize, type ControlSize} from './controlSize';
import {Necessity, useFormProps, type FormFieldProps} from './Form';

// A number with S2's stepper at the field's end, the same box as TextField. NaN is an empty field: the value is unset.
// Grouping is off by default, so a port reads 8080, not 8,080. The steppers take doona's own names: React Aria's
// zh-TW names are the zoom words.
export function NumberField(
  fieldProps: Pick<
    NumberFieldProps,
    'value' | 'onChange' | 'minValue' | 'maxValue' | 'step' | 'formatOptions' | 'name' | 'isDisabled' | 'isRequired' | 'aria-describedby'
  > &
    Pick<FormFieldProps, 'necessityIndicator'> & {
      label: string;
      placeholder?: string;
      description?: string;
      error?: string;
      hideStepper?: boolean;
      size?: ControlSize;
    }
) {
  const {
    label,
    placeholder,
    description,
    error,
    hideStepper,
    size,
    necessityIndicator,
    formatOptions = {useGrouping: false},
    ...props
  } = useFormProps(fieldProps);
  const t = useT();
  const controlSize = useControlSize(size);
  // An error text marks the field invalid for assistive technology too, as TextField does.
  const validity = error ? {isInvalid: true, validationBehavior: 'aria' as const} : {};
  return (
    <RNumberField {...validity} {...props} formatOptions={formatOptions} className="rp-field">
      <Label className="rp-label">
        {label}
        <Necessity isRequired={props.isRequired} necessityIndicator={necessityIndicator} />
      </Label>
      <Group className={cx('rp-input', !hideStepper && 'stepped')} data-size={controlSize}>
        <Input placeholder={placeholder} />
        {!hideStepper && (
          <span className="steppers">
            <RButton slot="decrement" className="step" aria-label={t('ui.decrease')}>
              <Dash />
            </RButton>
            <RButton slot="increment" className="step" aria-label={t('ui.increase')}>
              <Add />
            </RButton>
          </span>
        )}
      </Group>
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
    </RNumberField>
  );
}
