import {Button} from '../../ui/ui';
import type {LifecycleAction} from './view';

export function LifecycleActions({actions}: {actions: LifecycleAction[]}) {
  return (
    <>
      {actions.map(action => (
        <Button key={action.id} isPending={action.pending} isDisabled={action.disabled} onPress={action.run}>
          {action.label}
        </Button>
      ))}
    </>
  );
}
