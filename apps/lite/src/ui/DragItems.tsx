import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Text} from '@astryxdesign/core/Text';
import {RowTooltip as Tooltip} from './RowTooltip';
import * as stylex from '@stylexjs/stylex';
import {useRef, useState, type DragEvent} from 'react';
import {DragHandle} from './icons';
import {animateMove} from './motion/move';
const styles = stylex.create({
  target: {outline: 'var(--focus-outline-width) solid var(--color-accent)', outlineOffset: 'calc(-1 * var(--focus-outline-width))'},
  live: {position: 'absolute', width: 0, height: 0, padding: 0, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap'},
  handle: {cursor: 'grab', flexShrink: 0}
});
const mime = 'application/x-doona-lite-item';
// Native drag stays optional: every caller provides matching button/menu actions.
export function useDragItems(drop: (item: string, target: string) => void) {
  const dragged = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announcement, announce] = useState('');
  const finish = (message: string, focus: () => HTMLElement | null) => {
    announce('');
    requestAnimationFrame(() => {
      announce(message);
      const control = focus();
      control?.focus({preventScroll: true});
      animateMove(control);
    });
  };
  return {
    finish,
    live: (
      <Text as="span" role="status" aria-live="polite" aria-atomic="true" xstyle={styles.live}>
        {announcement}
      </Text>
    ),
    handle: (id: string, label: string, disabled: boolean) => (
      <Tooltip content={label}>
        <IconButton
          label={label}
          icon={<Icon icon={DragHandle} size="sm" />}
          size="sm"
          variant="ghost"
          xstyle={styles.handle}
          isDisabled={disabled}
          draggable={!disabled}
          data-drag-handle={id}
          onDragStart={(event: DragEvent<HTMLElement>) => {
            dragged.current = id;
            event.dataTransfer.setData(mime, id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            dragged.current = null;
            setOver(null);
          }}
        />
      </Tooltip>
    ),
    target: (id: string, disabled = false) => ({
      'data-drop-target': id,
      xstyle: over === id ? styles.target : undefined,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!disabled && dragged.current !== null) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setOver(id);
        }
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (disabled || dragged.current === null) return;
        event.preventDefault();
        const item = event.dataTransfer.getData(mime);
        if (item === dragged.current) drop(item, id);
        dragged.current = null;
        setOver(null);
      }
    })
  };
}
