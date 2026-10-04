import {useEffect, useLayoutEffect, useRef, type ReactNode} from 'react';
import {useFocusVisible} from 'react-aria';
import {Menu, MenuItem} from 'react-aria-components';
import {useT, type Translator} from '../../i18n';
import type {Key} from '../../i18n';
import {Annotation, EditorState, Compartment, StateEffect, StateField, RangeSetBuilder} from '@codemirror/state';
import {
  EditorView,
  type Command,
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
import {defaultKeymap, history, historyKeymap, indentWithTab, redo, toggleComment, undo} from '@codemirror/commands';
import {bracketMatching, syntaxHighlighting, HighlightStyle, indentUnit, indentOnInput, indentService} from '@codemirror/language';
import {lintGutter, setDiagnostics} from '@codemirror/lint';
import {highlightSelectionMatches, searchKeymap, gotoLine, openSearchPanel} from '@codemirror/search';
import {tags} from '@lezer/highlight';
import {dae} from './dae';
import {daeCompletion} from './daeComplete';
import {closeBrackets, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete';
import {toDiagnostics} from './diagnostics';
import type {GroupEntry} from '../../dae/groups';
import {readOnlyAttempts} from './readOnlyAttempt';
import {Button, PrimaryActions} from '../Button';
import {MenuButton} from '../Menu';
import {ActionGroup, MoreMenu, type Action} from '../ActionGroup';
import {useOverflow} from '../hooks';

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
  ['close', 'ui.close'],
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
  '&': {
    backgroundColor: 'var(--rp-base)',
    color: 'var(--rp-text)',
    border: '1px solid var(--rp-hl-high)',
    borderRadius: 'var(--rp-r-md)',
    fontSize: 'var(--rp-text-sm)'
  },
  // Any focus takes the strong border; the keyboard ring is drawn by interaction-states.css.
  '&.cm-focused': {outline: 'none', borderColor: 'var(--rp-text)'},
  '.cm-scroller': {
    fontFamily: 'var(--rp-font-mono)',
    lineHeight: 'var(--rp-line-body)',
    fontVariantLigatures: 'none',
    // Clip the opaque gutter to the frame's corners; tooltips live outside the scroller and are not clipped.
    borderRadius: 'calc(var(--rp-r-md) - 1px)'
  },
  '.cm-content': {padding: 'var(--rp-space-2) 0', caretColor: 'var(--rp-text)'},
  '.cm-line': {padding: '0 var(--rp-space-3)'},
  // Opaque, so a line scrolled sideways passes under the numbers rather than through them.
  '.cm-gutters': {backgroundColor: 'var(--rp-base)', color: 'var(--rp-muted)', border: 'none'},
  '.cm-lineNumbers .cm-gutterElement': {padding: '0 var(--rp-space-2) 0 var(--rp-space-3)', minWidth: '40px'},
  '.cm-activeLine, .cm-focusLine': {backgroundColor: 'color-mix(in srgb, var(--rp-hl-med) 60%, transparent)'},
  '.cm-activeLineGutter': {backgroundColor: 'transparent', color: 'var(--rp-text)'},
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {backgroundColor: 'var(--rp-hl-high)'},
  '.cm-cursor': {borderLeftColor: 'var(--rp-text)'},
  '.cm-matchingBracket': {backgroundColor: 'color-mix(in srgb, var(--rp-accent) 20%, transparent)', outline: 'none'},
  '.cm-selectionMatch': {backgroundColor: 'color-mix(in srgb, var(--rp-notice) 25%, transparent)'},
  // Diagnostics show as gutter markers, underlines and the list above the editor; the hover tooltip is the kit's.
  '.cm-gutter-lint': {width: '12px'},
  '.cm-gutter-lint .cm-gutterElement': {padding: '0'},
  '.cm-lint-marker': {width: '8px', height: '8px', margin: '6px 2px', borderRadius: '50%'},
  '.cm-lint-marker-error': {content: 'none', backgroundColor: 'var(--rp-negative)'},
  '.cm-lint-marker-warning': {content: 'none', backgroundColor: 'var(--rp-notice)'},
  '.cm-lint-marker-info': {content: 'none', backgroundColor: 'var(--rp-foam)'},
  '.cm-tooltip.cm-tooltip-lint': {
    backgroundColor: 'var(--rp-text)',
    color: 'var(--rp-on-text)',
    border: 'none',
    borderRadius: 'var(--rp-r-sm)',
    padding: 'var(--rp-space-half) 0'
  },
  '.cm-tooltip-lint .cm-diagnostic': {
    border: 'none',
    padding: 'var(--rp-space-half) var(--rp-space-2)',
    fontSize: 'var(--rp-text-xs)',
    lineHeight: '16px',
    fontFamily: 'inherit'
  },
  '.cm-tooltip-lint .cm-diagnosticText': {color: 'inherit'},
  '.cm-diag-line-error': {backgroundColor: 'color-mix(in srgb, var(--rp-negative) 14%, transparent)'},
  '.cm-diag-line-warning': {backgroundColor: 'color-mix(in srgb, var(--rp-notice) 16%, transparent)'},
  '.cm-diag-line-info': {backgroundColor: 'color-mix(in srgb, var(--rp-foam) 14%, transparent)'},
  '.cm-lintRange-error': {backgroundImage: 'none', textDecoration: 'underline wavy var(--rp-negative)', textUnderlineOffset: '3px'},
  '.cm-lintRange-warning': {backgroundImage: 'none', textDecoration: 'underline wavy var(--rp-notice)', textUnderlineOffset: '3px'},
  '.cm-lintRange-info': {backgroundImage: 'none', textDecoration: 'underline dotted var(--rp-foam)', textUnderlineOffset: '3px'},
  '.cm-tooltip': {backgroundColor: 'var(--rp-surface)', border: '1px solid var(--rp-hl-high)', borderRadius: 'var(--rp-r-md)', color: 'var(--rp-text)'},
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {backgroundColor: 'var(--rp-selected)', color: 'var(--rp-text)'},
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--rp-font-mono)',
    fontVariantLigatures: 'none'
  },
  '.cm-panels': {backgroundColor: 'var(--rp-surface)', color: 'var(--rp-text)'},
  '.cm-panels-bottom': {borderTop: '1px solid var(--rp-hl-med)'},
  '.cm-textfield': {border: '1px solid var(--rp-hl-high)', borderRadius: 'var(--rp-r-sm)', backgroundColor: 'var(--rp-base)', color: 'var(--rp-text)'},
  '.cm-button': {
    border: '1px solid var(--rp-hl-high)',
    borderRadius: 'var(--rp-r-sm)',
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

// The keymap's secondary commands, listed in the toolbar's menu for a pointer or a touch screen.
const editCommands: Array<{id: string; label: Key; run: Command}> = [
  {id: 'undo', label: 'cm.undo', run: undo},
  {id: 'redo', label: 'cm.redo', run: redo},
  {id: 'comment', label: 'cm.toggleComment', run: toggleComment}
];

// A stable default, so an editor without marks does not reconfigure CodeMirror every render.
const noMarks: EditorMark[] = [];
// Marks a document replacement that came from the `value` prop rather than from typing.
const external = Annotation.define<boolean>();
// The line a read-only source was opened at, marked in place of the active line it no longer draws.
const setFocusLine = StateEffect.define<number>();
const focusDecoration = Decoration.line({class: 'cm-focusLine'});
const focusMark = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setFocusLine)) next = Decoration.set(focusDecoration.range(transaction.state.doc.line(effect.value).from));
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field)
});
// A read-only source draws no caret or active line, so it does not look editable; the browser's own selection still copies.
const editMode = (readOnly: boolean) => [
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
  readOnly ? focusMark : [drawSelection(), highlightActiveLine(), highlightActiveLineGutter()]
];

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  marks = noMarks,
  focusLine,
  label,
  outbounds,
  onSave,
  onReadOnlyAttempt,
  compact,
  actions = [],
  focusKey,
  banner
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  marks?: EditorMark[];
  focusLine?: number | null;
  label: string;
  // Group names to offer after "->"; the caller keeps it current with the text.
  outbounds?: () => Pick<GroupEntry, 'name' | 'written'>[];
  // Mod-S inside the editor; the caller decides what saving means.
  onSave?: () => void;
  // Typing, paste, cut or a touch tap while read-only; the caller explains why the text cannot change.
  onReadOnlyAttempt?: () => void;
  compact?: boolean;
  actions?: Action[];
  // Changes to move to focusLine again when it is the line already asked for.
  focusKey?: number;
  // What stays pinned under the toolbar while the page scrolls the editor, such as a diagnostics summary.
  banner?: ReactNode;
}) {
  const toolbar = useRef<HTMLDivElement>(null);
  const collapsed = useOverflow(toolbar, `${readOnly} ${!!onChange} ${label}`);
  const overflow = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (collapsed && toolbar.current?.contains(document.activeElement)) overflow.current?.querySelector('button')?.focus();
  }, [collapsed]);
  const host = useRef<HTMLDivElement>(null);
  // CodeMirror has no React Aria state; the ring follows the same keyboard-only modality as the other fields.
  const {isFocusVisible} = useFocusVisible({isTextInput: true});
  const head = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest callbacks, read from inside CodeMirror's listeners; updated in an effect, not during render.
  const change = useRef(onChange);
  const names = useRef(outbounds);
  const save = useRef(onSave);
  const refused = useRef(onReadOnlyAttempt);
  useEffect(() => {
    change.current = onChange;
    names.current = outbounds;
    save.current = onSave;
    refused.current = onReadOnlyAttempt;
  });
  const editable = useRef(new Compartment());
  const t = useT();
  const language = useRef(new Compartment());
  const naming = useRef(new Compartment());
  const undoable = useRef(new Compartment());
  // Before paint, so the first frame already shows the editor rather than an empty host.
  useLayoutEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          lintGutter(),
          // The editor grows with its text and the page scrolls it, so a moved cursor must clear the pinned head. CodeMirror
          // adds the margin to the scroller's top for tooltips as well, so it covers only the part of the head over the text.
          EditorView.scrollMargins.of(view => {
            const pinned = head.current?.getBoundingClientRect().bottom;
            return pinned === undefined ? null : {top: Math.min(pinned, Math.max(0, pinned - view.scrollDOM.getBoundingClientRect().top))};
          }),
          highlightSpecialChars(),
          undoable.current.of(history()),
          rectangularSelection(),
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
          editable.current.of(editMode(readOnly)),
          language.current.of(phrasesFor(t)),
          // Read-only sources remain focusable for keyboard scrolling and search.
          naming.current.of(EditorView.contentAttributes.of({'aria-label': label, tabindex: '0'})),
          readOnlyAttempts(() => refused.current?.()),
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
    instance.dispatch({effects: editable.current.reconfigure(editMode(readOnly))});
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
    // A new value starts a new undo history: Ctrl-Z must neither bring back the text from before a refetch nor replay,
    // at the edge of the new text, an edit that a cancel threw away. Dropping the history and adding it back resets it.
    instance.dispatch({
      changes: {from: 0, to: instance.state.doc.length, insert: value},
      annotations: external.of(true),
      effects: undoable.current.reconfigure([])
    });
    instance.dispatch({effects: undoable.current.reconfigure(history())});
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
    instance.dispatch({selection: {anchor: line.from}, effects: [setFocusLine.of(focusLine), EditorView.scrollIntoView(line.from, {y: 'center'})]});
    instance.focus();
  }, [focusLine, focusKey]);
  // The toolbar runs the keymap's own commands. Find and Go to line only move and select, so they stay in a read-only
  // source; the editing menu is disabled there, and a preview without onChange, which never becomes editable, has none.
  // A compact preview keeps its reduced height and has no toolbar.
  const run = (command: Command) => {
    if (view.current) command(view.current);
  };
  return (
    <>
      {!compact && (
        <div className="rp-editor-head" ref={head}>
          <div className="rp-editor-toolbar">
            {/* The caller's actions commit or check the source, as a form's do: Buttons in their own row. The editing
                tools take the row above the text, as action buttons, and fold into a menu where they do not fit. */}
            {actions.length > 0 && (
              <div className="rp-toolbar">
                <PrimaryActions>
                  <ActionGroup actions={actions} overflowMode="wrap" />
                </PrimaryActions>
              </div>
            )}
            <div className="rp-editor-actions" data-collapsed={collapsed || undefined}>
              <div className="rp-toolbar" ref={toolbar}>
                <Button onPress={() => run(openSearchPanel)}>{t(readOnly ? 'cm.find' : 'cm.findReplace')}</Button>
                <Button onPress={() => run(gotoLine)}>{t('cm.gotoLine')}</Button>
                {onChange && (
                  <MenuButton
                    label={t('cm.commands')}
                    isDisabled={readOnly}
                    content={
                      <Menu
                        aria-label={t('cm.commands')}
                        onAction={key => {
                          const command = editCommands.find(command => command.id === key);
                          if (command) run(command.run);
                        }}
                      >
                        {editCommands.map(command => (
                          <MenuItem key={command.id} id={command.id} className="rp-item plain" textValue={t(command.label)}>
                            {t(command.label)}
                          </MenuItem>
                        ))}
                      </Menu>
                    }
                  >
                    {t('cm.commands')}
                  </MenuButton>
                )}
              </div>
              {collapsed && (
                <div className="rp-editor-overflow" ref={overflow}>
                  <MoreMenu
                    actions={[
                      {id: 'find', label: t(readOnly ? 'cm.find' : 'cm.findReplace'), onAction: () => requestAnimationFrame(() => run(openSearchPanel))},
                      {id: 'line', label: t('cm.gotoLine'), onAction: () => requestAnimationFrame(() => run(gotoLine))},
                      ...(onChange
                        ? editCommands.map(command => ({
                            id: command.id,
                            label: t(command.label),
                            isDisabled: readOnly,
                            onAction: () => requestAnimationFrame(() => run(command.run))
                          }))
                        : [])
                    ]}
                  />
                </div>
              )}
            </div>
          </div>
          {banner}
        </div>
      )}
      <div className={compact ? 'rp-editor compact' : 'rp-editor'} ref={host} data-keyboard={isFocusVisible || undefined} />
    </>
  );
}
