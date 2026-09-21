import {useRuntime, useRuntimeOperations} from '../../api/store';
import type {Capabilities} from '../../api/model';
import {useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {Button, errorText, toast} from '../../ui/ui';

const operationLabels: Record<'reload' | 'suspend' | 'resume', Key> = {reload: 'ov.reload', suspend: 'ov.suspend', resume: 'ov.resume'};

// Render only supported lifecycle operations and refetch the page-owned runtime resource after completion.
export function LifecycleActions({runtime, capabilities}: {runtime: ReturnType<typeof useRuntime>; capabilities: Capabilities | undefined}) {
  const t = useT();
  const operations = useRuntimeOperations(runtime.data, capabilities, runtime.refetch);
  const run = async (kind: 'reload' | 'suspend' | 'resume') => {
    try {
      const result = await operations.run(kind);
      if (result) toast('positive', t('ov.operationResult', {action: t(operationLabels[kind]), status: t('ov.succeeded'), id: result.operation_id}));
    } catch (error) {
      toast('negative', t('ov.operationError', {error: errorText(error)}));
    }
  };
  return (
    <>
      {(['reload', 'suspend', 'resume'] as const)
        .filter(kind => operations.canRun(kind) || operations.busy === kind)
        .map(kind => (
          <Button key={kind} isPending={operations.busy === kind} isDisabled={!!operations.busy} onPress={() => void run(kind)}>
            {t(operationLabels[kind])}
          </Button>
        ))}
    </>
  );
}
