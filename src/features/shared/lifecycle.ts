import {operationLabels} from '../../api/selectors';
import type {Translator} from '../../i18n';
import type {Action} from '../../ui/ActionGroup';

export function lifecycleActions(
  canRun: (kind: keyof typeof operationLabels) => boolean,
  busy: string | null,
  run: (kind: keyof typeof operationLabels) => void,
  t: Translator
): Action[] {
  return (Object.keys(operationLabels) as Array<keyof typeof operationLabels>)
    .filter(kind => canRun(kind) || busy === kind)
    .map(kind => ({id: kind, label: t(operationLabels[kind]), isPending: busy === kind, isDisabled: !!busy, onAction: () => run(kind)}));
}
