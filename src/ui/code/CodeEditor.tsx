import {useEffect, useRef} from 'react';
import {EditorState, Compartment, StateEffect, StateField, RangeSetBuilder} from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  Decoration,
  type DecorationSet,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  highlightSpecialChars
} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap, indentWithTab, toggleComment} from '@codemirror/commands';
import {bracketMatching, syntaxHighlighting, HighlightStyle, foldGutter, foldKeymap, indentUnit, indentOnInput, indentService} from '@codemirror/language';
import {setDiagnostics, type Diagnostic} from '@codemirror/lint';
import {highlightSelectionMatches, searchKeymap, gotoLine} from '@codemirror/search';
import {tags} from '@lezer/highlight';
import {dae} from './dae';
import {daeCompletion} from './daeComplete';
import {closeBrackets, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete';

export type EditorMark = {line: number; column?: number | null; level: 'error' | 'warning' | 'info'; message: string};

// Colours come from theme.css tokens, so the editor follows every palette and the dark scheme.
const theme = EditorView.theme({
  '&': {backgroundColor: 'var(--rp-base)', color: 'var(--rp-text)', border: '1px solid var(--rp-hl-high)', borderRadius: '8px', fontSize: '13px'},
  '&.cm-focused': {outline: 'none', borderColor: 'var(--rp-pine)', boxShadow: '0 0 0 1px var(--rp-pine)'},
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, 'JetBrains Mono', 'Fira Code', 'DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono', monospace",
    lineHeight: '20px',
    maxHeight: '70vh',
    fontVariantLigatures: 'none'
  },
  '.cm-content': {padding: '8px 0', caretColor: 'var(--rp-text)'},
  '.cm-line': {padding: '0 12px'},
  '.cm-gutters': {backgroundColor: 'transparent', color: 'var(--rp-muted)', border: 'none'},
  '.cm-foldGutter .cm-gutterElement': {color: 'var(--rp-muted)', padding: '0 2px'},
  '.cm-foldPlaceholder': {backgroundColor: 'var(--rp-hl-med)', border: 'none', color: 'var(--rp-subtle)', borderRadius: '4px', padding: '0 6px'},
  '.cm-lineNumbers .cm-gutterElement': {padding: '0 8px 0 12px', minWidth: '40px'},
  '.cm-activeLine': {backgroundColor: 'color-mix(in srgb, var(--rp-hl-med) 60%, transparent)'},
  '.cm-activeLineGutter': {backgroundColor: 'transparent', color: 'var(--rp-text)'},
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {backgroundColor: 'var(--rp-hl-high)'},
  '.cm-cursor': {borderLeftColor: 'var(--rp-text)'},
  '.cm-matchingBracket': {backgroundColor: 'color-mix(in srgb, var(--rp-pine) 20%, transparent)', outline: 'none'},
  '.cm-selectionMatch': {backgroundColor: 'color-mix(in srgb, var(--rp-gold) 25%, transparent)'},
  // Diagnostics are underlines in the text and the list above the editor; no gutter icons. The hover tooltip is the kit's.
  '.cm-tooltip.cm-tooltip-lint': {backgroundColor: 'var(--rp-text)', color: 'var(--rp-on-text)', border: 'none', borderRadius: '6px', padding: '2px 0'},
  '.cm-tooltip-lint .cm-diagnostic': {border: 'none', padding: '2px 8px', fontSize: '12px', lineHeight: '16px', fontFamily: 'inherit'},
  '.cm-tooltip-lint .cm-diagnosticText': {color: 'inherit'},
  '.cm-diag-line-error': {backgroundColor: 'color-mix(in srgb, var(--rp-love) 14%, transparent)'},
  '.cm-diag-line-warning': {backgroundColor: 'color-mix(in srgb, var(--rp-gold) 16%, transparent)'},
  '.cm-diag-line-info': {backgroundColor: 'color-mix(in srgb, var(--rp-foam) 14%, transparent)'},
  '.cm-lintRange-error': {backgroundImage: 'none', textDecoration: 'underline wavy var(--rp-love)', textUnderlineOffset: '3px'},
  '.cm-lintRange-warning': {backgroundImage: 'none', textDecoration: 'underline wavy var(--rp-gold)', textUnderlineOffset: '3px'},
  '.cm-lintRange-info': {backgroundImage: 'none', textDecoration: 'underline dotted var(--rp-foam)', textUnderlineOffset: '3px'},
  '.cm-tooltip': {backgroundColor: 'var(--rp-surface)', border: '1px solid var(--rp-hl-high)', borderRadius: '8px', color: 'var(--rp-text)'},
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {backgroundColor: 'var(--rp-selected)', color: 'var(--rp-text)'},
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, 'JetBrains Mono', 'Fira Code', 'DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono', monospace"
  },
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

// dae nests with braces and two spaces: a line after "{" indents, a line starting with "}" steps back out.
const daeIndent = indentService.of((context, pos) => {
  const line = context.lineAt(pos, -1);
  const previous = line.from > 0 ? context.lineAt(line.from - 1, -1) : null;
  if (!previous) return 0;
  const base = /^\s*/.exec(previous.text)![0].length;
  const opens = /\{\s*(#.*)?$/.test(previous.text);
  const closes = /^\s*\}/.test(line.text);
  return Math.max(0, base + (opens ? 2 : 0) - (closes ? 2 : 0));
});

// The whole line of a diagnostic is tinted by its level, so a problem is visible from across the file; the
// underline then says where on the line.
const setLineMarks = StateEffect.define<EditorMark[]>();
const lineDecoration = {
  error: Decoration.line({class: 'cm-diag-line cm-diag-line-error'}),
  warning: Decoration.line({class: 'cm-diag-line cm-diag-line-warning'}),
  info: Decoration.line({class: 'cm-diag-line cm-diag-line-info'})
};
const lineMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setLineMarks)) continue;
      const builder = new RangeSetBuilder<Decoration>();
      const rank = {error: 0, warning: 1, info: 2};
      const byLine = new Map<number, EditorMark>();
      for (const mark of effect.value) {
        if (mark.line < 1 || mark.line > transaction.state.doc.lines) continue;
        const current = byLine.get(mark.line);
        if (!current || rank[mark.level] < rank[current.level]) byLine.set(mark.line, mark);
      }
      for (const line of [...byLine.keys()].sort((a, b) => a - b)) {
        const from = transaction.state.doc.line(line).from;
        builder.add(from, from, lineDecoration[byLine.get(line)!.level]);
      }
      next = builder.finish();
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field)
});

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
  outbounds,
  onSave
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  marks?: EditorMark[];
  focusLine?: number | null;
  label: string;
  // Group names to offer after "->"; the caller keeps it current with the text.
  outbounds?: () => string[];
  // Mod-S inside the editor; the caller decides what saving means.
  onSave?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest callbacks, read from inside CodeMirror's listeners; updated in an effect, not during render.
  const change = useRef(onChange);
  const names = useRef(outbounds);
  const save = useRef(onSave);
  useEffect(() => {
    change.current = onChange;
    names.current = outbounds;
    save.current = onSave;
  });
  const editable = useRef(new Compartment());
  useEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          rectangularSelection(),
          highlightActiveLine(),
          lineMarks,
          highlightSelectionMatches(),
          bracketMatching(),
          closeBrackets(),
          indentUnit.of('  '),
          indentOnInput(),
          daeIndent,
          daeCompletion(() => names.current?.() ?? []),
          dae,
          syntaxHighlighting(highlight),
          theme,
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                save.current?.();
                return true;
              }
            },
            {key: 'Mod-/', run: toggleComment},
            {key: 'Mod-g', run: gotoLine},
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...foldKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab
          ]),
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
    if (!instance) return;
    const spec = setDiagnostics(instance.state, toDiagnostics(instance.state, marks));
    const effects = Array.isArray(spec.effects) ? spec.effects : spec.effects ? [spec.effects] : [];
    instance.dispatch({...spec, effects: [...effects, setLineMarks.of(marks)]});
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
