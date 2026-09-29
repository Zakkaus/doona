import type {ReactNode} from 'react';
import {Menu, MenuItem, Text} from 'react-aria-components';
import MoreVertical from './icons/MoreVertical';
import {useT} from '../i18n';
import {Button} from './Button';
import {MenuButton} from './Select';
import {cx} from './cx';

export type Action = {
  id: string;
  label: string;
  icon?: ReactNode;
  onAction: () => void;
  isDisabled?: boolean;
  isPending?: boolean;
  // Why a disabled action cannot run: the button's tip in the toolbar, the item's description in a menu.
  reason?: string;
  // A destructive action, which the caller puts last.
  negative?: boolean;
};

const ActionButton = ({action}: {action: Action}) => (
  <Button isDisabled={action.isDisabled} isPending={action.isPending} tip={action.reason} onPress={action.onAction}>
    {action.icon}
    {action.label}
  </Button>
);

// A page's actions, after S2's ActionGroup with overflowMode="collapse": below the side navigation's breakpoint the
// first stays a button and the rest move into a trailing menu, so a toolbar does not grow a row of buttons on a
// phone. At the breakpoint and above they are plain buttons in the parent's flow. With overflowMode="wrap" they stay
// buttons at every width and the parent wraps them, for a card whose actions are its content.
export function ActionGroup({actions, overflowMode = 'collapse'}: {actions: Action[]; overflowMode?: 'collapse' | 'wrap'}) {
  if (overflowMode === 'wrap')
    return (
      <>
        {actions.map(action => (
          <ActionButton key={action.id} action={action} />
        ))}
      </>
    );
  const [first, ...rest] = actions;
  if (!first) return null;
  return (
    <>
      <ActionButton action={first} />
      {rest.length > 0 && (
        <>
          <span className="rp-wide-only">
            {rest.map(action => (
              <ActionButton key={action.id} action={action} />
            ))}
          </span>
          <span className="rp-narrow-only">
            <MoreMenu actions={rest} />
          </span>
        </>
      )}
    </>
  );
}

// The menu a MoreMenu opens. A disabled item keeps its reason as its description, the way a disabled button names its
// ActionHelp line.
export function MoreActionsList({actions, label}: {actions: Action[]; label: string}) {
  return (
    <Menu
      aria-label={label}
      disabledKeys={actions.filter(action => action.isDisabled || action.isPending).map(action => action.id)}
      onAction={key => actions.find(action => action.id === key)?.onAction()}
    >
      {actions.map(action => (
        <MenuItem key={action.id} id={action.id} className={cx('rp-item plain', action.negative && 'negative')} textValue={action.label}>
          <span className="rp-item-text">
            <Text slot="label">{action.label}</Text>
            {action.isDisabled && action.reason && (
              <Text slot="description" className="desc reason">
                {action.reason}
              </Text>
            )}
          </span>
        </MenuItem>
      ))}
    </Menu>
  );
}

// A panel's secondary actions, in a trailing menu after its one primary button, as S2's ActionMenu. The caller puts a
// destructive action last. A row of a table passes a label naming the row, and the small quiet look of its other
// buttons.
export function MoreMenu({actions, label, small, quiet}: {actions: Action[]; label?: string; small?: boolean; quiet?: boolean}) {
  const t = useT();
  const name = label ?? t('ui.moreActions');
  if (actions.length === 0) return null;
  return (
    <MenuButton chevron={false} small={small} quiet={quiet} label={name} content={<MoreActionsList actions={actions} label={name} />}>
      <MoreVertical />
    </MenuButton>
  );
}
