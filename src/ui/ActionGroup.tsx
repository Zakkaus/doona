import type {ReactNode} from 'react';
import {Menu, MenuItem} from 'react-aria-components';
import MoreVertical from './icons/MoreVertical';
import {useT} from '../i18n';
import {Button} from './Button';
import {MenuButton} from './Select';

export type Action = {id: string; label: string; icon?: ReactNode; onAction: () => void; isDisabled?: boolean; isPending?: boolean};

const ActionButton = ({action}: {action: Action}) => (
  <Button isDisabled={action.isDisabled} isPending={action.isPending} onPress={action.onAction}>
    {action.icon}
    {action.label}
  </Button>
);

// A page's actions, after S2's ActionGroup with overflowMode="collapse": below the side navigation's breakpoint the
// first stays a button and the rest move into a trailing menu, so a toolbar does not grow a row of buttons on a
// phone. At the breakpoint and above they are plain buttons in the parent's flow. With overflowMode="wrap" they stay
// buttons at every width and the parent wraps them, for a card whose actions are its content.
export function ActionGroup({actions, overflowMode = 'collapse'}: {actions: Action[]; overflowMode?: 'collapse' | 'wrap'}) {
  const t = useT();
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
            <MenuButton
              chevron={false}
              label={t('ui.moreActions')}
              content={
                <Menu
                  aria-label={t('ui.moreActions')}
                  disabledKeys={rest.filter(action => action.isDisabled || action.isPending).map(action => action.id)}
                  onAction={key => rest.find(action => action.id === key)?.onAction()}
                >
                  {rest.map(action => (
                    <MenuItem key={action.id} id={action.id} className="rp-item plain" textValue={action.label}>
                      {action.label}
                    </MenuItem>
                  ))}
                </Menu>
              }
            >
              <MoreVertical />
            </MenuButton>
          </span>
        </>
      )}
    </>
  );
}
