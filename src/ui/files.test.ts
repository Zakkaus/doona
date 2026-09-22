import {expect, it} from 'vitest';
import {csvLine} from './files';

it('quotes record delimiters and escapes quotes without changing field contents', () => {
  expect(csvLine(['a\rb', 'c\nd', 'e\r\nf', 'g,"h', 1, null, undefined])).toBe('"a\rb","c\nd","e\r\nf","g,""h",1,,');
});
