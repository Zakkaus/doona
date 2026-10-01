import {afterEach, expect, it, vi} from 'vitest';
import {revealFlowRow} from './tableFlow';

afterEach(() => vi.unstubAllGlobals());

it('reveals rows against the page viewport below the app and column headers', () => {
  const scrollBy = vi.fn();
  vi.stubGlobal('window', {innerHeight: 900, scrollBy});
  vi.stubGlobal('getComputedStyle', () => ({scrollPaddingTop: '101px'}));
  const box = {getBoundingClientRect: () => ({top: -1000}), scrollTop: 0} as HTMLElement;
  revealFlowRow(box, 1037, 1077);
  expect(scrollBy).toHaveBeenLastCalledWith(0, -64);
  revealFlowRow(box, 1997, 2037);
  expect(scrollBy).toHaveBeenLastCalledWith(0, 137);
  scrollBy.mockClear();
  revealFlowRow(box, 1200, 1240);
  expect(scrollBy).not.toHaveBeenCalled();
  expect(box.scrollTop).toBe(0);
});
