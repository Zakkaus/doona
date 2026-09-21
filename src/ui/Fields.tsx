import {useId, type ComponentProps, type ReactNode} from 'react';
import {
  Button as RButton,
  ToggleButton,
  ToggleButtonGroup,
  Switch as RSwitch,
  TextField as RTextField,
  SearchField as RSearchField,
  Text,
  Label,
  Input as RInput
} from 'react-aria-components';
import Close from './icons/Close';
import Checkmark from './icons/Checkmark';
import Search from './icons/Search';
import {useT} from '../i18n';
import {cx} from './cx';
import {useSlider} from './hooks';

export function Segmented({
  items,
  value,
  onChange,
  label,
  isDisabled
}: {
  items: Array<[string, string]>;
  value: string;
  onChange: (k: string) => void;
  label: string;
  isDisabled?: boolean;
}) {
  const [ref, pos] = useSlider(value);
  return (
    <ToggleButtonGroup
      ref={ref}
      className="rp-seg"
      aria-label={label}
      isDisabled={isDisabled}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={k => {
        const v = [...k][0];
        if (v != null) onChange(String(v));
      }}
    >
      {pos && <span className="rp-slider" style={{left: pos.x, width: pos.w}} />}
      {items.map(([k, l]) => (
        <ToggleButton key={k} id={k} className="rp-btn">
          {l}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

// S2 marks the selected item with a checkmark in a leading column, not with a background.
export const Check = () => <Checkmark className="rp-check-mark" />;

export function Switch({
  children,
  isSelected,
  onChange,
  isDisabled
}: {
  children: ReactNode;
  isSelected: boolean;
  onChange: (v: boolean) => void;
  isDisabled?: boolean;
}) {
  return (
    <RSwitch className="rp-switch" isSelected={isSelected} onChange={onChange} isDisabled={isDisabled}>
      <span className="track" />
      {children}
    </RSwitch>
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
  autoComplete,
  spellCheck,
  ...props
}: Pick<ComponentProps<typeof RTextField>, 'value' | 'onChange' | 'defaultValue' | 'name' | 'type' | 'isInvalid' | 'validationBehavior' | 'autoFocus'> &
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
  }) {
  const t = useT();
  const errorId = useId();
  // An error text marks the field invalid for assistive technology too, unless the caller says otherwise.
  const validity = error ? {isInvalid: true, validationBehavior: 'aria' as const} : {};
  if (search) {
    return (
      <RSearchField {...props} aria-label={label} className={cx('rp-input', large && 'lg', className)} style={width ? {width} : undefined}>
        <Search />
        <RInput placeholder={placeholder ?? label} autoComplete={autoComplete} spellCheck={spellCheck} />
        <RButton className="clear" aria-label={t('clear')}>
          <Close />
        </RButton>
      </RSearchField>
    );
  }
  const input = (
    <span className={cx('rp-input', (side || !!action) && 'rp-grow')}>
      <RInput placeholder={placeholder} autoComplete={autoComplete} spellCheck={spellCheck} aria-describedby={error ? errorId : undefined} />
    </span>
  );
  return (
    <RTextField {...validity} {...props} className={cx(side ? 'rp-cluster' : 'rp-field', className)} style={width ? {width} : undefined}>
      <Label className="rp-label">{label}</Label>
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
        <span id={errorId} role="alert">
          {error}
        </span>
      )}
    </RTextField>
  );
}
