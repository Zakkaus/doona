import {useState} from 'react';
import {Button as RButton, Dialog, DialogTrigger, Link as RLink, Modal, ModalOverlay} from 'react-aria-components';
import Close from '../ui/icons/Close';
import More from '../ui/icons/More';
import {useT} from '../i18n';
import {useSlider} from '../ui/hooks';
import {SideNav} from './SideNav';
import type {ShellView} from './view';

type BottomNavProps = Pick<ShellView, 'bar' | 'groups' | 'busy' | 'engine'> & {route: string};

// Below the side navigation's breakpoint: four pages under the thumb, and every page, in the desktop's SideNav, in a
// drawer behind More.
export function BottomNav({bar, groups, busy, engine, route}: BottomNavProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Back or a shortcut can change the page while the drawer is open; the drawer closes with it.
  const [openedOn, setOpenedOn] = useState(route);
  if (openedOn !== route) {
    setOpenedOn(route);
    setOpen(false);
  }
  return (
    <nav className="rp-bottomnav" aria-label={t('pages')}>
      {bar.map(item => (
        <RLink
          key={item.id}
          href={item.href}
          aria-current={item.current ? 'page' : undefined}
          data-unavailable={item.unavailable ? '' : undefined}
          aria-description={item.description}
        >
          <item.Icon />
          <span>{item.label}</span>
        </RLink>
      ))}
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <RButton data-current={bar.some(item => item.current) ? undefined : ''}>
          <More />
          <span>{t('more')}</span>
        </RButton>
        <ModalOverlay className="rp-underlay rp-drawer-underlay" isDismissable>
          <Modal className="rp-modal rp-drawer rp-navdrawer">
            {/* A link closes the drawer even when it names the open page or a draft holds the navigation back. */}
            <Dialog className="rp-dialog" aria-label={t('pages')} onClick={event => (event.target as Element).closest('a') && setOpen(false)}>
              <RButton slot="close" className="rp-btn quiet icon close" aria-label={t('close')}>
                <Close />
              </RButton>
              <DrawerNav groups={groups} busy={busy} engine={engine} route={route} />
            </Dialog>
          </Modal>
        </ModalOverlay>
      </DialogTrigger>
    </nav>
  );
}

function DrawerNav({groups, busy, engine, route}: Omit<BottomNavProps, 'bar'>) {
  const [navRef, pos] = useSlider(route, '[aria-current="page"]');
  return <SideNav groups={groups} busy={busy} engine={engine} navRef={navRef} navStyle={pos ? {translate: `0 ${pos.y}px`, height: pos.h} : undefined} />;
}
