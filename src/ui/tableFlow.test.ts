import {afterEach, expect, it, vi} from 'vitest';
import {revealFlowRow, scrollsOwnBox} from './tableFlow';

afterEach(() => vi.unstubAllGlobals());

it('reveals rows against the page viewport below the app and column headers', () => {
  const scrollBy = vi.fn();
  vi.stubGlobal('window', {innerHeight: 900, scrollBy});
  vi.stubGlobal('getComputedStyle', () => ({scrollPaddingTop: '101px', getPropertyValue: () => ''}));
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

it('uses the detail top as the visible bottom bound without double-counting the inset', () => {
  const scrollBy = vi.fn();
  vi.stubGlobal('window', {innerHeight: 844, scrollBy});
  vi.stubGlobal('getComputedStyle', () => ({scrollPaddingTop: '101px', scrollPaddingBottom: '80px', getPropertyValue: () => '246px'}));
  const box = {getBoundingClientRect: () => ({top: -1000})} as HTMLElement;
  revealFlowRow(box, 1560, 1600);
  expect(scrollBy).toHaveBeenLastCalledWith(0, 2);
  scrollBy.mockClear();
  revealFlowRow(box, 1558, 1598);
  expect(scrollBy).not.toHaveBeenCalled();
});

it('finds a box between the target and the page that scrolls vertically on its own', () => {
  const body = {} as Element;
  const box = (overflowY: string, scrollTop: number, parentElement: Element) =>
    ({overflowY, scrollTop, scrollHeight: 600, clientHeight: 200, parentElement}) as unknown as Element;
  vi.stubGlobal('document', {body});
  vi.stubGlobal('getComputedStyle', (node: {overflowY?: string}) => ({overflowY: node.overflowY ?? 'visible'}));
  const panel = box('auto', 0, {parentElement: body} as Element);
  const cell = {parentElement: panel, scrollHeight: 0, clientHeight: 0} as unknown as Element;
  expect(scrollsOwnBox(cell)).toBe(true);
  expect(scrollsOwnBox(cell, 120)).toBe(true);
  // At its top, an upward wheel passes through to the page.
  expect(scrollsOwnBox(cell, -120)).toBe(false);
  expect(scrollsOwnBox(box('auto', 400, body), 120)).toBe(false);
  expect(scrollsOwnBox(box('auto', 400, body), -120)).toBe(true);
  // A sideways scrollport or a box with nothing to scroll leaves vertical movement to the page.
  expect(scrollsOwnBox(box('hidden', 200, body))).toBe(false);
  expect(scrollsOwnBox({...box('auto', 0, body), scrollHeight: 200} as Element)).toBe(false);
  expect(scrollsOwnBox(body)).toBe(false);
  expect(scrollsOwnBox(null)).toBe(false);
});
