import {Button, type Action} from '../../ui/ui';

export function LifecycleActions({actions}: {actions: Action[]}) {
  return (
    <>
      {actions.map(action => (
        <Button key={action.id} isPending={action.isPending} isDisabled={action.isDisabled} onPress={action.onAction}>
          {action.label}
        </Button>
      ))}
    </>
  );
}
