import {afterEach, expect, it, vi} from 'vitest';
import {copyText} from './copy';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('gives focus back after copying through a text area', async () => {
  class Element {
    isConnected = true;
    focus = vi.fn();
  }
  const button = new Element();
  const area = {value: '', style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn()};
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('window', {isSecureContext: false});
  vi.stubGlobal('document', {
    activeElement: button,
    body: {append: vi.fn()},
    createElement: () => area,
    execCommand: () => true
  });
  expect(await copyText('node-01')).toBe(true);
  expect(area.remove).toHaveBeenCalled();
  expect(button.focus).toHaveBeenCalledWith({preventScroll: true});
});
