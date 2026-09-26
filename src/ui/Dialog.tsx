import {createContext, useContext, useDeferredValue, useEffect, useRef, useState, type ComponentProps, type ReactElement, type ReactNode} from 'react';
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
import {errorText} from '../api/error';
import {cx} from './cx';
import {Button} from './Button';
import {InlineAlert} from './Feedback';
import {useSlider, useScrollStrip, useMediaQuery, panelQuery} from './hooks';

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
  hideTitle,
  locked
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
  // Neither the underlay nor Escape closes it: the app behind cannot be used until the dialog is done.
  locked?: boolean;
}) {
  const modal = (
    <ModalOverlay className="rp-underlay" isDismissable={!alert && !locked} isKeyboardDismissDisabled={locked} isOpen={isOpen} onOpenChange={onOpenChange}>
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

// A dialog with Cancel and one action. While the action is pending the dialog stays open and the action button
// waits; Cancel and Escape still work, and `onCancel` must then abandon the action or report its late result
// elsewhere, so a request that never answers cannot hold the page. A failure shows inside the dialog, and a new
// `error.id` moves focus to it again.
export function ConfirmDialog({
  title,
  isOpen,
  onCancel,
  confirmLabel,
  onConfirm,
  tone = 'negative',
  isPending,
  isDisabled,
  error,
  children
}: {
  title: string;
  isOpen: boolean;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: 'negative' | 'accent';
  isPending?: boolean;
  isDisabled?: boolean;
  error?: {id: number; text: string} | null;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <ModalDialog
      title={title}
      narrow
      alert={tone === 'negative'}
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) onCancel();
      }}
      footer={() => (
        <>
          <Button onPress={onCancel}>{t('ui.cancel')}</Button>
          <Button negative={tone === 'negative'} accent={tone === 'accent'} isDisabled={isDisabled} isPending={isPending} onPress={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      {error && (
        <InlineAlert key={error.id} takeFocus>
          {error.text}
        </InlineAlert>
      )}
      {children}
    </ModalDialog>
  );
}

// A negative trigger button and its ConfirmDialog. `onConfirm` resolves to the failure to show, if any; the dialog
// closes once it resolves without one. Cancel or unmounting while it is pending calls `onAbort` and ignores the late
// result. `open`/`setOpen` let a caller act when the dialog opens.
export function ConfirmButton({
  label,
  confirmationText,
  isDisabled,
  isPending,
  onConfirm,
  onAbort,
  open,
  setOpen
}: {
  label: string;
  confirmationText: ReactNode;
  isDisabled?: boolean;
  isPending?: boolean;
  onConfirm: () => Promise<string | null | undefined | void>;
  onAbort?: () => void;
  open?: boolean;
  setOpen?: (open: boolean) => void;
}) {
  const t = useT();
  const [local, setLocal] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{id: number; text: string} | null>(null);
  // Counts failures so a repeated one still moves focus; `attempt` tells the current run from an abandoned one.
  const failures = useRef(0);
  const attempt = useRef(0);
  // Set while a run is pending: invalidates it and calls the `onAbort` it started with.
  const abandon = useRef<(() => void) | null>(null);
  useEffect(() => () => abandon.current?.(), []);
  const isOpen = open ?? local;
  const change = (next: boolean) => {
    setError(null);
    (setOpen ?? setLocal)(next);
  };
  const cancel = () => {
    if (abandon.current) {
      abandon.current();
      setRunning(false);
    }
    change(false);
  };
  const confirm = async () => {
    const current = ++attempt.current;
    abandon.current = () => {
      abandon.current = null;
      attempt.current++;
      onAbort?.();
    };
    setRunning(true);
    setError(null);
    let failure: string | null | undefined | void;
    try {
      failure = await onConfirm();
    } catch (reason) {
      failure = errorText(reason, t);
    }
    if (current !== attempt.current) return;
    abandon.current = null;
    setRunning(false);
    if (failure) setError({id: ++failures.current, text: failure});
    else change(false);
  };
  return (
    <>
      <Button negative quiet isDisabled={isDisabled} isPending={isPending || running} onPress={() => change(true)}>
        {label}
      </Button>
      <ConfirmDialog title={label} confirmLabel={label} isOpen={isOpen} isPending={running} error={error} onCancel={cancel} onConfirm={() => void confirm()}>
        <p className="rp-label">{confirmationText}</p>
      </ConfirmDialog>
    </>
  );
}

// Tabs: the selected key is the caller's (URL-backed); a panel mounts the first time it is selected.
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
  // The marker sits beside the TabList: anything inside it joins the RAC collection and re-renders the tabs.
  const [ref, pos] = useSlider(value, '[data-selected]');
  // On a phone the bar scrolls: the selected tab stays in view and a faded end shows there are more tabs.
  useScrollStrip(ref, value);
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
            <TabShown.Provider value={item.id === visible}>{item.content}</TabShown.Provider>
          </TabPanel>
        ))}
    </RTabs>
  );
}

// Whether the tab panel around a component is the one on screen. A kept panel stays mounted while hidden, so what
// it renders outside itself (a drawer, a document-wide key handler) must follow this rather than its own state.
const TabShown = createContext(true);
export const useTabShown = () => useContext(TabShown);

// The last child of rp-with-panel is a side panel on wide screens and a drawer below the breakpoint.
export function DetailPanel({open, title, onClose, children}: {open: boolean; title: string; onClose: () => void; children: ReactNode}) {
  const t = useT();
  const wide = useMediaQuery(panelQuery);
  const showing = useContext(TabShown) && open;
  // Shown before in this opening: a kept tab coming back brings its drawer back as it was, without the entrance.
  const [was, setWas] = useState({showing, open, seen: false});
  if (was.showing !== showing || was.open !== open) setWas({showing, open, seen: open && (was.seen || was.showing)});
  useEffect(() => {
    if (!showing || !wide) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('[role="dialog"], input, textarea, [role="listbox"], [role="menu"], .rp-toasts'))
        onClose();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [showing, wide, onClose]);
  if (!showing) return null;
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
    <ModalOverlay className={cx('rp-underlay rp-drawer-underlay', was.seen && 'still')} isDismissable isOpen onOpenChange={o => !o && onClose()}>
      <Modal className="rp-modal rp-drawer">
        <Dialog className="rp-dialog" aria-label={title}>
          {head}
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
