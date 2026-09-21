import {useLayoutEffect, useRef, useState, type ComponentPropsWithRef, type ReactNode, type RefObject} from 'react';
import {Button as RButton, Link as RLink, Tooltip, TooltipTrigger, OverlayArrow, Focusable, composeRenderProps} from 'react-aria-components';
import {cx} from './cx';

// accent / negative are the coloured variants; every neutral button shares one look.
export function Button({
  children,
  onPress,
  quiet,
  small,
  icon,
  accent,
  negative,
  label,
  isDisabled,
  isPending,
  tip,
  type,
  appearance,
  className
}: {
  children?: ReactNode;
  onPress?: () => void;
  quiet?: boolean;
  small?: boolean;
  icon?: boolean;
  accent?: boolean;
  negative?: boolean;
  label?: string;
  isDisabled?: boolean;
  isPending?: boolean;
  tip?: string;
  type?: 'button' | 'submit' | 'reset';
  appearance?: 'select';
  className?: string;
}) {
  // The tip is positioned from the button's own box: its wrapper has none while the button is enabled.
  const ref = useRef<HTMLButtonElement>(null);
  const btn = (
    <RButton
      ref={ref}
      className={cx(
        className ?? (appearance ? `rp-${appearance}` : 'rp-btn'),
        quiet && 'quiet',
        small && 'sm',
        icon && 'icon',
        accent && 'accent',
        negative && 'negative'
      )}
      onPress={onPress}
      aria-label={label}
      isDisabled={isDisabled}
      isPending={isPending}
      type={type}
    >
      {isPending ? <span className="rp-spinner" aria-hidden="true" /> : null}
      {children}
    </RButton>
  );
  const text = label ?? tip;
  if (!text) return btn;
  // Keep one wrapper shape so busy/disabled transitions do not remount the button and lose focus. The wrapper accepts focus and pointer events only when the native button cannot.
  return (
    <TooltipTrigger delay={400}>
      <Focusable>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the wrapper is the disabled button's only focus stop */}
        <span className="rp-tipwrap" tabIndex={isDisabled ? 0 : -1} data-passive={isDisabled ? undefined : ''}>
          {btn}
        </span>
      </Focusable>
      <Tip triggerRef={ref}>{text}</Tip>
    </TooltipTrigger>
  );
}
function Tip({children, triggerRef}: {children: ReactNode; triggerRef?: RefObject<HTMLElement | null>}) {
  return (
    <Tooltip className="rp-tip" offset={6} triggerRef={triggerRef}>
      <OverlayArrow /> {children}
    </Tooltip>
  );
}

export function TextTooltip({children, text, className}: {children: ReactNode; text?: string; className?: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [nested, setNested] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (text) return;
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, text]);
  useLayoutEffect(() => {
    const el = ref.current;
    // Nested tab stops swallow their ancestor's press; grid navigation still focuses cell text.
    if (el)
      setNested(!!el.closest('button, a, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"], [role="row"]'));
  }, []);
  return (
    <TooltipTrigger delay={400} isDisabled={!overflow && !text}>
      <Focusable>
        <span ref={ref} className={cx('rp-truncate', className)} tabIndex={(overflow || text) && !nested ? 0 : -1}>
          {children}
        </span>
      </Focusable>
      <Tip>{text ?? children}</Tip>
    </TooltipTrigger>
  );
}

// Navigation with an address: a real link, so it can be opened in a tab or copied, in text or button dress.
export function Link({
  external,
  appearance,
  label,
  className,
  ...props
}: ComponentPropsWithRef<typeof RLink> & {
  external?: boolean;
  appearance?: 'button' | 'version' | 'link';
  label?: string;
}) {
  return (
    <RLink
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      aria-label={label}
      {...props}
      className={appearance ? composeRenderProps(className, value => cx(appearance === 'button' ? 'rp-btn' : `rp-${appearance}`, value)) : className}
    />
  );
}
