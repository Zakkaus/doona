import {EditorState} from '@codemirror/state';
import {expect, it} from 'vitest';
import {toDiagnostics} from './diagnostics';

it('maps one-based UTF-8 columns to UTF-16 positions on non-ASCII lines', () => {
  const prefix = '  café € 𐐀 ';
  const state = EditorState.create({doc: `routing {\n${prefix}invalid\n}`});
  const [diagnostic] = toDiagnostics(state, [{line: 2, column: new TextEncoder().encode(prefix).length + 1, level: 'error', message: 'Invalid target'}]);
  expect(diagnostic.from).toBe(state.doc.line(2).from + prefix.length);
  expect(state.sliceDoc(diagnostic.from, diagnostic.to)).toBe('invalid');
});

it('clamps diagnostic columns to the line and does not split a multibyte character', () => {
  const state = EditorState.create({doc: 'éx'});
  const marks = [0, 2, 3, 100].map(column => ({line: 1, column, level: 'error' as const, message: 'Invalid target'}));
  expect(toDiagnostics(state, marks).map(mark => mark.from)).toEqual([0, 0, 1, 2]);
});
