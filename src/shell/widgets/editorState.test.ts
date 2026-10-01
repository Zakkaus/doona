import {expect, it} from 'vitest';
import {editorState} from './editorState';
it('retains the editor through a host subscription gap', () => {
  const unmount = editorState.subscribe(() => {});
  editorState.set(true);
  expect(editorState.snapshot()).toBe(true);
  unmount();
  const remount = editorState.subscribe(() => {});
  expect(editorState.snapshot()).toBe(true);
  editorState.set(false);
  remount();
});
