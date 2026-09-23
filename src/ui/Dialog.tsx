import {Fragment, useDeferredValue, useEffect, type ComponentProps, type ReactElement, type ReactNode} from 'react';
import {
  Button as RButton,
  Disclosure as RDisclosure,
  DisclosureGroup as RDisclosureGroup,
  DisclosurePanel,
  Tabs as RTabs,
  TabList,
  Tab,
  TabPanel,
  DialogTrigger,
  Modal,
  ModalOverlay,
  Dialog,
  Heading
} from 'react-aria-components';
import ChevronDown from './icons/ChevronDown';
import Close from './icons/Close';
import {useT} from '../i18n';
import {cx} from './cx';
import {useSlider, useMediaQuery, panelQuery} from './hooks';

export function Disclosure({title, children, ...props}: Omit<ComponentProps<typeof RDisclosure>, 'children'> & {title: string; children: ReactNode}) {
  return (
    <RDisclosure {...props} className="rp-disclosure">
      <Heading level={3}>
        <RButton slot="trigger" className="rp-btn quiet rp-disclosure-trigger">
          <ChevronDown />
          {title}
        </RButton>
      </Heading>
      <DisclosurePanel className="rp-disclosure-panel">
        <div className="rp-disclosure-content">{children}</div>
      </DisclosurePanel>
    </RDisclosure>
  );
}

export function DisclosureGroup({children}: {children: ReactNode}) {
  return (
    <RDisclosureGroup className="rp-col" allowsMultipleExpanded>
      {children}
    </RDisclosureGroup>
  );
}

export function ModalDialog({
  trigger,
  title,
  children,
  footer,
  narrow,
  alert,
  isOpen,
  onOpenChange,
  hideTitle
}: {
  trigger?: ReactElement;
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  footer?: (close: () => void) => ReactNode;
  narrow?: boolean;
  alert?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTitle?: boolean;
}) {
  const modal = (
    <ModalOverlay className="rp-underlay" isDismissable={!alert} isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal className={cx('rp-modal', narrow && 'narrow')}>
        <Dialog className="rp-dialog" role={alert ? 'alertdialog' : 'dialog'} aria-label={hideTitle ? title : undefined}>
          {({close}) => (
            <>
              {!hideTitle && <Heading slot="title">{title}</Heading>}
              {typeof children === 'function' ? children(close) : children}
              {footer && <div className="foot">{footer(close)}</div>}
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
  return trigger ? (
    <DialogTrigger>
      {trigger}
      {modal}
    </DialogTrigger>
  ) : (
    modal
  );
}

// Tabs: the selected key is the caller's (URL-backed), panels render only when selected.
export function Tabs({
  label,
  items,
  value,
  onChange
}: {
  label: string;
  items: Array<{id: string; label: string; content: ReactNode}>;
  value: string;
  onChange: (id: string) => void;
}) {
  // The marker lives beside the TabList, not inside it: anything inside is part of the RAC collection and re-renders the tabs.
  const [ref, pos] = useSlider(value, '[data-selected]');
  // The selected tab and its marker answer the click in the urgent render; a heavy panel (a table of
  // log rows) mounts in the deferred one, so the click never waits for it.
  const shown = useDeferredValue(value);
  // Until the deferred render lands, the panel keeps showing the previous content: an empty panel for one frame would
  // collapse the page and spring back.
  const content = (items.find(item => item.id === shown) ?? items.find(item => item.id === value))?.content;
  return (
    <RTabs className="rp-tabs" selectedKey={value} onSelectionChange={key => onChange(String(key))}>
      <div className="rp-tabbar" ref={ref}>
        {pos && <span className="rp-slider" style={{left: pos.x, width: pos.w}} />}
        <TabList aria-label={label} className="rp-tablist">
          {items.map(item => (
            <Tab key={item.id} id={item.id} className="rp-tab">
              {item.label}
            </Tab>
          ))}
        </TabList>
      </div>
      {/* One panel, whose content is keyed by the tab it belongs to: while the deferred render catches up, the
          previous tab's content stays mounted where it is instead of remounting under the new panel (a remount
          redraws its placeholders for a frame, which reads as the page jumping). */}
      <TabPanel id={value} className="rp-tabpanel">
        <Fragment key={items.some(item => item.id === shown) ? shown : value}>{content}</Fragment>
      </TabPanel>
    </RTabs>
  );
}

// The last child of rp-with-panel is a side panel on wide screens and a drawer below the breakpoint.
export function DetailPanel({open, title, onClose, children}: {open: boolean; title: string; onClose: () => void; children: ReactNode}) {
  const t = useT();
  const wide = useMediaQuery(panelQuery);
  useEffect(() => {
    if (!open || !wide) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('[role="dialog"], input, textarea, [role="listbox"], [role="menu"], .rp-toasts'))
        onClose();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [open, wide, onClose]);
  if (!open) return null;
  const head = (
    <div className="rp-row">
      <h3 className="rp-h3">{title}</h3>
      <RButton className="rp-btn quiet icon close" aria-label={t('close')} onPress={onClose}>
        <Close />
      </RButton>
    </div>
  );
  if (wide)
    return (
      <aside className="rp-panel rp-card" aria-label={title}>
        {head}
        {children}
      </aside>
    );
  return (
    <ModalOverlay className="rp-underlay rp-drawer-underlay" isDismissable isOpen onOpenChange={o => !o && onClose()}>
      <Modal className="rp-modal rp-drawer">
        <Dialog className="rp-dialog" aria-label={title}>
          {head}
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
