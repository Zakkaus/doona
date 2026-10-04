import {useContext, useEffect, useRef} from 'react';
import {
  Button as RButton,
  FieldError,
  Group,
  Input,
  Label,
  NumberField as RNumberField,
  NumberFieldStateContext,
  Text,
  type NumberFieldProps
} from 'react-aria-components';
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
    'value' | 'onChange' | 'minValue' | 'maxValue' | 'step' | 'formatOptions' | 'name' | 'isDisabled' | 'isRequired' | 'isInvalid' | 'aria-describedby'
  > &
    Pick<FormFieldProps, 'necessityIndicator'> & {
      label: string;
      placeholder?: string;
      description?: string;
      error?: string;
      hideStepper?: boolean;
      size?: ControlSize;
      width?: number;
    }
) {
  const {
    label,
    placeholder,
    description,
    error,
    hideStepper,
    size,
    width,
    necessityIndicator,
    formatOptions = {useGrouping: false},
    ...props
  } = useFormProps(fieldProps);
  const t = useT();
  const controlSize = useControlSize(size);
  // An error text marks the field invalid for assistive technology too, as TextField does.
  const validity = error || props.isInvalid ? {isInvalid: true, validationBehavior: 'aria' as const} : {};
  return (
    <RNumberField {...props} {...validity} formatOptions={formatOptions} className="rp-field" style={width ? {width} : undefined}>
      <Label className="rp-label">
        {label}
        <Necessity isRequired={props.isRequired} necessityIndicator={necessityIndicator} />
      </Label>
      <Group className={cx('rp-input', !hideStepper && 'stepped')} data-size={controlSize}>
        <Input placeholder={placeholder} />
        <Typed value={props.value} onChange={props.onChange} />
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

// The draft follows the typing, as a TextField's does, so an action that waits for a change is ready before the field
// loses focus; leaving the field still snaps the value into range. A partial entry such as a lone minus waits.
function Typed({value, onChange}: Pick<NumberFieldProps, 'value' | 'onChange'>) {
  const state = useContext(NumberFieldStateContext);
  const typed = state?.numberValue;
  const partial = !!state?.inputValue && Number.isNaN(typed);
  // Each entry is passed on once, so a draft that cannot hold it does not loop.
  const sent = useRef(typed);
  useEffect(() => {
    if (typed === undefined || partial || Object.is(typed, sent.current)) return;
    sent.current = typed;
    if (!Object.is(typed, value)) onChange?.(typed);
  }, [typed, partial, value, onChange]);
  return null;
}

// A draft that keeps a number as text, read for the field: anything else shows as an empty field.
export const numberFromText = (text: string) => (/^-?\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : NaN);
// The text a draft keeps for the field's number; an empty field is ''.
export const textFromNumber = (value: number) => (Number.isNaN(value) ? '' : String(value));
