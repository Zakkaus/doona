import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useLayoutEffect, useRef, useState, type ComponentProps} from 'react';
import {MoreHorizontal} from './icons';
import {RowTooltip} from './RowTooltip';

export function RowMenu(props: ComponentProps<typeof MoreMenu>) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const focusOnOpen = useRef<'pointer' | 'first' | 'last'>('pointer');
  useLayoutEffect(() => {
    if (wasOpen.current && !open) button.current?.focus({preventScroll: true});
    wasOpen.current = open;
    if (!open) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const menu = document.getElementById(button.current?.getAttribute('aria-controls') ?? '');
        const items = [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])];
        const target = focusOnOpen.current === 'pointer' ? menu : focusOnOpen.current === 'last' ? items.at(-1) : items[0];
        (target ?? menu)?.focus({preventScroll: true});
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  if (open)
    return (
      <MoreMenu
        {...props}
        ref={button}
        isMenuOpen
        onOpenChange={value => {
          setOpen(value);
          props.onOpenChange?.(value);
        }}
      />
    );
  return (
    <RowTooltip content={props.label}>
      <IconButton
        ref={button}
        label={props.label ?? ''}
        icon={props.icon ?? <Icon icon={MoreHorizontal} size="sm" />}
        variant={props.variant ?? 'ghost'}
        size={props.size}
        isDisabled={props.isDisabled}
        xstyle={props.xstyle}
        className={props.className}
        style={props.style}
        aria-haspopup="menu"
        aria-expanded={false}
        data-testid={props['data-testid']}
        onClick={event => {
          focusOnOpen.current = event.detail ? 'pointer' : 'first';
          setOpen(true);
        }}
        onKeyDown={event => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            if (event.repeat) return;
            focusOnOpen.current = event.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(true);
          }
        }}
      />
    </RowTooltip>
  );
}
