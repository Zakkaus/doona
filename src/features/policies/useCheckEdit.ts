import {useRef, useState} from 'react';
import {useT} from '../../i18n';
import type {Group, JsonPatch} from '../../api/model';
import {useDraftGuard} from '../../shell/draft';
import {toast} from '../../ui/ui';
import {checkDraft, checkFields, checkInvalid, checkPatch, type CheckDraft, type CheckField} from './view';
export type CheckEditView = {
  title: string;
  open: boolean;
  available: boolean;
  busy: boolean;
  changed: boolean;
  fields: Array<{id: CheckField; label: string; value: string; description: string; error?: string; change: (value: string) => void}>;
  show: () => void;
  close: () => void;
  save: (close: () => void) => void;
};
const labels = {check_url: 'policy.cfg.checkUrl', check_interval: 'policy.cfg.checkInterval'} as const;
const help = {check_url: 'policy.checkUrlHelp', check_interval: 'policy.checkIntervalHelp'} as const;
const invalid = {check_url: 'policy.checkUrlInvalid', check_interval: 'policy.checkIntervalInvalid'} as const;
// The group's check URL and interval, each offered only when the backend lists it as writable.
export function useCheckEdit(g: Group | undefined, patchConfig: (ops: JsonPatch) => Promise<true | undefined>, busy: boolean): CheckEditView {
  const t = useT();
  const [draft, setDraft] = useState<CheckDraft | null>(null);
  // Field errors show once a save was tried, then follow each edit.
  const [tried, setTried] = useState(false);
  const session = useRef(0);
  const fields = g ? checkFields(g) : [];
  const ops = g && draft ? checkPatch(g, draft) : [];
  const reset = () => {
    session.current++;
    setDraft(null);
    setTried(false);
  };
  const guard = useDraftGuard(ops.length > 0, reset);
  const save = (close: () => void) => {
    if (!g || !draft) return;
    setTried(true);
    if (!ops.length || fields.some(field => checkInvalid(field, draft[field]))) return;
    const submitted = session.current;
    void patchConfig(ops).then(saved => {
      if (!saved) return;
      toast('positive', t('policy.updated', {name: g.name}));
      if (session.current === submitted) {
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
      ? fields.map(id => ({
          id,
          label: t(labels[id]),
          value: draft[id],
          description: t(help[id]),
          error: tried && checkInvalid(id, draft[id]) ? t(invalid[id]) : undefined,
          // Edits wait while a save is in flight; what was submitted is what the outcome describes.
          change: (value: string) => {
            if (!busy) setDraft(prev => (prev ? {...prev, [id]: value} : prev));
          }
        }))
      : [],
    show: () => {
      if (!g) return;
      session.current++;
      setTried(false);
      setDraft(checkDraft(g));
    },
    close: () => {
      guard.clear();
      reset();
    },
    save
  };
}
