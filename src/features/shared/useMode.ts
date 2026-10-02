import {useMemo} from 'react';
import {useCapabilities, useGroups, useVersion} from '../../store';
import {useConfig} from '../../store/config';
import {editProblem, useMainSourceEdit} from '../../store/mainSource';
import {useT} from '../../i18n';
import {toast} from '../../ui/ui';
import {useAction} from '../../store/action';
import {useSharedControl} from '../../store/sharedControl';
import {readMode, writeMode, sameMode, type OutboundMode} from '../../dae/outboundMode';
import {modeLabels, modeReasons, modeView} from './modeView';
import {offered} from '../../api/capabilities';
import {LocalError} from '../../api/error';
import {engineOf} from '../../api/engines';

export function useMode() {
  const t = useT();
  const resources = useCapabilities().data?.resources;
  const groups = useGroups(offered(resources, 'groups', {whileLoading: false}));
  const config = useConfig(offered(resources, 'config', {whileLoading: false}));
  const {main, checking, writable, busy, error, retry, apply: write} = useMainSourceEdit();
  // The mode is a rule doona writes into dae text, so another engine's configuration neither shows nor takes one.
  // Until the version names the engine the card waits as it does for the configuration.
  const version = useVersion().data;
  const daeText = engineOf(version).daeText;
  const content = daeText ? (main ?? config.data?.sources.find(source => source.kind === 'main'))?.content : undefined;
  const current = useMemo<OutboundMode>(() => (content == null ? {mode: 'rule'} : readMode(content)), [content]);
  const [staged, setStaged] = useModeDraft();
  const action = useAction<'apply'>({shared: 'mode-action'});
  const configAvailable = (daeText || !version) && !!resources?.config.available;
  // Each write changes the source, which is then checked again. The card keeps its controls meanwhile instead of
  // flashing the read-only status, so the Apply button a screen reader was just told about stays in place.
  const view = modeView(current, staged, groups.data ?? [], daeText && writable && (!!main || checking), configAvailable, t, content != null);
  const apply = () =>
    action.run('apply', async () => {
      const submitted = staged;
      if (!submitted || (submitted.mode === 'global' && !submitted.target)) return;
      const result = await write(text => writeMode(text, submitted));
      if (result.kind === 'ok') {
        setStaged(current => (current === submitted ? null : current));
        toast('positive', t('act.modeApplied', {mode: t(modeLabels[submitted.mode])}));
      }
      // doona's own refusal is the whole story: its advice leads and the rule in the way is the second line.
      if (result.kind === 'failed' && result.error instanceof LocalError && result.error.key === 'act.modeInterleaved') {
        toast('negative', t(result.error.key), {detail: result.error.detail ?? undefined, error: result.error});
        return;
      }
      const problem = editProblem(result, t);
      if (problem) toast(problem.kind, problem.text, {detail: problem.detail, requestId: problem.requestId, error: problem.error});
    });
  return {
    ...view,
    reasons: modeReasons(view, busy || !!action.busy, t),
    error,
    retry,
    busy: busy || !!action.busy,
    pick: (mode: string) => {
      if (mode === 'global' || mode === 'direct' || mode === 'rule') {
        const next: OutboundMode = mode === 'global' ? {mode, target: view.target} : {mode};
        setStaged(sameMode(next, current) ? null : next);
      }
    },
    pickTarget: (target: string) => {
      const next: OutboundMode = {mode: 'global', target};
      setStaged(sameMode(next, current) ? null : next);
    },
    apply: () => void apply()
  };
}

export const useModeDraft = () => useSharedControl<OutboundMode | null>('mode-draft', null);
