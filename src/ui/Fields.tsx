import {useId, type ComponentProps, type ReactNode} from 'react';
import {
  Button as RButton,
  Switch as RSwitch,
  TextField as RTextField,
  SearchField as RSearchField,
  Text,
  Label,
  FieldError,
  Input as RInput
} from 'react-aria-components';
import Close from './icons/Close';
import Search from './icons/Search';
import AlertTriangle from './icons/AlertTriangle';
import Visibility from './icons/Visibility';
import VisibilityOff from './icons/VisibilityOff';
import {useT} from '../i18n';
import {cx} from './cx';

// A switch in a labelled settings row has no text of its own, so it takes its name from `aria-label`.
export function Switch({
  children,
  isSelected,
  onChange,
  isDisabled,
  'aria-label': label,
  'aria-describedby': describedBy,
  description
}: {
  children?: ReactNode;
  isSelected: boolean;
  onChange: (v: boolean) => void;
  isDisabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  description?: string;
}) {
  const id = useId();
  const control = (
    <RSwitch
      className="rp-switch"
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
      aria-label={label}
      aria-describedby={[describedBy, description && id].filter(Boolean).join(' ') || undefined}
    >
      <span className="track" />
      {children}
    </RSwitch>
  );
  return description ? (
    <div className="rp-field">
      {control}
      <span id={id} className="rp-label">
        {description}
      </span>
    </div>
  ) : (
    control
  );
}
export function TextField({
  label,
  width,
  search,
  large,
  side,
  className,
  placeholder,
  description,
  error,
  action,
  reveal,
  prefix,
  suffix,
  autoComplete,
  spellCheck,
  ...props
}: Pick<
  ComponentProps<typeof RTextField>,
  'value' | 'onChange' | 'defaultValue' | 'name' | 'type' | 'isInvalid' | 'validationBehavior' | 'autoFocus' | 'isDisabled' | 'isRequired'
> &
  Pick<ComponentProps<typeof RInput>, 'autoComplete' | 'spellCheck'> & {
    label: string;
    width?: number;
    search?: boolean;
    large?: boolean;
    side?: boolean;
    className?: string;
    placeholder?: string;
    description?: string;
    error?: string;
    action?: ReactNode;
    // A secret's show or hide toggle, inside the field as in S2; `label` names what pressing it does now.
    reveal?: {shown: boolean; label: string; onToggle: () => void};
    // Fixed text before and after the value, inside the field: the value is only the part between them.
    prefix?: string;
    suffix?: string;
  }) {
  const t = useT();
  const affixId = useId();
  // An error text marks the field invalid for assistive technology too, unless the caller says otherwise.
  const validity = error ? {isInvalid: true, validationBehavior: 'aria' as const} : {};
  // The box sits inside the field so an error can show under it; the structure stays the same with or without one,
  // so the input keeps focus while an error comes and goes.
  if (search) {
    return (
      <RSearchField {...validity} {...props} aria-label={label} className={cx('rp-search-field', className)} style={width ? {width} : undefined}>
        <span className={cx('rp-input', large && 'lg')}>
          <Search />
          <RInput placeholder={placeholder ?? label} autoComplete={autoComplete} spellCheck={spellCheck} />
          <RButton className="clear" aria-label={t('ui.clear')}>
            <Close />
          </RButton>
        </span>
        {error && (
          <FieldError className="rp-field-error">
            <AlertTriangle />
            {error}
          </FieldError>
        )}
      </RSearchField>
    );
  }
  const input = (
    <span className={cx('rp-input', (side || !!action) && 'rp-grow', (prefix || suffix) && 'affixed')}>
      {prefix && (
        <span className="affix" id={`${affixId}-prefix`}>
          {prefix}
        </span>
      )}
      <RInput placeholder={placeholder} autoComplete={autoComplete} spellCheck={spellCheck} />
      {suffix && (
        <span className="affix" id={`${affixId}-suffix`}>
          {suffix}
        </span>
      )}
      {reveal && (
        <RButton className="reveal" aria-label={reveal.label} onPress={reveal.onToggle}>
          {reveal.shown ? <VisibilityOff /> : <Visibility />}
        </RButton>
      )}
    </span>
  );
  return (
    <RTextField
      {...validity}
      {...props}
      // The fixed text is read with the field, so a screen reader hears the whole path, not only the value.
      aria-describedby={[prefix && `${affixId}-prefix`, suffix && `${affixId}-suffix`].filter(Boolean).join(' ') || undefined}
      className={cx(side ? 'rp-cluster' : 'rp-field', className)}
      style={width ? {width} : undefined}
    >
      <Label className="rp-label">
        {label}
        {props.isRequired && <span aria-hidden="true"> *</span>}
      </Label>
      {action ? (
        <div className="rp-toolbar">
          {input}
          {action}
        </div>
      ) : (
        input
      )}
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
    </RTextField>
  );
}
// A field with only one possible value shows it as text, as S2 does for a read-only field: a picker with a single
// choice offers nothing to pick, and its choice's help would stay hidden in the closed popover.
export function StaticField({label, value, description}: {label: string; value: string; description?: string}) {
  const id = useId();
  return (
    <div className="rp-field" role="group" aria-labelledby={`${id}-label`} aria-describedby={description && `${id}-help`}>
      <span className="lbl" id={`${id}-label`}>
        {label}
      </span>
      <span>{value}</span>
      {description && (
        <span className="rp-label" id={`${id}-help`}>
          {description}
        </span>
      )}
    </div>
  );
}
