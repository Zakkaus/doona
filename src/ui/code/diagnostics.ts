import type {EditorState} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {EditorMark} from './CodeEditor';
export function toDiagnostics(state: EditorState, marks: EditorMark[]): Diagnostic[] {
  return marks
    .filter(mark => mark.line >= 1 && mark.line <= state.doc.lines)
    .map(mark => {
      const line = state.doc.line(mark.line);
      const column = Math.max(0, (mark.column ?? 1) - 1);
      let offset = 0;
      for (let byte = 0; offset < line.text.length && byte < column;) {
        const code = line.text.codePointAt(offset)!;
        const width = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
        if (byte + width > column) break;
        byte += width;
        offset += code > 0xffff ? 2 : 1;
      }
      const from = line.from + offset;
      return {from, to: line.to, severity: mark.level, message: mark.message};
    });
}
