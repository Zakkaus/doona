import type {ReactNode} from 'react';
import {Button} from './Button';
import {DialogSection} from './Dialog';
import {Switch} from './Fields';

export function ConditionActions({children}: {children: ReactNode}) {
  return <div className="rp-toolbar">{children}</div>;
}

// The condition row layout used by the routing editor: kind, values, then negate and remove.
export function ConditionRow({
  children,
  negate,
  onNegate,
  negateLabel,
  removeLabel,
  onRemove,
  isDisabled,
  removeDisabled
}: {
  children: ReactNode;
  negate: boolean;
  onNegate: (value: boolean) => void;
  negateLabel: string;
  removeLabel: string;
  onRemove: () => void;
  isDisabled?: boolean;
  removeDisabled?: boolean;
}) {
  return (
    <DialogSection>
      {children}
      <ConditionActions>
        <Switch isDisabled={isDisabled} isSelected={negate} onChange={onNegate}>
          {negateLabel}
        </Switch>
        <span className="rp-grow" />
        <Button small isDisabled={isDisabled || removeDisabled} onPress={onRemove}>
          {removeLabel}
        </Button>
      </ConditionActions>
    </DialogSection>
  );
}
