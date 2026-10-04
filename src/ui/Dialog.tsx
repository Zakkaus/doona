import {useEffect, useId, useRef, useState, type ComponentProps, type ReactElement, type ReactNode, type RefObject} from 'react';
import {Button as RButton, DialogTrigger, Modal, ModalOverlay, Dialog, Heading, Text, Popover, type PopoverProps} from 'react-aria-components';
import {useTabShown} from './useTabShown';
import Close from './icons/Close';
import {useT} from '../i18n';
import {errorText} from '../api/error';
import {cx} from './cx';
import {ActionHelp, Button} from './Button';
import {ProblemAlert, type Problem} from './Feedback';
import {useMediaQuery, panelQuery, escapeLayers} from './hooks';
import {ControlSizeContext} from './controlSize';

export function ModalDialog({
  trigger,
  title,
  titleHelp,
  description,
  children,
  footer,
  narrow,
  size,
  alert,
  isOpen,
  onOpenChange,
  hideTitle,
  locked,
  reason,
  scrollBody
}: {
  trigger?: ReactElement;
  title: string;
  titleHelp?: ReactNode;
  description?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  footer?: (close: () => void) => ReactNode;
  narrow?: boolean;
  size?: 'large' | 'wide';
  alert?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTitle?: boolean;
  // Neither the underlay nor Escape closes it: the app behind cannot be used until the dialog is done.
  locked?: boolean;
  // Why the footer's disabled actions cannot run.
  reason?: string | null;
  // S2's dialog anatomy for long content: only the content scrolls, between a title and a footer that stay in view.
  scrollBody?: boolean;
}) {
  const descriptionId = useId();
  const help = description && (
    <Text slot="description" id={descriptionId} className="rp-label">
      {description}
    </Text>
  );
  const overlay = (
    <ModalOverlay
      className="rp-underlay"
      data-size={size}
      isDismissable={!alert && !locked}
      isKeyboardDismissDisabled={locked}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal className={cx('rp-modal', narrow && 'narrow')} data-size={size}>
        <Dialog
          className={cx('rp-dialog', scrollBody && 'split')}
          role={alert ? 'alertdialog' : 'dialog'}
          aria-label={hideTitle ? title : undefined}
          aria-describedby={description ? descriptionId : undefined}
        >
          {({close}) => (
            <ActionHelp reason={footer ? reason : null}>
              {!hideTitle &&
                (titleHelp ? (
                  <div className="rp-help-row">
                    <Heading slot="title">{title}</Heading>
                    {titleHelp}
                  </div>
                ) : (
                  <Heading slot="title">{title}</Heading>
                ))}
              {!scrollBody && help}
              {scrollBody ? (
                <ScrollBody>
                  {help}
                  {typeof children === 'function' ? children(close) : children}
                </ScrollBody>
              ) : typeof children === 'function' ? (
                children(close)
              ) : (
                children
              )}
              {footer && <div className="foot">{footer(close)}</div>}
            </ActionHelp>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
  // Its controls are M even when the trigger sits in an L page toolbar.
  const modal = <ControlSizeContext value={null}>{overlay}</ControlSizeContext>;
  return trigger ? (
    <DialogTrigger>
      {trigger}
      {modal}
    </DialogTrigger>
  ) : (
    modal
  );
}

export function DialogForm({children, ...props}: Omit<ComponentProps<'form'>, 'className'>) {
  return (
    <form {...props} className="rp-dialog-sections">
      {children}
    </form>
  );
}

// A dialog's content in sections: a section's own lines sit closer together than the sections do, as in S2's dialogs,
// so headings and spacing set them apart without dividers.
export function DialogSections({children}: {children: ReactNode}) {
  return <div className="rp-dialog-sections">{children}</div>;
}

export function DialogSection({title, children}: {title?: string | null; children: ReactNode}) {
  const id = useId();
  return (
    <section className="rp-dialog-section" aria-labelledby={title ? id : undefined}>
      {title && (
        <Heading level={3} id={id} className="rp-label">
          {title}
        </Heading>
      )}
      {children}
    </section>
  );
}

// A dialog's scrolling content. While it overflows, dividers set it off from the title and the footer, as in S2.
function ScrollBody({children}: {children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const body = ref.current;
    if (!body) return;
    const measure = () => setOverflows(body.scrollHeight > body.clientHeight + 1);
    // The body's own size stops changing at the dialog's height cap, so its content is watched as well.
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The scrolling content needs keyboard focus to scroll.
    <div ref={ref} className="rp-dialog-body" data-overflow={overflows || undefined} tabIndex={0}>
      <div className="rp-dialog-content">{children}</div>
    </div>
  );
}

// A titled dialog in a popover beside its trigger, after S2's DialogTrigger with type="popover": no underlay, and
// Escape or a press outside closes it. Without `trigger` it opens beside `triggerRef` while `isOpen`, for a caller
// whose control is a menu row that is gone once the menu closes. With `label` in place of `title` it is a note: a few
// paragraphs of running text named by the label, with no heading, for a status whose trigger already asks the question.
export function PopoverDialog({
  trigger,
  triggerRef,
  isOpen,
  onOpenChange,
  title,
  label,
  subtitle,
  placement = 'top start',
  boundaryElement,
  children
}: {
  placement?: PopoverProps['placement'];
  boundaryElement?: PopoverProps['boundaryElement'];
  children: (close: () => void) => ReactNode;
} & (
  | {
      title: string;
      // A line under the title, such as a status.
      subtitle?: ReactNode;
      label?: never;
    }
  | {label: string; title?: never; subtitle?: never}
) &
  (
    | {trigger: ReactElement; triggerRef?: never; isOpen?: never; onOpenChange?: never}
    | {trigger?: never; triggerRef: RefObject<Element | null>; isOpen: boolean; onOpenChange: (open: boolean) => void}
  )) {
  const surface = (
    <Popover
      boundaryElement={boundaryElement}
      style={() => (boundaryElement ? {maxWidth: boundaryElement.clientWidth - 24} : undefined)}
      className={title ? 'rp-popover rp-popover-dialog' : 'rp-popover'}
      placement={placement}
      {...(trigger ? {} : {triggerRef, isOpen, onOpenChange})}
    >
      {title ? (
        <Dialog className="rp-popover-body">
          {({close}) => (
            <>
              <div className="rp-popover-head">
                <Heading slot="title">{title}</Heading>
                {subtitle}
              </div>
              {children(close)}
            </>
          )}
        </Dialog>
      ) : (
        <Dialog className="rp-popover-note" aria-label={label}>
          {({close}) => children(close)}
        </Dialog>
      )}
    </Popover>
  );
  const popover = <ControlSizeContext value={null}>{surface}</ControlSizeContext>;
  return trigger ? (
    <DialogTrigger>
      {trigger}
      {popover}
    </DialogTrigger>
  ) : (
    popover
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
  dismissOnly,
  reason,
  error,
  scrollBody,
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
  // The action is not offered: the footer holds one Close button instead of Cancel and Confirm.
  dismissOnly?: boolean;
  // Why Confirm is disabled, shown in its tooltip.
  reason?: string | null;
  error?: Problem | null;
  scrollBody?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <ModalDialog
      title={title}
      narrow
      scrollBody={scrollBody}
      alert={tone === 'negative'}
      isOpen={isOpen}
      reason={reason}
      onOpenChange={open => {
        if (!open) onCancel();
      }}
      footer={() =>
        dismissOnly ? (
          <Button onPress={onCancel}>{t('ui.close')}</Button>
        ) : (
          <>
            <Button onPress={onCancel}>{t('ui.cancel')}</Button>
            <Button negative={tone === 'negative'} accent={tone === 'accent'} isDisabled={isDisabled} isPending={isPending} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </>
        )
      }
    >
      {error && <ProblemAlert key={error.id} problem={error} />}
      {children}
    </ModalDialog>
  );
}

// A negative trigger button and its ConfirmDialog. `onConfirm` resolves to the failure to show, if any; the dialog
// closes once it resolves without one. Cancel or unmounting while it is pending calls `onAbort` and ignores the late
// result. `open`/`setOpen` let a caller act when the dialog opens. `details` sits under the sentence, in a dialog whose
// body scrolls.
export function ConfirmButton({
  label,
  confirmationText,
  details,
  isDisabled,
  isPending,
  onConfirm,
  onAbort,
  open,
  setOpen
}: {
  label: string;
  confirmationText: ReactNode;
  details?: ReactNode;
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
      <ConfirmDialog
        title={label}
        confirmLabel={label}
        isOpen={isOpen}
        isPending={running}
        error={error}
        scrollBody={!!details}
        onCancel={cancel}
        onConfirm={() => void confirm()}
      >
        <p className="rp-label">{confirmationText}</p>
        {details}
      </ConfirmDialog>
    </>
  );
}

// The last child of rp-with-panel is a side panel on wide screens and a drawer below the breakpoint.
export function DetailPanel({
  open,
  title,
  icon,
  onClose,
  actions,
  fit = false,
  children
}: {
  open: boolean;
  title: string;
  // A status mark before the title, such as a light.
  icon?: ReactNode;
  // The drawer is its content's height, up to the full height, rather than always full height.
  fit?: boolean;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const wide = useMediaQuery(panelQuery);
  const showing = useTabShown() && open;
  // Shown before in this opening: a kept tab coming back brings its drawer back as it was, without the entrance.
  const [was, setWas] = useState({showing, open, seen: false});
  if (was.showing !== showing || was.open !== open) setWas({showing, open, seen: open && (was.seen || was.showing)});
  useEffect(() => {
    if (!showing || !wide) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest(`${escapeLayers}, input, textarea, [role="listbox"], [role="menu"], .rp-toasts`))
        onClose();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [showing, wide, onClose]);
  if (!showing) return null;
  const close = (
    <RButton className="rp-btn quiet icon close" aria-label={t('ui.close')} onPress={onClose}>
      <Close />
    </RButton>
  );
  // A panel's own actions sit with its close button, one kit gap apart.
  const head = (
    <div className="rp-row">
      <h2 className={icon ? 'rp-h3 rp-title-icon' : 'rp-h3'}>
        {icon}
        {title}
      </h2>
      {actions ? (
        <span className="rp-cluster">
          {actions}
          {close}
        </span>
      ) : (
        close
      )}
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
      <Modal className={cx('rp-modal rp-drawer', fit && 'rp-drawer-fit')}>
        <Dialog className="rp-dialog" aria-label={title}>
          {head}
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
