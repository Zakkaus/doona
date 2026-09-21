import {useState} from 'react';
import {useT} from '../../i18n';
import {policyKindLabels} from './view';
import {canonicalPolicy, policyNames, writeGroupEntry, type GroupEntry} from '../config/groups';
import type {MainSourceEdit} from '../config/mainSource';
import type {ConfigSource} from '../../api/model';
import {errorText, toast, useLinked} from '../../ui/ui';
import {useDraftGuard} from '../config/useDraftGuard';
export type PolicyEditView = {
  title: string;
  open: boolean;
  available: boolean;
  disabled: boolean;
  tip?: string;
  busy: boolean;
  policy: string;
  choices: Array<{id: string; label: string; desc: string}>;
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
  const guard = useDraftGuard(!!draft && (draft.policy !== entry?.policy || JSON.stringify(draft.filters) !== JSON.stringify(entry?.filters)));
  useLinked(guard.revision, () => setDraft(null));
  const save = (close: () => void) => {
    if (!draft) return;
    void source
      .apply(
        text => writeGroupEntry(text, draft.name, {filters: draft.filters.map(f => f.trim()).filter(Boolean), policy: draft.policy}),
        errors => toast('negative', t('policy.editInvalid', {n: errors})),
        draft.origin
      )
      .then(
        written => {
          if (written) {
            guard.clear();
            toast('positive', t('policy.updated', {name: draft.name}));
            close();
          }
        },
        error => toast('negative', errorText(error))
      );
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
    tip: source.error ? errorText(source.error) : undefined,
    busy: source.busy,
    policy: canonicalPolicy(draft?.policy ?? null),
    choices: policyNames.map(id => ({id, label: id, desc: t(policyKindLabels[id])})),
    filters: (draft?.filters ?? []).map((value, id) => ({
      id,
      value,
      label: t('policy.filterN', {n: id + 1}),
      removeLabel: t('policy.removeFilter', {n: id + 1}),
      change: (value: string) => edit(prev => ({...prev, filters: prev.filters.map((f, i) => (i === id ? value : f))})),
      remove: () => edit(prev => ({...prev, filters: prev.filters.filter((_, i) => i !== id)}))
    })),
    show: () => {
      if (entry && source.main) setDraft({name: entry.name, origin: source.main, policy: entry.policy, filters: entry.filters});
    },
    close: () => {
      guard.clear();
      setDraft(null);
    },
    setPolicy: policy => edit(prev => ({...prev, policy})),
    add: () => edit(prev => ({...prev, filters: [...prev.filters, '']})),
    save
  };
}
