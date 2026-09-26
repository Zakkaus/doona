import {useMemo, useState} from 'react';
import {useT} from '../../i18n';
import type {ConfigSource} from '../../api/model';
import {errorText} from '../../api/error';
import {useConfigCreate} from '../../store';
import {toast} from '../../ui/ui';
import {includeDirectory, includedBy, includePatterns, namePatterns, newSourceNameProblem, newSourcePathProblem} from '../../dae/newSource';

export type NewSourceProps = {
  sources: ConfigSource[];
  // Include patterns are read from the main source's text, so they are known only when the backend offers content.
  contentOffered: boolean;
  refetch: () => void;
  open: (sourceId: string) => void;
};

export function useNewSource({sources, contentOffered, refetch, open}: NewSourceProps) {
  const t = useT();
  const main = sources.find(source => source.kind === 'main');
  const patterns = useMemo(() => (contentOffered && main?.content !== undefined ? includePatterns(main.content) : null), [contentOffered, main]);
  // With a pattern to fill, the field holds only the name its `*` stands for; without one, the whole relative path.
  const choices = useMemo(() => namePatterns(patterns ?? []), [patterns]);
  // null while the dialog is closed.
  const [draft, setDraft] = useState<{text: string; pattern: string} | null>(null);
  // Why the last submit did not land; `id` changes with each refusal so the alert takes focus again.
  const [problem, setProblem] = useState<{id: number; text: string} | null>(null);
  const {busy, create} = useConfigCreate(refetch);
  const text = draft?.text ?? '';
  const choice = choices.find(item => item.pattern === draft?.pattern) ?? null;
  const value = choice ? choice.prefix + text + choice.suffix : text;
  const invalid = !text ? null : choice ? newSourceNameProblem(text, choice) : newSourcePathProblem(text);
  const submit = async (close: () => void) => {
    if (!text || invalid || busy) return;
    try {
      const created = await create(value);
      if (!created) return;
      close();
      toast('positive', t('config.newSourceCreated', {path: value}));
      if (created.id) open(created.id);
    } catch (error) {
      setProblem(prev => ({id: (prev?.id ?? 0) + 1, text: errorText(error, t)}));
    }
  };
  return {
    isOpen: draft !== null,
    show: () => {
      setProblem(null);
      setDraft({text: choices.length ? '' : includeDirectory(patterns ?? []), pattern: choices[0]?.pattern ?? ''});
    },
    hide: () => setDraft(null),
    choices,
    choice,
    setChoice: (pattern: string) => setDraft(prev => prev && {...prev, pattern}),
    text,
    setText: (next: string) => setDraft(prev => prev && {...prev, text: next}),
    error: invalid ? t(invalid) : undefined,
    // Only a known set of patterns can say a path is not loaded; the backend refuses it either way.
    unmatched: !!text && !invalid && patterns !== null && !includedBy(patterns, value),
    problem,
    busy,
    canSubmit: !!text && !invalid && !busy,
    submit
  };
}
