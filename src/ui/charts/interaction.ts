import {useState, type KeyboardEvent, type PointerEvent} from 'react';

export function pointerPosition(event: PointerEvent, target: Element, viewport?: {width: number; height: number}) {
  const box = target.getBoundingClientRect();
  // SVG charts preserve the previous integer mouse coordinates; HTML tips and touch retain precision.
  const clientX = viewport && event.pointerType === 'mouse' ? Math.floor(event.clientX) : event.clientX;
  const clientY = viewport && event.pointerType === 'mouse' ? Math.floor(event.clientY) : event.clientY;
  const x = clientX - box.left;
  const y = clientY - box.top;
  return viewport
    ? {x: Math.round((x * viewport.width) / box.width), y: Math.round((y * viewport.height) / box.height), width: viewport.width}
    : {x, y, width: box.width};
}

export function useSelection(count: number, select: (index: number, y?: number) => void, hide: () => void) {
  const [keyboardIndex, setKeyboardIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(false);
  return {
    onFocus: () => {
      setFocused(true);
      if (keyboardIndex === null && count) {
        setKeyboardIndex(0);
        setActive(true);
        select(0);
      }
    },
    onBlur: () => {
      setFocused(false);
      setActive(false);
      hide();
    },
    onPointerLeave: () => {
      if (!focused) hide();
    },
    onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => {
      if (!['ArrowRight', 'ArrowLeft', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Enter') {
        if (keyboardIndex === null) return;
        if (active) hide();
        else select(keyboardIndex);
        setActive(!active);
        return;
      }
      const next = keyboardIndex === null ? (event.key === 'ArrowRight' ? 0 : count - 1) : keyboardIndex + (event.key === 'ArrowRight' ? 1 : -1);
      if (next < 0 || next >= count) return;
      setKeyboardIndex(next);
      setActive(true);
      select(next);
    }
  };
}
