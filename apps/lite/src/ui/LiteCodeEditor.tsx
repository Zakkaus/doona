import {useEffect, useRef, useState} from 'react';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {EditorState, Compartment} from '@codemirror/state';
import {EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput} from '@codemirror/language';
import {autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete';
import {lintGutter, linter} from '@codemirror/lint';
import {searchKeymap, highlightSelectionMatches} from '@codemirror/search';
import {tags} from '@lezer/highlight';
import {dae} from '../../../../src/ui/code/dae';
import {completeDae} from '../../../../src/ui/code/daeComplete';
import {toDiagnostics} from '../../../../src/ui/code/diagnostics';
import {scanConfig, unquote} from '../../../../src/dae/text';
import {dnsUpstreamNames} from '../../../../src/dae/ruleText';
import type {ConfigSource} from '../../../../src/api/model';
import type {Connection} from '../api';
import {useMessages} from '../i18n';

const highlight = HighlightStyle.define([
  {tag: tags.comment, color: 'var(--color-text-secondary)'},
  {tag: tags.keyword, color: 'var(--color-text-purple)'},
  {tag: tags.string, color: 'var(--color-text-green)'},
  {tag: tags.number, color: 'var(--color-text-orange)'},
  {tag: tags.propertyName, color: 'var(--color-text-purple)'},
  {tag: tags.operator, color: 'var(--color-text-primary)'}
]);
const theme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-supporting-size)',
    border: 'var(--border-width) solid var(--lite-editor-border)',
    borderRadius: 'var(--radius-element)'
  },
  '&.cm-focused:has(:focus-visible)': {outline: 'var(--focus-outline-width) solid var(--focus-outline-color)'},
  '.cm-scroller': {fontFamily: 'var(--font-family-code)', overflow: 'auto', minHeight: '30dvh'},
  '.cm-content': {padding: 'var(--spacing-3)', caretColor: 'var(--color-text-primary)'},
  '.cm-cursor, .cm-dropCursor': {borderLeftColor: 'var(--lite-editor-cursor)'},
  '.cm-gutters': {backgroundColor: 'var(--color-background-muted)', color: 'var(--color-text-secondary)', border: 'none'},
  '.cm-activeLine, .cm-activeLineGutter': {backgroundColor: 'var(--color-background-muted)'},
  '.cm-tooltip': {
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    border: 'var(--border-width) solid var(--color-border)'
  },
  '.cm-tooltip-autocomplete > ul': {fontFamily: 'var(--font-family-code)'},
  '.cm-tooltip-autocomplete > ul > li': {padding: 'var(--spacing-2)'},
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {backgroundColor: 'var(--color-background-muted)', color: 'var(--color-text-primary)'},
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {backgroundColor: 'var(--color-background-blue)'},
  '.cm-selectionMatch': {backgroundColor: 'var(--lite-editor-match)'},
  '.cm-searchMatch .cm-selectionMatch': {backgroundColor: 'transparent'},
  '&.cm-focused .cm-matchingBracket': {backgroundColor: 'var(--lite-editor-bracket)'},
  '.cm-searchMatch': {backgroundColor: 'var(--lite-editor-search-match)'},
  '.cm-searchMatch-selected': {backgroundColor: 'var(--lite-editor-search-selected)'},
  '.cm-panels': {backgroundColor: 'var(--lite-editor-panel)', color: 'var(--lite-editor-panel-text)'},
  '.cm-panels-top': {borderBottomColor: 'var(--lite-editor-panel-border)'},
  '.cm-panels-bottom': {borderTopColor: 'var(--lite-editor-panel-border)'},
  '.cm-textfield': {backgroundColor: 'var(--lite-editor-field)', borderColor: 'var(--lite-editor-field-border)'},
  '.cm-button': {
    backgroundImage: 'linear-gradient(var(--lite-editor-button-start), var(--lite-editor-button-end))',
    borderColor: 'var(--lite-editor-button-border)'
  },
  '.cm-button:active': {backgroundImage: 'linear-gradient(var(--lite-editor-button-pressed-start), var(--lite-editor-button-pressed-end))'}
});
export default function LiteCodeEditor({
  value,
  onChange,
  disabled,
  label,
  kind,
  connection,
  source,
  targets = []
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
  kind: 'routing' | 'dns';
  connection: Connection;
  source: ConfigSource;
  targets?: string[];
}) {
  const t = useMessages();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const props = useRef({onChange, connection, source, targets, value, disabled, label});
  props.current = {onChange, connection, source, targets, value, disabled, label};
  const readonly = useRef(new Compartment());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (disposed || !host.current) return;
        const {value, disabled, label} = props.current;
        const editor = new EditorView({
          state: EditorState.create({
            doc: value,
            extensions: [
              lineNumbers(),
              history(),
              drawSelection(),
              highlightActiveLine(),
              bracketMatching(),
              indentOnInput(),
              closeBrackets(),
              highlightSelectionMatches(),
              dae,
              syntaxHighlighting(highlight),
              theme,
              EditorView.contentAttributes.of({'aria-label': label, role: 'textbox', 'aria-multiline': 'true'}),
              readonly.current.of([EditorState.readOnly.of(disabled), EditorView.editable.of(!disabled)]),
              keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, ...searchKeymap, indentWithTab]),
              autocompletion({
                override: [
                  context =>
                    completeDae(context, () => ({
                      groups: props.current.targets.map(name => ({name, written: name})),
                      upstreams: dnsUpstreamNames(context.state.doc.toString()).map(written => ({name: unquote(written), written}))
                    }))
                ]
              }),
              lintGutter(),
              linter(
                async editor => {
                  const {connection, source} = props.current;
                  if (!connection.capabilities.resources.config_validate.modes?.includes('syntax')) return [];
                  const block = scanConfig(source.content).blocks.find(block => block.name === kind);
                  const text = editor.state.doc.toString();
                  const content = block ? source.content.slice(0, block.from) + text + source.content.slice(block.to) : source.content + '\n' + text;
                  const offset = block ? source.content.slice(0, block.from).split('\n').length - 1 : source.content.split('\n').length;
                  try {
                    const result = await connection.api.validateConfig({mode: 'syntax', sources: [{id: source.id, content}]});
                    if (!disposed) setFailed(false);
                    return toDiagnostics(
                      editor.state,
                      result.diagnostics
                        .filter(mark => mark.line !== null && mark.line !== undefined && mark.line > offset && mark.line <= offset + editor.state.doc.lines)
                        .map(mark => ({line: mark.line! - offset, column: mark.column, level: mark.level, message: mark.message}))
                    );
                  } catch {
                    if (!disposed) setFailed(true);
                    return [];
                  }
                },
                {delay: 600}
              ),
              EditorView.updateListener.of(update => {
                if (update.docChanged) props.current.onChange(update.state.doc.toString());
              })
            ]
          })
        });
        view.current = editor;
        timer = window.setTimeout(() => {
          if (disposed || !host.current) return;
          host.current.appendChild(editor.dom);
          editor.requestMeasure();
        }, 0);
      }, 0);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      view.current?.destroy();
      view.current = null;
    };
  }, [kind]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: value}});
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({effects: readonly.current.reconfigure([EditorState.readOnly.of(disabled), EditorView.editable.of(!disabled)])});
  }, [disabled]);
  return (
    <VStack gap={2} style={{minWidth: 0, width: '100%'}}>
      <VStack ref={host} style={{minWidth: 0, width: '100%', contain: 'inline-size layout style'}} data-lite-code-editor />
      {failed && <Text color="secondary">{t.editorValidationFailed}</Text>}
      <Text type="supporting" color="secondary">
        {t.editorHelp}
      </Text>
    </VStack>
  );
}
