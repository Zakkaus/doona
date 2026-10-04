import {afterEach, describe, expect, it, vi} from 'vitest';
import {holdColumn} from './PageSkeleton';

describe('holdColumn', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a later hold when an earlier one lets go', () => {
    let frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    const runFrame = () => {
      const due = frames;
      frames = [];
      for (const callback of due) callback(0);
    };
    const style = {minHeight: '', removeProperty: (name: string) => name === 'min-height' && (style.minHeight = '')};
    const column = {style} as unknown as HTMLElement;

    holdColumn(column, 900);
    runFrame();
    holdColumn(column, 1200);
    runFrame();
    expect(style.minHeight).toBe('1200px');
    runFrame();
    expect(style.minHeight).toBe('');
  });
});
