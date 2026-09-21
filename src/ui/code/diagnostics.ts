import type {EditorState} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {EditorMark} from './CodeEditor';
export function toDiagnostics(state: EditorState, marks: EditorMark[]): Diagnostic[] {
  return marks
    .filter(mark => mark.line >= 1 && mark.line <= state.doc.lines)
    .map(mark => {
      const line = state.doc.line(mark.line);
      const column = Math.max(0, (mark.column ?? 1) - 1);
      const bytes = new TextEncoder().encode(line.text);
      let offset = 0;
      for (let byte = 0; byte < Math.min(column, bytes.length);) {
        const width = bytes[byte] < 0x80 ? 1 : bytes[byte] < 0xe0 ? 2 : bytes[byte] < 0xf0 ? 3 : 4;
        if (byte + width > column) break;
        byte += width;
        offset += width === 4 ? 2 : 1;
      }
      const from = line.from + offset;
      return {from, to: line.to, severity: mark.level, message: mark.message};
    });
}
