import {useState} from 'react';
import {useT} from '../../i18n';
import {writeGroupEntry} from '../../dae/groups';
import {editProblem, type MainSourceEdit} from '../../store/mainSource';
import type {ConfigSource} from '../../api/model';
import {toast} from '../../ui/ui';
import {useDialogSession, useDraftGuard} from '../../shell/draft';
import {noticeText} from '../../api/error';
import {groupEditSafe} from '../shared/policyText';
import {editBlocked, type GroupOwner} from './view';
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
// Where the group is declared, and whether that source's text is complete and the configuration read.
export type PolicyDeclaration = {owner: GroupOwner | undefined; complete: boolean | undefined; loaded: boolean; error: Error | null};
// Edits the group in the source that declares it; `source` carries the write and whether the backend takes one.
export function usePolicyEdit(name: string, source: MainSourceEdit, declaration: PolicyDeclaration): PolicyEditView {
  const t = useT();
  const {owner} = declaration;
  const declared = owner === 'ambiguous' ? undefined : owner;
  const entry = declared?.entry;
  const blocked = editBlocked(owner, declaration, t);
  const [draft, setDraft] = useState<{name: string; origin: ConfigSource; policy: string | null; filters: string[]} | null>(null);
  const session = useDialogSession();
  const [problem, setProblem] = useState<PolicyEditView['problem']>(null);
  const refuse = (text: string) => setProblem(prev => ({id: (prev?.id ?? 0) + 1, text}));
  const guard = useDraftGuard(!!draft && (draft.policy !== entry?.policy || JSON.stringify(draft.filters) !== JSON.stringify(entry?.filters)), () => {
    session.next();
    setDraft(null);
    setProblem(null);
  });
  const save = (close: () => void) => {
    if (!draft) return;
    const filters = draft.filters.map(f => f.trim()).filter(Boolean);
    if (!groupEditSafe(filters, draft.policy, entry)) {
      refuse(t('policy.editUnsafe'));
      return;
    }
    const current = session.start();
    void source
      .apply(text => writeGroupEntry(text, draft.name, {filters, policy: draft.policy}), draft.origin)
      .then(result => {
        const open = current();
        if (result.kind === 'ok') {
          if (open) {
            guard.clear();
            close();
          }
          toast('positive', t('policy.updated', {name: draft.name}));
        }
        const problem = editProblem(result, t);
        // A refusal after the dialog closed has nowhere inline to go.
        if (problem) {
          if (open) refuse(noticeText(problem, t));
          else toast(problem.kind, problem.text, {detail: problem.detail});
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
    disabled: source.busy || blocked !== null,
    tip: blocked ?? undefined,
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
      session.next();
      setProblem(null);
      if (declared && !blocked) setDraft({name: declared.entry.name, origin: declared.origin, policy: declared.entry.policy, filters: declared.entry.filters});
    },
    close: () => {
      session.next();
      setProblem(null);
      guard.clear();
      setDraft(null);
    },
    setPolicy: policy => edit(prev => ({...prev, policy})),
    add: () => edit(prev => ({...prev, filters: [...prev.filters, '']})),
    save
  };
}
