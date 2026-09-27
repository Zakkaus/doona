import {expect, it} from 'vitest';
import {isEditKey} from './readOnlyAttempt';

const key = (name: string, modifiers: {ctrlKey?: boolean; metaKey?: boolean} = {}) => isEditKey({key: name, ctrlKey: false, metaKey: false, ...modifiers});

it('counts keys that type or delete text as edits', () => {
  for (const name of ['a', 'Z', '1', ' ', '{', 'é', '𐐀', 'Backspace', 'Delete', 'Enter']) expect(key(name)).toBe(true);
});

it('leaves navigation keys and shortcuts alone', () => {
  for (const name of ['ArrowLeft', 'PageDown', 'Home', 'Tab', 'Escape', 'Shift', 'F3', 'Unidentified']) expect(key(name)).toBe(false);
  expect(key('c', {ctrlKey: true})).toBe(false);
  expect(key('f', {metaKey: true})).toBe(false);
});
