import {useCallback, useId, useLayoutEffect, useRef, type ComponentProps, type ReactNode} from 'react';
import {
  Button as RButton,
  ToggleButton,
  ToggleButtonGroup,
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
import {useOverflow, useSlider} from './hooks';
import {LabeledSelect} from './Select';

// S2 does not scroll a segmented control: one too wide for its space collapses into a picker, as S2 Tabs do. The hidden
// track keeps its box, so the switch moves nothing, and is measured to tell when the items fit again.
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
  const collapsed = useOverflow(ref, items.flat().join('\n'));
  // Focus inside the control follows it across the switch, so it is neither hidden nor dropped to the page; focus
  // elsewhere stays. The picker's ref detaches before the picker leaves the page, while it can still hold focus.
  const pick = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const pickRef = useCallback((node: HTMLDivElement) => {
    pick.current = node;
    return () => {
      refocus.current = node.contains(document.activeElement);
      pick.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (collapsed && ref.current?.contains(document.activeElement)) pick.current?.querySelector('button')?.focus();
    if (!collapsed && refocus.current) ref.current?.querySelector<HTMLElement>('[data-selected]')?.focus();
    refocus.current = false;
  }, [ref, collapsed]);
  return (
    <div className="rp-segfit" data-collapsed={collapsed || undefined}>
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
        {pos && <span className="rp-slider" data-still={pos.still || undefined} style={{left: pos.x, width: pos.w}} />}
        {items.map(([k, l]) => (
          <ToggleButton key={k} id={k} className="rp-btn">
            {l}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {collapsed && (
        <div ref={pickRef} className="rp-segpick">
          <LabeledSelect bare label={label} value={value} onChange={onChange} isDisabled={isDisabled} items={items.map(([id, l]) => ({id, label: l}))} />
        </div>
      )}
    </div>
  );
}

// A switch in a labelled settings row has no text of its own, so it takes its name from `aria-label`.
export function Switch({
  children,
  isSelected,
  onChange,
  isDisabled,
  'aria-label': label,
  'aria-describedby': describedBy
}: {
  children?: ReactNode;
  isSelected: boolean;
  onChange: (v: boolean) => void;
  isDisabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  return (
    <RSwitch className="rp-switch" isSelected={isSelected} onChange={onChange} isDisabled={isDisabled} aria-label={label} aria-describedby={describedBy}>
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
  reveal,
  prefix,
  suffix,
  autoComplete,
  spellCheck,
  ...props
}: Pick<
  ComponentProps<typeof RTextField>,
  'value' | 'onChange' | 'defaultValue' | 'name' | 'type' | 'isInvalid' | 'validationBehavior' | 'autoFocus' | 'isDisabled'
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
        <FieldError className="rp-field-error">
          <AlertTriangle />
          {error}
        </FieldError>
      )}
    </RTextField>
  );
}
