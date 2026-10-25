import type {ComponentProps} from 'react';
import {TextField, TextArea as RTextArea, Label, Text, FieldError} from 'react-aria-components';
import {Necessity, useFormProps, type FormFieldProps} from './Form';
import AlertTriangle from './icons/AlertTriangle';
import './styles/textarea.css';

type Props = Pick<ComponentProps<typeof TextField>, 'value' | 'onChange' | 'isDisabled' | 'isRequired' | 'name' | 'autoFocus'> &
  Pick<FormFieldProps, 'necessityIndicator'> & {label: string; description?: string; error?: string; placeholder?: string};
export function TextArea(fieldProps: Props) {
  const {label, description, error, placeholder, necessityIndicator, ...props} = useFormProps(fieldProps);
  return (
    <TextField {...props} className="rp-field" isInvalid={!!error} validationBehavior="aria">
      <Label className="rp-label">
        {label}
        <Necessity isRequired={props.isRequired} necessityIndicator={necessityIndicator} />
      </Label>
      <RTextArea className="rp-input rp-textarea" rows={3} placeholder={placeholder} />
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
    </TextField>
  );
}
