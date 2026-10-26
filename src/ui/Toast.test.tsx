import {afterEach, expect, it, vi} from 'vitest';
import {UNSTABLE_ToastQueue as ToastQueue} from 'react-aria-components';
import {clearToasts, toast} from './Toast';

afterEach(() => {
  vi.restoreAllMocks();
  clearToasts();
});

it('shows a message again after clear all without closing the cleared one', () => {
  toast('info', 'Saved');
  clearToasts();
  const close = vi.spyOn(ToastQueue.prototype, 'close');
  toast('info', 'Saved');
  expect(close).not.toHaveBeenCalled();
});

it('still replaces a repeated message that was not cleared', () => {
  const first = toast('info', 'Saved');
  const close = vi.spyOn(ToastQueue.prototype, 'close');
  toast('info', 'Saved');
  expect(close).toHaveBeenCalledWith(first);
});
