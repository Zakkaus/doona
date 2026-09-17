import {useRuntime, useRuntimeOperations} from '../../api/store';
import type {Capabilities} from '../../api/model';
import {useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {Button, errorText, toast} from '../../ui/ui';

const operationLabels: Record<'reload' | 'suspend' | 'resume', Key> = {reload: 'ov.reload', suspend: 'ov.suspend', resume: 'ov.resume'};

// Reload, and suspend or resume depending on the engine's state; each runs as an operation and reports the
// terminal status in a toast. Renders nothing the backend cannot do. The page owns the runtime resource, so
// the refetch after an operation reaches what the page shows.
export function LifecycleActions({runtime, capabilities}: {runtime: ReturnType<typeof useRuntime>; capabilities: Capabilities | undefined}) {
  const t = useT();
  const operations = useRuntimeOperations(runtime.data, capabilities, runtime.refetch);
  const run = async (kind: 'reload' | 'suspend' | 'resume') => {
    try {
      const result = await operations.run(kind);
      if (result)
        toast(
          result.status === 'succeeded' ? 'positive' : 'negative',
          t('ov.operationResult', {
            action: t(operationLabels[kind]),
            status: t(result.status === 'succeeded' ? 'ov.succeeded' : 'ov.failed'),
            id: result.operation_id
          })
        );
    } catch (error) {
      toast('negative', t('ov.operationError', {error: errorText(error)}));
    }
  };
  return (
    <>
      {(['reload', 'suspend', 'resume'] as const)
        .filter(kind => operations.canRun(kind) || operations.busy === kind)
        .map(kind => (
          <Button key={kind} secondary isPending={operations.busy === kind} isDisabled={!!operations.busy} onPress={() => void run(kind)}>
            {t(operationLabels[kind])}
          </Button>
        ))}
    </>
  );
}
