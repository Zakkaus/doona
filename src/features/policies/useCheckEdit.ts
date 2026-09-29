import {useState} from 'react';
import {useT} from '../../i18n';
import type {Group, JsonPatch} from '../../api/model';
import {useDialogSession, useDraftGuard} from '../../shell/draft';
import {toast, useLinked} from '../../ui/ui';
import {checkDraft, checkFields, checkInvalid, checkPatch, checkRebase, type CheckEditDraft, type CheckField} from './view';
export type CheckEditView = {
  title: string;
  open: boolean;
  available: boolean;
  busy: boolean;
  changed: boolean;
  // Why Save is disabled, shown under it.
  fields: Array<{id: CheckField; label: string; value: string; description: string; error?: string; change: (value: string) => void}>;
  show: () => void;
  close: () => void;
  save: (close: () => void) => void;
};
const labels = {
  check_url: 'policy.cfg.checkUrl',
  check_interval: 'policy.cfg.checkInterval',
  tolerance: 'policy.cfg.tolerance',
  idle_timeout: 'policy.cfg.idleTimeout'
} as const;
const help = {
  check_url: 'policy.checkUrlHelp',
  check_interval: 'policy.checkIntervalHelp',
  tolerance: 'policy.toleranceHelp',
  idle_timeout: 'policy.idleTimeoutHelp'
} as const;
const invalid = {
  check_url: 'policy.checkUrlInvalid',
  check_interval: 'policy.checkIntervalInvalid',
  tolerance: 'policy.toleranceInvalid',
  idle_timeout: 'policy.idleTimeoutInvalid'
} as const;
// The group's check settings, each offered only when the backend lists it as writable. `conflict`: the last save
// was refused with 409, so the group is read again.
export function useCheckEdit(
  g: Group | undefined,
  patchConfig: (ops: JsonPatch) => Promise<true | undefined>,
  busy: boolean,
  conflict: boolean
): CheckEditView {
  const t = useT();
  // `base` is what the dialog opened with; only fields that differ from it are sent.
  const [draft, setDraft] = useState<CheckEditDraft | null>(null);
  // Field errors show once a save was tried, then follow each edit.
  const [tried, setTried] = useState(false);
  const session = useDialogSession();
  // After a conflict the open dialog tests against the group as read again, instead of values it no longer holds.
  const current = conflict && g ? checkDraft(g) : null;
  useLinked(current && JSON.stringify(current), () => {
    if (current) setDraft(prev => (prev ? checkRebase(prev, current) : prev));
  });
  const fields = g ? checkFields(g) : [];
  const ops = g && draft ? checkPatch(g, draft.base, draft.value) : [];
  const reset = () => {
    session.next();
    setDraft(null);
    setTried(false);
  };
  const guard = useDraftGuard(ops.length > 0, reset);
  const save = (close: () => void) => {
    if (!g || !draft) return;
    setTried(true);
    if (!ops.length || fields.some(field => checkInvalid(field, draft.value[field]))) return;
    const current = session.start();
    void patchConfig(ops).then(saved => {
      if (!saved) return;
      toast('positive', t('policy.updated', {name: g.name}));
      if (current()) {
        guard.clear();
        close();
      }
    });
  };
  return {
    title: t('policy.checkEditTitle', {name: g?.name ?? ''}),
    open: !!draft,
    available: !!draft || fields.length > 0,
    busy,
    changed: ops.length > 0,
    fields: draft
      ? fields.map(id => {
          const theirs = draft.theirs[id];
          return {
            id,
            label: t(labels[id]),
            value: draft.value[id],
            // A value the group took meanwhile replaces the help while the field still differs from it.
            description: theirs !== undefined && theirs !== draft.value[id] ? t('policy.checkChangedElsewhere', {value: theirs || t('ui.none')}) : t(help[id]),
            error: tried && checkInvalid(id, draft.value[id]) ? t(invalid[id]) : undefined,
            // Edits wait while a save is in flight; what was submitted is what the outcome describes.
            change: (value: string) => {
              if (!busy) setDraft(prev => (prev ? {...prev, value: {...prev.value, [id]: value}} : prev));
            }
          };
        })
      : [],
    show: () => {
      if (!g) return;
      session.next();
      setTried(false);
      const base = checkDraft(g);
      setDraft({base, value: base, theirs: {}});
    },
    close: () => {
      guard.clear();
      reset();
    },
    save
  };
}
