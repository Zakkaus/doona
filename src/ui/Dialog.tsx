import {useDeferredValue, useEffect, useState, type ComponentProps, type ReactElement, type ReactNode} from 'react';
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
  onChange,
  keepMounted
}: {
  label: string;
  items: Array<{id: string; label: string; content: ReactNode}>;
  value: string;
  onChange: (id: string) => void;
  // Keep a panel mounted once opened, hidden while another is chosen, so coming back is instant. For panels that
  // browse data; a panel with drafts or editors unmounts, so nothing of it keeps running out of sight.
  keepMounted?: boolean;
}) {
  // The marker lives beside the TabList, not inside it: anything inside is part of the RAC collection and re-renders the tabs.
  const [ref, pos] = useSlider(value, '[data-selected]');
  // The selected tab and its marker answer the click in the urgent render; a panel opened for the first time (a
  // table of log rows) mounts in the deferred one, so the click never waits for it.
  const shown = useDeferredValue(value);
  // Until a new panel has mounted, the one before it stays on screen in its own panel, neither moved nor remounted:
  // an empty panel for a frame would collapse the page, and a remount would redraw its placeholders. With
  // `keepMounted`, opened panels also stay mounted, hidden, while another is chosen.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([value]));
  const kept = keepMounted ? opened : new Set([shown]);
  if (keepMounted && !opened.has(shown)) setOpened(new Set([...opened, shown]));
  const visible = kept.has(value) ? value : shown;
  return (
    <RTabs className="rp-tabs" selectedKey={value} onSelectionChange={key => onChange(String(key))}>
      <div className="rp-tabbar" ref={ref}>
        {pos && <span className="rp-slider" data-still={pos.still || undefined} style={{left: pos.x, width: pos.w}} />}
        <TabList aria-label={label} className="rp-tablist">
          {items.map(item => (
            <Tab key={item.id} id={item.id} className="rp-tab">
              {item.label}
            </Tab>
          ))}
        </TabList>
      </div>
      {items
        .filter(item => kept.has(item.id) || item.id === shown)
        .map(item => (
          <TabPanel key={item.id} id={item.id} shouldForceMount className="rp-tabpanel" data-shown={item.id === visible || undefined}>
            {item.content}
          </TabPanel>
        ))}
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
