import {createContext, useContext, useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {Button as RButton, TooltipTrigger, Focusable} from 'react-aria-components';
import {VisuallyHidden} from 'react-aria';
import {cx} from './cx';
import {motionEase, motionMs} from './motion';
import {useControlSize, type ControlSize} from './controlSize';
import {Tip} from './Tooltip';

// Button and LinkButton treatments: secondary is outlined, accent / negative use colour, and the default is filled.
export type ButtonStyle = {size?: ControlSize; quiet?: boolean; secondary?: boolean; small?: boolean; icon?: boolean; accent?: boolean; negative?: boolean};

// S2 splits everyday actions (ActionButton) from a flow's primary actions (Button). The kit draws ActionButton geometry
// by default; accent and negative buttons, and every labelled button inside PrimaryActions (a dialog's footer), take
// Button's pill.
const PrimaryActionsContext = createContext(false);
export function PrimaryActions({children}: {children: ReactNode}) {
  return <PrimaryActionsContext value>{children}</PrimaryActionsContext>;
}

// The classes for a style. Exported for a react-aria button the kit cannot wrap, such as a grid row's drag slot.
export function buttonClass({quiet, secondary, small, icon, accent, negative}: Omit<ButtonStyle, 'size'>, base = 'rp-btn') {
  return cx(base, quiet && 'quiet', secondary && 'secondary', small && 'sm', icon && 'icon', accent && 'accent', negative && 'negative');
}

const ActionReason = createContext<{id: string; text: string} | undefined>(undefined);
export function useActionReason(disabled?: boolean) {
  const reason = useContext(ActionReason);
  return disabled ? reason : undefined;
}

// Reasons describe disabled controls without adding a line to their layout.
export function ActionHelp({reason, children}: {reason?: string | null; children: ReactNode}) {
  const id = useId();
  return (
    <ActionReason.Provider value={reason ? {id, text: reason} : undefined}>
      {children}
      {reason && <VisuallyHidden id={id}>{reason}</VisuallyHidden>}
    </ActionReason.Provider>
  );
}

export function Button({
  children,
  onPress,
  label,
  isDisabled,
  isPending,
  tip,
  type,
  form,
  appearance,
  className,
  isSelected,
  expanded,
  size,
  ...style
}: {
  children?: ReactNode;
  onPress?: () => void;
  label?: string;
  isDisabled?: boolean;
  isPending?: boolean;
  tip?: string;
  type?: 'button' | 'submit' | 'reset';
  // The id of a form this button submits from outside it, such as a dialog footer.
  form?: string;
  // `select` looks like a picker; `plain` has no base class, for a surface that draws itself (the brand, the search
  // field). `className` is added to the base, never in place of it.
  appearance?: 'select' | 'plain';
  className?: string;
  isSelected?: boolean;
  expanded?: boolean;
} & ButtonStyle) {
  // The tip is positioned from the button's own box: its wrapper has none while the button is enabled.
  const ref = useRef<HTMLButtonElement>(null);
  // A pending button keeps its colour and stays focusable, so the wrapper must not add a second tab stop.
  const disabled = isDisabled && !isPending;
  const reason = useActionReason(disabled);
  const [tipOpen, setTipOpen] = useState(false);
  const controlSize = useControlSize(size);
  const primary = useContext(PrimaryActionsContext) && !style.quiet && !style.icon;
  // A disabled button's tip is why it cannot run; it describes the button even while the tooltip is closed.
  const tipId = useId();
  const tipReason = disabled && !reason && !!tip;
  // An icon marked rp-spin-on-press (the refresh arrows) turns once per press and keeps turning while the button is
  // pending, always finishing a whole turn; one animation owns the rotation, so a long refetch never hands over.
  const spin = useRef<Animation | null>(null);
  const turn = (iterations: number) => {
    const icon = ref.current?.querySelector<SVGElement>('.rp-spin-on-press');
    if (!icon || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const current = spin.current;
    if (current && current.playState === 'running') {
      current.effect?.updateTiming({iterations});
      return;
    }
    spin.current = icon.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
      duration: motionMs('--rp-duration-refresh', 1000),
      iterations,
      easing: iterations === 1 ? motionEase('--rp-ease-out', 'cubic-bezier(0, 0, 0.4, 1)') : 'linear'
    });
  };
  useEffect(() => {
    if (isPending) turn(Infinity);
    else if (spin.current?.playState === 'running') {
      const elapsed = Number(spin.current.currentTime ?? 0);
      spin.current.effect?.updateTiming({iterations: Math.max(1, Math.ceil(elapsed / motionMs('--rp-duration-refresh', 1000)))});
    }
  }, [isPending]);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (reduced.matches) spin.current?.cancel();
    };
    reduced.addEventListener('change', stop);
    return () => {
      reduced.removeEventListener('change', stop);
      spin.current?.cancel();
    };
  }, []);
  const press = () => {
    turn(1);
    onPress?.();
  };
  const btn = (
    <RButton
      ref={ref}
      className={cx(buttonClass(style, appearance === 'plain' ? '' : appearance ? `rp-${appearance}` : 'rp-btn'), primary && 'primary', className)}
      data-size={controlSize}
      onPress={press}
      aria-label={label}
      data-toggle-selected={isSelected || undefined}
      aria-pressed={isSelected}
      aria-expanded={expanded}
      aria-describedby={reason?.id ?? (tipReason ? tipId : undefined)}
      isDisabled={disabled}
      isPending={isPending}
      type={type}
      form={form}
    >
      {isPending ? <span className="rp-spinner" aria-hidden="true" /> : null}
      {children}
    </RButton>
  );
  // A disabled reason takes precedence over the action label.
  const text = (disabled ? (tip ?? reason?.text) : tip) ?? label;
  if (!text) return btn;
  // Keep one wrapper shape so busy/disabled transitions do not remount the button and lose focus. The wrapper accepts
  // focus and pointer events only when the native button cannot.
  return (
    <TooltipTrigger delay={400} isOpen={tipOpen} onOpenChange={setTipOpen}>
      <Focusable>
        <span
          className="rp-tipwrap"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the wrapper is the disabled button's only focus stop
          tabIndex={disabled ? 0 : -1}
          data-passive={disabled ? undefined : ''}
          onPointerDown={event => {
            if (disabled && event.pointerType === 'touch') setTipOpen(open => !open);
          }}
        >
          {btn}
          {tipReason && <VisuallyHidden id={tipId}>{tip}</VisuallyHidden>}
        </span>
      </Focusable>
      <Tip triggerRef={ref}>{text}</Tip>
    </TooltipTrigger>
  );
}
