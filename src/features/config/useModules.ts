import {useEffect, useMemo, useState} from 'react';
import type {ConfigDiagnostic, EffectiveConfig} from '../../api/model';
import {engineOf} from '../../api/engines';
import {LOCALE, useLang, useT} from '../../i18n';
import {toast, useLinked} from '../../ui/ui';
import type {EditorMark} from '../../ui/code/CodeEditor';
import {allGroupNames} from '../../dae/sources';
import {useDraftGuard} from '../../shell/draft';
import type {ConfigEditor} from './useConfigPage';
import {diagnosticRows, moduleEditTip, saveReason, sectionMarks, sectionSummaries, sectionUnder, sourceView, splice, type SectionDraft} from './view';
import {useValidationSources} from './useValidationSources';
import {useVersion} from '../../store';
import {useCompleteness} from '../../store/config';
import {useBackgroundValidation} from './useBackgroundValidation';

export type ModulesProps = {
  config: EffectiveConfig;
  editor: ConfigEditor;
  canWrite: boolean;
  canValidate: boolean;
  open: (sourceId: string, line: number | null) => void;
};

export function useModules({config, editor, canWrite, canValidate, open}: ModulesProps) {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  // The engine names the sections whose text it redacts.
  const version = useVersion().data;
  const engine = useMemo(() => engineOf(version), [version]);
  const sections = useMemo(() => sectionSummaries(config.sources, engine, lang, t), [config, engine, lang, t]);
  const isComplete = useCompleteness(config.sources);
  const [draft, setDraft] = useState<SectionDraft | null>(null);
  const [found, setFound] = useState<ConfigDiagnostic[] | null>(null);
  const dirty = draft !== null && draft.text !== draft.section.source.content!.slice(draft.section.block.from, draft.section.block.to);
  // The file changed on disk while the section was being edited, whether a refetch or a refused save showed it. A
  // change outside the section carries the draft over; a change to the section itself blocks saving until the person
  // keeps the draft over it or discards it.
  const under = useMemo(() => (draft ? sectionUnder(draft, sections) : null), [draft, sections]);
  const conflict = !!under?.conflict;
  useLinked(under && !under.conflict ? under.next : null, next => {
    if (next) setDraft(next);
  });
  const guard = useDraftGuard(dirty, () => {
    setDraft(null);
    setFound(null);
  });
  const {clear} = guard;
  useEffect(() => editor.cancel, [editor.cancel, guard.revision]);
  const fullText = useMemo(() => (draft ? splice(draft.section.source.content!, draft.section.block, draft.text) : null), [draft]);
  const sourceId = draft?.section.source.id;
  const candidates = useValidationSources(config.sources, isComplete, sourceId && fullText !== null ? {id: sourceId, content: fullText} : undefined);
  useBackgroundValidation(canValidate && fullText !== null ? candidates : null, setFound);
  const shown = (editor.errorSource === sourceId ? editor.diagnostics : null) ?? found ?? config.diagnostics;
  // The editor holds one file; diagnostics from other sources belong to their own cards.
  const own = useMemo(() => shown.filter(item => item.source_id === sourceId), [shown, sourceId]);
  // Placed once per set of diagnostics and section, against the text they describe; CodeMirror carries them through
  // later typing. Another section of the same file keeps the same diagnostics, so the section is part of the key.
  const sectionId = draft?.section.id;
  const placed = useMemo(() => ({own, sectionId, t}), [own, sectionId, t]);
  const [marks, setMarks] = useState<EditorMark[]>([]);
  useLinked(placed, next => setMarks(draft ? sectionMarks(next.own, draft.section.source.id, draft.section.block, draft.text, next.t) : []));
  const outbounds = useMemo(
    () => allGroupNames(config.sources, sourceId && fullText !== null ? {id: sourceId, content: fullText} : undefined),
    [sourceId, fullText, config]
  );
  const cancel = () => {
    editor.cancel();
    clear();
    setDraft(null);
    setFound(null);
  };
  const present = (valid: boolean, diagnostics: ConfigDiagnostic[]) => {
    setFound(diagnostics);
    toast(valid ? 'positive' : 'negative', valid ? t('config.valid') : t('config.invalid', {n: diagnostics.filter(d => d.level === 'error').length}));
  };
  const validate = async () => {
    if (!draft || !candidates || fullText === null || editor.busy) return;
    const result = await editor.validate({sources: candidates, mode: 'full'});
    if (result) present(result.valid, result.diagnostics);
  };
  const save = async () => {
    if (!draft || fullText === null || editor.busy || !dirty || conflict) return;
    const result = await editor.apply(draft.section.source, fullText);
    if (!result) return;
    if (result.diagnostics) {
      present(false, result.diagnostics);
      return;
    }
    toast('positive', t('config.saved', {path: sourceView(draft.section.source, locale, t).label}));
    clear();
    setDraft(null);
    setFound(null);
  };
  // A section removed on disk while being edited keeps its card, so the draft is not stranded out of sight.
  const cards = draft && !sections.some(section => section.id === draft.section.id) ? [...sections, draft.section] : sections;
  return {
    cards: cards.map(section => {
      const editing = draft?.section.id === section.id;
      const canEdit = canWrite && !!section.source?.writable && !!section.block && isComplete(section.source) === true;
      return {
        ...section,
        editing,
        canEdit,
        editDisabled: dirty || !!editor.busy,
        editTip: moduleEditTip(dirty, !!editor.busy, t),
        // Only the open draft is said in view; another change being applied passes in a moment.
        editReason: canEdit && !editing && dirty ? t('config.moduleEditBlocked') : null,
        note: section.note ?? (section.source && section.block && isComplete(section.source) === false ? t('config.incomplete') : null),
        muted: !section.block,
        // The whole file in the Sources tab, at this section's first line; a missing section opens the main file.
        manual: section.source ? () => open(section.source!.id, section.block ? section.block.line + 1 : null) : null,
        edit: () => {
          if (dirty || editor.busy || !canWrite || !section.source?.writable || !section.block || isComplete(section.source) !== true) return;
          setFound(null);
          setDraft({
            section: {...section, source: section.source, block: section.block},
            text: section.source.content!.slice(section.block.from, section.block.to)
          });
        }
      };
    }),
    text: draft?.text ?? '',
    // The last diagnostics stay until the next validation replaces them, so the list and marks do not flicker.
    change: (text: string) => setDraft(previous => (previous ? {...previous, text} : null)),
    marks,
    diagnostics: diagnosticRows(own, config.sources, locale, t),
    outbounds: () => outbounds,
    dirty,
    saveReason: saveReason({busy: !!editor.busy, conflict: !!conflict}, t),
    conflict: conflict ? t('config.changedOnDisk') : null,
    // Keeping the draft carries it over to the section as it is now, so the next save replaces that section.
    keep: conflict && under?.next ? () => setDraft(under.next) : null,
    busy: !!editor.busy,
    saving: editor.busy === 'save',
    validating: editor.busy === 'validate',
    canValidate: canValidate && !!candidates,
    validate,
    save,
    cancel
  };
}
