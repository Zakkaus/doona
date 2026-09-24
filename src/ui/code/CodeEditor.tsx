import {useEffect, useLayoutEffect, useRef} from 'react';
import {useT, type Translator} from '../../i18n';
import type {Key} from '../../i18n';
import {Annotation, EditorState, Compartment, StateEffect, StateField, RangeSetBuilder, Transaction} from '@codemirror/state';
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
import {bracketMatching, syntaxHighlighting, HighlightStyle, indentUnit, indentOnInput, indentService} from '@codemirror/language';
import {setDiagnostics} from '@codemirror/lint';
import {highlightSelectionMatches, searchKeymap, gotoLine} from '@codemirror/search';
import {tags} from '@lezer/highlight';
import {dae} from './dae';
import {daeCompletion} from './daeComplete';
import {closeBrackets, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete';
import {toDiagnostics} from './diagnostics';

// CodeMirror phrase keys are translated through the shared catalogue.
const cmPhrases: Array<[string, Key]> = [
  ['Completions', 'cm.completions'],
  ['Find', 'cm.find'],
  ['Replace', 'cm.replace'],
  ['next', 'cm.next'],
  ['previous', 'cm.previous'],
  ['all', 'cm.all'],
  ['match case', 'cm.matchCase'],
  ['regexp', 'cm.regexp'],
  ['by word', 'cm.byWord'],
  ['replace', 'cm.replaceOne'],
  ['replace all', 'cm.replaceAll'],
  ['close', 'close'],
  ['Go to line', 'cm.gotoLine'],
  ['go', 'cm.go'],
  ['current match', 'cm.currentMatch'],
  ['replaced $ matches', 'cm.replacedMatches'],
  ['replaced match on line $', 'cm.replacedOnLine'],
  ['on line', 'cm.onLine'],
  ['Selection deleted', 'cm.selectionDeleted'],
  ['Control character', 'cm.controlCharacter']
];
const phrasesFor = (t: Translator) => EditorState.phrases.of(Object.fromEntries(cmPhrases.map(([phrase, key]) => [phrase, t(key)])));

export type EditorMark = {line: number; column?: number | null; level: 'error' | 'warning' | 'info'; message: string};

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
  '.cm-lineNumbers .cm-gutterElement': {padding: '0 8px 0 12px', minWidth: '40px'},
  '.cm-activeLine': {backgroundColor: 'color-mix(in srgb, var(--rp-hl-med) 60%, transparent)'},
  '.cm-activeLineGutter': {backgroundColor: 'transparent', color: 'var(--rp-text)'},
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {backgroundColor: 'var(--rp-hl-high)'},
  '.cm-cursor': {borderLeftColor: 'var(--rp-text)'},
  '.cm-matchingBracket': {backgroundColor: 'color-mix(in srgb, var(--rp-pine) 20%, transparent)', outline: 'none'},
  '.cm-selectionMatch': {backgroundColor: 'color-mix(in srgb, var(--rp-gold) 25%, transparent)'},
  // Diagnostics show as underlines and the list above the editor, not gutter icons; the hover tooltip is the kit's.
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
  {tag: tags.comment, color: 'var(--rp-code-comment)'},
  {tag: tags.keyword, color: 'var(--rp-code-keyword)', fontWeight: '700'},
  {tag: tags.string, color: 'var(--rp-code-string)'},
  {tag: tags.number, color: 'var(--rp-code-number)'},
  {tag: tags.propertyName, color: 'var(--rp-code-propertyName)'},
  {tag: tags.variableName, color: 'var(--rp-code-variableName)'},
  {tag: tags.operator, color: 'var(--rp-code-operator)'},
  {tag: tags.punctuation, color: 'var(--rp-code-punctuation)'}
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

// Tint diagnostic lines as well as underlining their exact spans.
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

// A stable default, so an editor without marks does not reconfigure CodeMirror every render.
const noMarks: EditorMark[] = [];
// Marks a document replacement that came from the `value` prop rather than from typing.
const external = Annotation.define<boolean>();

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  marks = noMarks,
  focusLine,
  label,
  outbounds,
  onSave,
  compact
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
  compact?: boolean;
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
  const t = useT();
  const language = useRef(new Compartment());
  const naming = useRef(new Compartment());
  // Before paint, so the first frame already shows the editor rather than an empty host.
  useLayoutEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
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
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab
          ]),
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          language.current.of(phrasesFor(t)),
          // Read-only sources remain focusable for keyboard scrolling and search.
          naming.current.of(EditorView.contentAttributes.of({'aria-label': label, tabindex: '0'})),
          EditorView.updateListener.of(update => {
            // A new `value` from the parent is not an edit: it is not echoed back.
            if (update.docChanged && !update.transactions.some(tr => tr.annotation(external))) change.current?.(update.state.doc.toString());
          })
        ]
      })
    });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- CodeMirror owns its document; the effects below sync prop changes
  }, []);
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    instance.dispatch({effects: editable.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])});
  }, [readOnly]);
  useEffect(() => {
    view.current?.dispatch({effects: language.current.reconfigure(phrasesFor(t))});
  }, [t]);
  useEffect(() => {
    view.current?.dispatch({effects: naming.current.reconfigure(EditorView.contentAttributes.of({'aria-label': label, tabindex: '0'}))});
  }, [label]);
  useEffect(() => {
    const instance = view.current;
    if (!instance || instance.state.doc.toString() === value) return;
    // Kept out of the undo history: Ctrl-Z must not bring back the text the source had before a refetch.
    instance.dispatch({
      changes: {from: 0, to: instance.state.doc.length, insert: value},
      annotations: [external.of(true), Transaction.addToHistory.of(false)]
    });
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
  return <div className={compact ? 'rp-editor compact' : 'rp-editor'} ref={host} />;
}
