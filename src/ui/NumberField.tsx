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
    // A whole-number step takes no decimal separator, so a count or a port cannot be typed as 123.5.
    formatOptions = {useGrouping: false, ...(Number.isInteger(fieldProps.step) && {maximumFractionDigits: 0})},
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
        <NumberInput placeholder={placeholder} />
        <Typed value={props.value} onChange={props.onChange} range={props} />
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
// loses focus; leaving the field still snaps the value into range. A partial entry such as a lone minus waits, and so
// does a number outside the range or off the step: React Aria snaps a controlled value at once, so passing 1 on the way
// to 128 in a field from 64 would replace the typing with 64.
function Typed({value, onChange, range}: Pick<NumberFieldProps, 'value' | 'onChange'> & {range: NumberRange}) {
  const state = useContext(NumberFieldStateContext);
  const typed = state?.numberValue;
  const partial = !!state?.inputValue && Number.isNaN(typed);
  // Each entry is passed on once, so a draft that cannot hold it does not loop.
  const sent = useRef(typed);
  const held = typed !== undefined && !Number.isNaN(typed) && !keepsAsTyped(typed, range);
  useEffect(() => {
    if (typed === undefined || partial || held || Object.is(typed, sent.current)) return;
    sent.current = typed;
    if (!Object.is(typed, value)) onChange?.(typed);
  }, [typed, partial, held, value, onChange]);
  return null;
}

// React Aria commits a paste over the whole text without the check typing goes through, so 123.5 pasted into a
// whole-number field would round to 124. The same check refuses it first and the field keeps its text.
function NumberInput({placeholder}: {placeholder?: string}) {
  const state = useContext(NumberFieldStateContext);
  return (
    <Input
      placeholder={placeholder}
      onPasteCapture={event => {
        if (!state || !refusesPaste(event.currentTarget, event.clipboardData.getData('text/plain'), state.validate)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}

// Whether a paste that replaces the whole text is text the field would not accept typed. A paste into part of the
// text goes through the typing check, which React Aria runs on the result.
export function refusesPaste(
  {value, selectionStart, selectionEnd}: Pick<HTMLInputElement, 'value' | 'selectionStart' | 'selectionEnd'>,
  text: string,
  validate: (text: string) => boolean
) {
  return (selectionEnd ?? 0) - (selectionStart ?? 0) === value.length && !validate(text.trim());
}

type NumberRange = Pick<NumberFieldProps, 'minValue' | 'maxValue' | 'step'>;

// Whether React Aria keeps a typed number as it is: inside the range and on a step counted from the minimum.
export function keepsAsTyped(value: number, {minValue, maxValue, step}: NumberRange) {
  if (minValue !== undefined && value < minValue) return false;
  if (maxValue !== undefined && value > maxValue) return false;
  if (!step) return true;
  const steps = (value - (minValue ?? 0)) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

// A draft that keeps a number as text, read for the field: anything else shows as an empty field.
export const numberFromText = (text: string) => (/^-?\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : NaN);
// The text a draft keeps for the field's number; an empty field is ''.
export const textFromNumber = (value: number) => (Number.isNaN(value) ? '' : String(value));
