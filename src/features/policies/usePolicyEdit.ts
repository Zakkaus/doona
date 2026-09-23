import {isFragment} from '../../dae/text';
import {useRef, useState} from 'react';
import {useT} from '../../i18n';
import {writeGroupEntry, type GroupEntry} from '../../dae/groups';
import {editProblem, type MainSourceEdit} from '../../store/mainSource';
import type {ConfigSource} from '../../api/model';
import {toast} from '../../ui/ui';
import {useDraftGuard} from '../../shell/draft';
import {errorText} from '../../api/error';
export type PolicyEditView = {
  title: string;
  open: boolean;
  available: boolean;
  disabled: boolean;
  tip?: string;
  busy: boolean;
  // Why the last save did not land; `id` changes with each refusal so the alert takes focus again.
  problem: {id: number; text: string} | null;
  policy: string | null;
  filters: Array<{id: number; value: string; label: string; removeLabel: string; change: (value: string) => void; remove: () => void}>;
  show: () => void;
  close: () => void;
  setPolicy: (value: string) => void;
  add: () => void;
  save: (close: () => void) => void;
};
export function usePolicyEdit(name: string, source: MainSourceEdit, entry: GroupEntry | undefined): PolicyEditView {
  const t = useT();
  const [draft, setDraft] = useState<{name: string; origin: ConfigSource; policy: string | null; filters: string[]} | null>(null);
  const session = useRef(0);
  const [problem, setProblem] = useState<PolicyEditView['problem']>(null);
  const refuse = (text: string) => setProblem(prev => ({id: (prev?.id ?? 0) + 1, text}));
  const guard = useDraftGuard(!!draft && (draft.policy !== entry?.policy || JSON.stringify(draft.filters) !== JSON.stringify(entry?.filters)), () => {
    session.current++;
    setDraft(null);
    setProblem(null);
  });
  const save = (close: () => void) => {
    if (!draft) return;
    const filters = draft.filters.map(f => f.trim()).filter(Boolean);
    if (![...filters, draft.policy ?? ''].every(isFragment)) {
      refuse(t('policy.editUnsafe'));
      return;
    }
    const submitted = session.current;
    void source
      .apply(text => writeGroupEntry(text, draft.name, {filters, policy: draft.policy}), draft.origin)
      .then(result => {
        const open = session.current === submitted;
        if (result.kind === 'ok') {
          if (open) {
            guard.clear();
            close();
          }
          toast('positive', t('policy.updated', {name: draft.name}));
        }
        const text = editProblem(result, 'policy.editInvalid', t);
        // A refusal after the dialog closed has nowhere inline to go.
        if (text) {
          if (open) refuse(text);
          else toast('negative', text);
        }
      });
  };
  // Edits wait while a save is in flight; what was submitted is what the outcome describes.
  const edit = (update: (prev: NonNullable<typeof draft>) => NonNullable<typeof draft>) => {
    if (!source.busy) setDraft(prev => (prev ? update(prev) : prev));
  };
  return {
    title: t('policy.editTitle', {name}),
    open: !!draft,
    available: !!draft || source.writable,
    disabled: source.busy || !entry || !source.main,
    tip: source.error ? errorText(source.error, t) : !source.main ? t('policy.editNoMain') : !entry ? t('policy.editNoEntry') : undefined,
    busy: source.busy,
    problem,
    policy: draft?.policy ?? null,
    filters: (draft?.filters ?? []).map((value, id) => ({
      id,
      value,
      label: t('policy.filterN', {n: id + 1}),
      removeLabel: t('policy.removeFilter', {n: id + 1}),
      change: (value: string) => edit(prev => ({...prev, filters: prev.filters.map((f, i) => (i === id ? value : f))})),
      remove: () => edit(prev => ({...prev, filters: prev.filters.filter((_, i) => i !== id)}))
    })),
    show: () => {
      session.current++;
      setProblem(null);
      if (entry && source.main) setDraft({name: entry.name, origin: source.main, policy: entry.policy, filters: entry.filters});
    },
    close: () => {
      session.current++;
      setProblem(null);
      guard.clear();
      setDraft(null);
    },
    setPolicy: policy => edit(prev => ({...prev, policy})),
    add: () => edit(prev => ({...prev, filters: [...prev.filters, '']})),
    save
  };
}
