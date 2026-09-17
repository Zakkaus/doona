import {useEffect, useRef} from 'react';
import {EditorState, Compartment} from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  highlightSpecialChars
} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {bracketMatching, syntaxHighlighting, HighlightStyle} from '@codemirror/language';
import {lintGutter, setDiagnostics, type Diagnostic} from '@codemirror/lint';
import {highlightSelectionMatches, searchKeymap} from '@codemirror/search';
import {tags} from '@lezer/highlight';
import {dae} from './dae';
import {daeCompletion} from './daeComplete';
import {closeBrackets, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete';

export type EditorMark = {line: number; column?: number | null; level: 'error' | 'warning' | 'info'; message: string};

// Colours come from theme.css tokens, so the editor follows every palette and the dark scheme.
const theme = EditorView.theme({
  '&': {backgroundColor: 'var(--rp-base)', color: 'var(--rp-text)', border: '1px solid var(--rp-hl-high)', borderRadius: '8px', fontSize: '13px'},
  '&.cm-focused': {outline: 'none', borderColor: 'var(--rp-pine)', boxShadow: '0 0 0 1px var(--rp-pine)'},
  '.cm-scroller': {fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", lineHeight: '20px', maxHeight: '70vh'},
  '.cm-content': {padding: '8px 0', caretColor: 'var(--rp-text)'},
  '.cm-line': {padding: '0 12px'},
  '.cm-gutters': {backgroundColor: 'transparent', color: 'var(--rp-muted)', border: 'none'},
  '.cm-lineNumbers .cm-gutterElement': {padding: '0 8px 0 12px', minWidth: '40px'},
  '.cm-activeLine': {backgroundColor: 'color-mix(in srgb, var(--rp-hl-med) 60%, transparent)'},
  '.cm-activeLineGutter': {backgroundColor: 'transparent', color: 'var(--rp-text)'},
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {backgroundColor: 'var(--rp-hl-high)'},
  '.cm-cursor': {borderLeftColor: 'var(--rp-text)'},
  '.cm-matchingBracket': {backgroundColor: 'color-mix(in srgb, var(--rp-pine) 20%, transparent)', outline: 'none'},
  '.cm-selectionMatch': {backgroundColor: 'color-mix(in srgb, var(--rp-gold) 25%, transparent)'},
  '.cm-lint-marker-error': {content: 'none'},
  '.cm-diagnostic-error': {borderLeftColor: 'var(--rp-love)'},
  '.cm-diagnostic-warning': {borderLeftColor: 'var(--rp-gold)'},
  '.cm-tooltip': {backgroundColor: 'var(--rp-surface)', border: '1px solid var(--rp-hl-high)', borderRadius: '8px', color: 'var(--rp-text)'},
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {backgroundColor: 'var(--rp-selected)', color: 'var(--rp-text)'},
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"},
  '.cm-panels': {backgroundColor: 'var(--rp-surface)', color: 'var(--rp-text)'},
  '.cm-panels-bottom': {borderTop: '1px solid var(--rp-hl-med)'},
  '.cm-textfield': {border: '1px solid var(--rp-hl-high)', borderRadius: '6px', backgroundColor: 'var(--rp-base)', color: 'var(--rp-text)'},
  '.cm-button': {
    border: '1px solid var(--rp-hl-high)',
    borderRadius: '6px',
    backgroundImage: 'none',
    backgroundColor: 'var(--rp-overlay)',
    color: 'var(--rp-text)'
  }
});
const highlight = HighlightStyle.define([
  {tag: tags.comment, color: 'var(--rp-muted)'},
  {tag: tags.keyword, color: 'var(--rp-love)', fontWeight: '700'},
  {tag: tags.string, color: 'var(--rp-gold)'},
  {tag: tags.number, color: 'var(--rp-iris)'},
  {tag: tags.propertyName, color: 'var(--rp-pine)'},
  {tag: tags.variableName, color: 'var(--rp-text)'},
  {tag: tags.operator, color: 'var(--rp-subtle)'},
  {tag: tags.punctuation, color: 'var(--rp-subtle)'}
]);

function toDiagnostics(state: EditorState, marks: EditorMark[]): Diagnostic[] {
  return marks
    .filter(mark => mark.line >= 1 && mark.line <= state.doc.lines)
    .map(mark => {
      const line = state.doc.line(mark.line);
      const from = Math.min(line.to, line.from + Math.max(0, (mark.column ?? 1) - 1));
      return {from, to: line.to, severity: mark.level, message: mark.message};
    });
}

// A CodeMirror editor in the kit's frame: line numbers, dae highlighting, search, bracket matching, and
// diagnostics shown in the gutter and under the text. `readOnly` turns it into a viewer that still selects,
// copies and searches. `focusLine` scrolls a line into view and puts the cursor on it.
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  marks = [],
  focusLine,
  label,
  outbounds
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  marks?: EditorMark[];
  focusLine?: number | null;
  label: string;
  // Group names to offer after "->"; the caller keeps it current with the text.
  outbounds?: () => string[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest callbacks, read from inside CodeMirror's listeners; updated in an effect, not during render.
  const change = useRef(onChange);
  const names = useRef(outbounds);
  useEffect(() => {
    change.current = onChange;
    names.current = outbounds;
  });
  const editable = useRef(new Compartment());
  useEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          lintGutter(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          bracketMatching(),
          closeBrackets(),
          daeCompletion(() => names.current?.() ?? []),
          dae,
          syntaxHighlighting(highlight),
          theme,
          keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({'aria-label': label}),
          EditorView.updateListener.of(update => {
            if (update.docChanged) change.current?.(update.state.doc.toString());
          })
        ]
      })
    });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // The editor keeps its own document; props feed it through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    instance.dispatch({effects: editable.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])});
  }, [readOnly]);
  useEffect(() => {
    const instance = view.current;
    if (!instance || instance.state.doc.toString() === value) return;
    instance.dispatch({changes: {from: 0, to: instance.state.doc.length, insert: value}});
  }, [value]);
  useEffect(() => {
    const instance = view.current;
    if (instance) instance.dispatch(setDiagnostics(instance.state, toDiagnostics(instance.state, marks)));
  }, [marks]);
  useEffect(() => {
    const instance = view.current;
    if (!instance || !focusLine || focusLine < 1 || focusLine > instance.state.doc.lines) return;
    const line = instance.state.doc.line(focusLine);
    instance.dispatch({selection: {anchor: line.from}, effects: EditorView.scrollIntoView(line.from, {y: 'center'})});
    instance.focus();
  }, [focusLine]);
  return <div className="rp-editor" ref={host} />;
}
