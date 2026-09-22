import {useMemo, useState} from 'react';
import {useCapabilities, useGroups} from '../../store';
import {useMainSourceEdit} from '../config/mainSource';
import {useT} from '../../i18n';
import {toast, useLinked} from '../../ui/ui';
import {useDraftGuard} from '../config/useDraftGuard';
import {readMode, writeMode, type OutboundMode} from './mode';
import {modeLabels, modeView} from './view';
import {errorText} from '../../api/error';

export function useMode() {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(resources?.groups.available === true);
  const {main, writable, busy, error, apply: write} = useMainSourceEdit();
  const content = main?.content;
  const current = useMemo<OutboundMode>(() => (content == null ? {mode: 'rule'} : readMode(content)), [content]);
  const [staged, setStaged] = useState<OutboundMode | null>(null);
  const view = modeView(current, staged, groups.data ?? [], writable && !!main, !!resources?.config.available, t);
  const guard = useDraftGuard(view.dirty);
  useLinked(guard.revision, () => setStaged(null));
  const apply = async () => {
    if (!staged || view.incomplete) return;
    const submitted = staged;
    try {
      const written = await write(
        text => writeMode(text, submitted),
        errors => toast('negative', t('act.modeInvalid', {n: errors}))
      );
      if (written) {
        guard.clear();
        setStaged(current => (current === submitted ? null : current));
        toast('positive', t('act.modeApplied', {mode: t(modeLabels[submitted.mode])}));
      }
    } catch (error) {
      toast('negative', errorText(error, t));
    }
  };
  return {
    ...view,
    error,
    busy,
    pick: (mode: string) => {
      if (mode === 'global') setStaged({mode, target: view.target});
      else if (mode === 'direct' || mode === 'rule') setStaged({mode});
    },
    pickTarget: (target: string) => setStaged({mode: 'global', target}),
    apply: () => void apply()
  };
}
