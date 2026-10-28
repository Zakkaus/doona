import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it, vi} from 'vitest';
import {SortableCanvas, reorderKeys} from './SortableCanvas';
import {useDragAndDrop} from './dragAndDrop';

vi.mock(import('./dragAndDrop'), {spy: true});

it('moves stable keys together and cancels a drop onto the dragged item', () => {
  const ids = ['a', 'b', 'c', 'd'];
  expect(reorderKeys(ids, new Set(['a', 'c']), 'd', 'after')).toEqual(['b', 'd', 'a', 'c']);
  expect(reorderKeys(ids, new Set(['a']), 'a', 'before')).toBe(ids);
});

it('keeps one pending press repair across repeated keyboard drags', () => {
  renderToStaticMarkup(
    createElement(SortableCanvas, {label: 'Canvas', items: [], textValue: () => '', dragLabel: () => '', onPlace: () => {}, children: () => null})
  );
  const end = vi.mocked(useDragAndDrop).mock.calls.at(-1)![0].onDragEnd!;
  const listeners = new Map<string, Set<EventListener>>();
  vi.stubGlobal('document', {
    addEventListener(type: string, listener: EventListener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    }
  });
  try {
    end({} as never);
    end({} as never);
    expect(listeners.get('pointerdown')?.size).toBe(1);
    expect(listeners.get('mousedown')?.size).toBe(1);
  } finally {
    for (const done of listeners.get('pointerdown') ?? []) done(new Event('pointerdown'));
    vi.unstubAllGlobals();
  }
});
