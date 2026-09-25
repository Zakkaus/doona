import {useMemo, useState} from 'react';
import {useCapabilities, useGroups} from '../../store';
import {useConfig} from '../../store/config';
import {editProblem, useMainSourceEdit} from '../../store/mainSource';
import {useT} from '../../i18n';
import {toast} from '../../ui/ui';
import {useDraftGuard} from '../../shell/draft';
import {readMode, writeMode, type OutboundMode} from './mode';
import {modeLabels, modeView} from './view';
import {offered} from '../../api/capabilities';

export function useMode() {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const {main, writable, busy, error, retry, apply: write} = useMainSourceEdit();
  const content = (main ?? config.data?.sources.find(source => source.kind === 'main'))?.content;
  const current = useMemo<OutboundMode>(() => (content == null ? {mode: 'rule'} : readMode(content)), [content]);
  const [staged, setStaged] = useState<OutboundMode | null>(null);
  const view = modeView(current, staged, groups.data ?? [], writable && !!main, !!resources?.config.available, t, content != null);
  const guard = useDraftGuard(view.dirty, () => setStaged(null));
  const apply = async () => {
    if (!staged || view.incomplete) return;
    const submitted = staged;
    const result = await write(text => writeMode(text, submitted));
    if (result.kind === 'ok') {
      guard.clear();
      setStaged(current => (current === submitted ? null : current));
      toast('positive', t('act.modeApplied', {mode: t(modeLabels[submitted.mode])}));
    }
    const problem = editProblem(result, t);
    if (problem) toast(problem.kind, problem.text);
  };
  return {
    ...view,
    error,
    retry,
    busy,
    pick: (mode: string) => {
      if (mode === 'global') setStaged({mode, target: view.target});
      else if (mode === 'direct' || mode === 'rule') setStaged({mode});
    },
    pickTarget: (target: string) => setStaged({mode: 'global', target}),
    apply: () => void apply()
  };
}
