import {useRef, useState} from 'react';
import {useT} from '../../i18n';
import {writeGroupEntry, type GroupEntry} from '../../dae/groups';
import {policies} from '../../dae/vocab';
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
  policyHint: string;
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
  const guard = useDraftGuard(!!draft && (draft.policy !== entry?.policy || JSON.stringify(draft.filters) !== JSON.stringify(entry?.filters)));
  useLinked(guard.revision, () => {
    session.current++;
    setDraft(null);
  });
  const save = (close: () => void) => {
    if (!draft) return;
    const submitted = session.current;
    void source
      .apply(
        text => writeGroupEntry(text, draft.name, {filters: draft.filters.map(f => f.trim()).filter(Boolean), policy: draft.policy}),
        errors => toast('negative', t('policy.editInvalid', {n: errors})),
        draft.origin
      )
      .then(
        written => {
          if (written) {
            if (session.current === submitted) {
              guard.clear();
              close();
            }
            toast('positive', t('policy.updated', {name: draft.name}));
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
    policy: draft?.policy ?? '',
    policyHint: policies.join(', '),
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
      if (entry && source.main) setDraft({name: entry.name, origin: source.main, policy: entry.policy, filters: entry.filters});
    },
    close: () => {
      session.current++;
      guard.clear();
      setDraft(null);
    },
    setPolicy: policy => edit(prev => ({...prev, policy: policy || null})),
    add: () => edit(prev => ({...prev, filters: [...prev.filters, '']})),
    save
  };
}
