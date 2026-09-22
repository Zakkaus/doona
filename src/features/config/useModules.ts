import {useEffect, useMemo, useState} from 'react';
import {getApi} from '../../api';
import {completeSource} from '../../store/config';
import type {ConfigDiagnostic, ConfigSource, EffectiveConfig} from '../../api/model';
import {LOCALE, useLang, useT} from '../../i18n';
import {toast, useLinked} from '../../ui/ui';
import {groupNames} from './names';
import {useDraftGuard} from './useDraftGuard';
import type {ConfigEditor} from './useConfigPage';
import {diagnosticRows, sectionMarks, sectionSummaries, sourceView, splice, type ModuleSection} from './view';
import {useValidationSources} from './useValidationSources';

export type ModulesProps = {config: EffectiveConfig; editor: ConfigEditor; canWrite: boolean; canValidate: boolean};
type Draft = {section: ModuleSection & {source: ConfigSource; block: NonNullable<ModuleSection['block']>}; text: string};

export function useModules({config, editor, canWrite, canValidate}: ModulesProps) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const api = getApi();
  const sections = useMemo(() => sectionSummaries(config.sources, t), [config, t]);
  const [checked, setChecked] = useState<Map<ConfigSource, boolean>>(new Map());
  useEffect(() => {
    let live = true;
    void Promise.all(config.sources.map(async source => [source, await completeSource(source)] as const)).then(entries => {
      if (live) setChecked(new Map(entries));
    });
    return () => {
      live = false;
    };
  }, [config]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [found, setFound] = useState<ConfigDiagnostic[] | null>(null);
  const dirty = draft !== null && draft.text !== draft.section.source.content!.slice(draft.section.block.from, draft.section.block.to);
  const guard = useDraftGuard(dirty);
  const {clear} = guard;
  useLinked(guard.revision, () => {
    setDraft(null);
    setFound(null);
  });
  useEffect(() => editor.cancel, [editor.cancel, guard.revision]);
  const fullText = useMemo(() => (draft ? splice(draft.section.source.content!, draft.section.block, draft.text) : null), [draft]);
  const sourceId = draft?.section.source.id;
  const candidates = useValidationSources(config.sources, sourceId && fullText !== null ? {id: sourceId, content: fullText} : undefined);
  useEffect(() => {
    if (!canValidate || !candidates || fullText === null || !sourceId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api.validateConfig({sources: candidates, mode: 'full'}, controller.signal).then(
        result => {
          if (!controller.signal.aborted) setFound(result.diagnostics);
        },
        () => undefined
      );
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, canValidate, candidates, fullText, sourceId]);
  const shown = (editor.errorSource === sourceId ? editor.diagnostics : null) ?? found ?? config.diagnostics;
  const marks = useMemo(() => (draft ? sectionMarks(shown, draft.section.source.id, draft.section.block, draft.text) : []), [shown, draft]);
  const outbounds = useMemo(() => groupNames(fullText ?? config.sources.find(source => source.kind === 'main')?.content ?? ''), [fullText, config]);
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
    if (!draft || fullText === null || editor.busy || !dirty) return;
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
  return {
    cards: sections.map(section => ({
      ...section,
      editing: draft?.section.id === section.id,
      canEdit: canWrite && !!section.source?.writable && !!section.block && checked.get(section.source) === true,
      editDisabled: dirty || !!editor.busy,
      note: section.note ?? (section.source && section.block && checked.get(section.source) === false ? t('config.incomplete') : null),
      muted: !section.block,
      edit: () => {
        if (dirty || editor.busy || !canWrite || !section.source?.writable || !section.block || checked.get(section.source) !== true) return;
        setFound(null);
        setDraft({
          section: {...section, source: section.source, block: section.block},
          text: section.source.content!.slice(section.block.from, section.block.to)
        });
      }
    })),
    text: draft?.text ?? '',
    change: (text: string) => {
      setFound(null);
      setDraft(previous => (previous ? {...previous, text} : null));
    },
    marks,
    diagnostics: diagnosticRows(shown, config.sources, locale, t),
    outbounds: () => outbounds,
    dirty,
    busy: !!editor.busy,
    saving: editor.busy === 'save',
    validating: editor.busy === 'validate',
    canValidate: canValidate && !!candidates,
    validate,
    save,
    cancel
  };
}
