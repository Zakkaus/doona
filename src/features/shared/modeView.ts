import type {Group} from '../../api/model';
import type {Translator as LabelFn} from '../../i18n';
import {sameMode, type OutboundMode} from '../../dae/outboundMode';

export const modeLabels = {rule: 'mode.rule', direct: 'mode.direct', global: 'mode.global'} as const;
export function modeView(
  current: OutboundMode,
  staged: OutboundMode | null,
  groups: Array<Pick<Group, 'name'>>,
  writable: boolean,
  configAvailable: boolean,
  t: LabelFn,
  known = true
) {
  const shown = writable ? (staged ?? current) : current;
  const target = shown.mode === 'global' ? shown.target : ((current.mode === 'global' ? current.target : groups[0]?.name) ?? '');
  return {
    mode: known ? shown.mode : '',
    target: known ? target : '',
    targetText: known ? target || '—' : '—',
    writable,
    dirty: writable && staged !== null && !sameMode(staged, current),
    // Global mode needs a group to send everything to; without one there is nothing valid to write.
    incomplete: shown.mode === 'global' && !target,
    status: t(configAvailable ? 'act.modeReadOnly' : 'act.modeUnavailable'),
    readOnly: configAvailable && !writable,
    modes: (['rule', 'direct', 'global'] as const).map(mode => [mode, t(modeLabels[mode])] as [string, string]),
    targets: groups.map(group => ({id: group.name, label: group.name}))
  };
}
// Why the mode card's Apply and the global target are disabled, each under its own card; an Apply with nothing to apply
// needs no line, the disabled button says so. A read-only backend's status
// already sits beside the mode switch, so only the global target repeats it. Null while they can be used or a change is
// being applied.
export function modeReasons(
  {writable, incomplete, status}: Pick<ReturnType<typeof modeView>, 'writable' | 'incomplete' | 'status'>,
  busy: boolean,
  t: LabelFn
): {mode: string | null; global: string | null} {
  if (busy) return {mode: null, global: null};
  if (!writable) return {mode: null, global: status};
  return {mode: incomplete ? t('act.globalMissing') : null, global: null};
}
