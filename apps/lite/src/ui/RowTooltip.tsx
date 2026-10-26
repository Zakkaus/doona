import {Tooltip} from '@astryxdesign/core/Tooltip';
import {VStack} from '@astryxdesign/core/Stack';
import {useEffect, useRef, useState, type ReactNode} from 'react';

export function RowTooltip({children, content}: {children: ReactNode; content: ReactNode}) {
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef(0);
  const touch = useRef(false);
  const [active, setActive] = useState(false);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      setActive(false);
    },
    []
  );
  return (
    <VStack
      style={{display: 'contents'}}
      onPointerDown={event => {
        touch.current = event.pointerType === 'touch';
        clearTimeout(timer.current);
        setActive(false);
      }}
      onPointerEnter={event => {
        if (event.pointerType === 'touch') return;
        anchor.current = event.currentTarget.firstElementChild as HTMLElement;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setActive(true), 200);
      }}
      onPointerLeave={() => clearTimeout(timer.current)}
      onFocus={event => {
        if (touch.current || !event.target.matches(':focus-visible')) return;
        anchor.current = event.target as HTMLElement;
        clearTimeout(timer.current);
        setActive(true);
      }}
    >
      {children}
      {active && (
        <Tooltip
          anchorRef={anchor}
          content={content}
          isDefaultOpen
          onOpenChange={open => {
            if (!open) setActive(false);
          }}
        />
      )}
    </VStack>
  );
}
