import {createContext, useContext, type ReactNode} from 'react';
import {Form as RForm, type FormProps as RFormProps} from 'react-aria-components';
import {useT} from '../i18n';

// What a form hands down to the kit fields inside it, as S2's Form does: a field's own prop wins, and a dialog starts
// afresh. React Aria's form passes `validationBehavior` to the fields itself.
export type FormFieldProps = {isDisabled?: boolean; isRequired?: boolean; necessityIndicator?: 'icon' | 'label'};
export const FormContext = createContext<FormFieldProps | null>(null);

export function useFormProps<T extends FormFieldProps>(props: T): T {
  const form = useContext(FormContext);
  if (!form) return props;
  return {
    ...props,
    isDisabled: props.isDisabled ?? form.isDisabled,
    isRequired: props.isRequired ?? form.isRequired,
    necessityIndicator: props.necessityIndicator ?? form.necessityIndicator
  };
}

// Labels stay above their fields. The caller still prevents the default submit and saves in `onSubmit`.
export function Form({
  isDisabled,
  isRequired,
  necessityIndicator,
  children,
  ...props
}: FormFieldProps &
  Pick<RFormProps, 'id' | 'onSubmit' | 'validationBehavior' | 'aria-label'> & {
    className?: string;
    children: ReactNode;
  }) {
  return (
    <RForm {...props}>
      <FormContext value={{isDisabled, isRequired, necessityIndicator}}>{children}</FormContext>
    </RForm>
  );
}

// The mark after a field's label: an asterisk on a required field, or with `label` the words for either state, as S2.
export function Necessity({isRequired, necessityIndicator = 'icon'}: Pick<FormFieldProps, 'isRequired' | 'necessityIndicator'>) {
  const t = useT();
  if (necessityIndicator === 'label') return <span>{t(isRequired ? 'ui.required' : 'ui.optional')}</span>;
  return isRequired ? <span aria-hidden="true"> *</span> : null;
}
