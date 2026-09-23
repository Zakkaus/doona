import {useEffect, useRef, useState, type ComponentPropsWithRef, type ReactNode, type RefObject} from 'react';
import {Button as RButton, Link as RLink, Tooltip, TooltipTrigger, OverlayArrow, Focusable, composeRenderProps} from 'react-aria-components';
import {cx} from './cx';
import {motionEase, motionMs} from './motion';

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
  form,
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
  // The id of a form this button submits from outside it, such as a dialog footer.
  form?: string;
  // `select` looks like a picker; `plain` has no base class, for a surface that draws itself (the brand, the search
  // field). `className` is added to the base, never in place of it.
  appearance?: 'select' | 'plain';
  className?: string;
}) {
  // The tip is positioned from the button's own box: its wrapper has none while the button is enabled.
  const ref = useRef<HTMLButtonElement>(null);
  // A pending button keeps its colour and stays focusable, so the wrapper must not add a second tab stop.
  const disabled = isDisabled && !isPending;
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
      duration: motionMs('--rp-duration-refresh', 600),
      iterations,
      easing: iterations === 1 ? motionEase('--rp-ease-out', 'cubic-bezier(0, 0, 0.4, 1)') : 'linear'
    });
  };
  useEffect(() => {
    if (isPending) turn(Infinity);
    else if (spin.current?.playState === 'running') {
      const elapsed = Number(spin.current.currentTime ?? 0);
      spin.current.effect?.updateTiming({iterations: Math.max(1, Math.ceil(elapsed / motionMs('--rp-duration-refresh', 600)))});
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
      className={cx(
        appearance === 'plain' ? undefined : appearance ? `rp-${appearance}` : 'rp-btn',
        className,
        quiet && 'quiet',
        small && 'sm',
        icon && 'icon',
        accent && 'accent',
        negative && 'negative'
      )}
      onPress={press}
      aria-label={label}
      isDisabled={disabled}
      isPending={isPending}
      type={type}
      form={form}
    >
      {isPending ? <span className="rp-spinner" aria-hidden="true" /> : null}
      {children}
    </RButton>
  );
  // A tip adds what the name cannot say (why the button is disabled), so it wins; the label stays the accessible name.
  const text = tip ?? label;
  if (!text) return btn;
  // Keep one wrapper shape so busy/disabled transitions do not remount the button and lose focus. The wrapper accepts
  // focus and pointer events only when the native button cannot.
  return (
    <TooltipTrigger delay={400}>
      <Focusable>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the wrapper is the disabled button's only focus stop */}
        <span className="rp-tipwrap" tabIndex={disabled ? 0 : -1} data-passive={disabled ? undefined : ''}>
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

// Every mounted TextTooltip measures in one pass per frame, after paint, through one shared observer: a table
// mounts hundreds of them, and one layout read each in its own layout effect held the first paint of a page.
const measures = new WeakMap<Element, () => void>();
const queue = new Set<() => void>();
let frame = 0;
function enqueue(measure: () => void) {
  queue.add(measure);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const batch = [...queue];
    queue.clear();
    for (const fn of batch) fn();
  });
}
const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => entries.forEach(entry => measures.get(entry.target)?.()));
// Keyboard focus on one of these opens the first nested tooltip, which cannot take focus itself; a row is left
// out, since it holds many cells and its name already carries their full text.
const REVEALS = 'button, a, [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"]';
const STOPS = REVEALS + ', [role="row"]';

export function TextTooltip({children, text, className}: {children: ReactNode; text?: string; className?: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  // Not a tab stop until measured: a focusable span inside a row would swallow the row's own press.
  const [nested, setNested] = useState(true);
  const active = overflow || !!text;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (text) {
      setNested(!!el.closest(STOPS));
      return;
    }
    const measure = () => {
      setOverflow(el.scrollWidth > el.clientWidth);
      // Nested tab stops swallow their ancestor's press; grid navigation still focuses cell text.
      setNested(!!el.closest(STOPS));
    };
    measures.set(el, measure);
    resized?.observe(el);
    return () => {
      resized?.unobserve(el);
      measures.delete(el);
      queue.delete(measure);
    };
    // The span remounts when the trigger wraps it, so the observer follows `active` too.
  }, [text, active]);
  useEffect(() => {
    const el = ref.current;
    const stop = active && nested ? el?.closest<HTMLElement>(REVEALS) : null;
    if (!el || !stop) return;
    const show = () => {
      if (stop.matches(':focus-visible') && stop.querySelector('[data-tip]') === el) setOpen(true);
    };
    const hide = () => setOpen(false);
    stop.addEventListener('focus', show);
    stop.addEventListener('blur', hide);
    return () => {
      stop.removeEventListener('focus', show);
      stop.removeEventListener('blur', hide);
      setOpen(false);
    };
  }, [active, nested]);
  // New content can overflow without resizing the box, so it is measured again; the observer stays attached.
  useEffect(() => {
    const measure = ref.current && measures.get(ref.current);
    if (measure) enqueue(measure);
  }, [children, text, active]);
  const span = (
    <span ref={ref} className={cx('rp-truncate', className)} tabIndex={active && !nested ? 0 : -1} data-tip={active ? '' : undefined}>
      {children}
    </span>
  );
  // A table mounts hundreds of these; the trigger and its focusable wrapper exist only once text overflows.
  if (!active) return span;
  return (
    <TooltipTrigger delay={400} isOpen={open} onOpenChange={setOpen}>
      <Focusable>{span}</Focusable>
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
