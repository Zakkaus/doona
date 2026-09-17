import {useCapabilities, useRuntimeMode} from '../../api/store';
import {useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {Light, Segmented, errorText, toast} from '../../ui/ui';

export const modeLabels: Record<string, Key> = {rule: 'mode.rule', global: 'mode.global', direct: 'mode.direct'};
const order = ['rule', 'global', 'direct'] as const;

// The engine's outbound mode as one segmented control: rule, global through `target`, or direct. Offers only
// the modes the backend advertises; without the resource it says so instead of pretending to switch.
export function ModeSwitch({target}: {target: string}) {
  const t = useT();
  const resource = useCapabilities().data?.resources.runtime_mode;
  const runtimeMode = useRuntimeMode(resource?.available === true);
  if (!resource?.available)
    return (
      <Light small tone="muted">
        {t('act.modeUnavailable')}
      </Light>
    );
  const modes = order.filter(mode => (resource.modes ?? ['rule']).includes(mode));
  return (
    <Segmented
      label={t('act.mode')}
      value={runtimeMode.data?.mode ?? 'rule'}
      onChange={next => {
        if (!modes.includes(next as (typeof order)[number])) return;
        void runtimeMode.change(next === 'global' ? {mode: 'global', target} : {mode: next as 'rule' | 'direct'}).then(
          result => toast('positive', t('act.modeChanged', {mode: t(modeLabels[result.mode])})),
          (error: unknown) => toast('negative', errorText(error))
        );
      }}
      items={modes.map(mode => [mode, t(modeLabels[mode])])}
    />
  );
}
