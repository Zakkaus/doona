import type {Capabilities, Runtime} from '../../api/model';
import {operationLabels} from '../../api/selectors';
import {useT} from '../../i18n';
import {useRuntimeOperations} from '../../store';
import {toast, toastFailure} from '../../ui/ui';
import {lifecycleActions} from './lifecycle';

// Runs lifecycle operations and reports each outcome in a toast. The overview, the settings page and the top bar's
// reload button share it.
export function useLifecycle(runtime: Runtime | undefined, capabilities: Capabilities | undefined, refetch: () => void) {
  const t = useT();
  const operations = useRuntimeOperations(runtime, capabilities, refetch);
  const run = (kind: keyof typeof operationLabels) =>
    void operations.run(kind).then(
      result => {
        if (result) toast('positive', t('ov.operationResult', {action: t(operationLabels[kind]), status: t('ov.succeeded'), id: result.operation_id}));
      },
      error => toastFailure(error, t, t('ov.operationError'))
    );
  return {canRun: operations.canRun, busy: operations.busy, run, actions: lifecycleActions(operations.canRun, operations.busy, run, t)};
}
