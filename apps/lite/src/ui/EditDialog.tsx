import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Layout, LayoutContent, LayoutFooter, VStack} from '@astryxdesign/core/Layout';
import {useCallback, useEffect, useState, type ReactNode, type RefCallback} from 'react';
import type {Notice} from '../state';
import {Feedback} from '../ui';
import {DialogActions} from './DialogActions';

export function EditDialog({
  title,
  width = 640,
  height,
  open,
  close,
  pending,
  confirm,
  label,
  disabled,
  disabledReason,
  destructive,
  notice,
  children,
  reset,
  dialogRef,
  cancelLabel
}: {
  title: string;
  width?: number;
  height?: string;
  open: boolean;
  close: () => void;
  pending: boolean;
  confirm: () => void;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  notice?: Notice;
  children: ReactNode;
  reset?: () => void;
  dialogRef?: RefCallback<HTMLDialogElement>;
  cancelLabel?: string;
}) {
  // Mount closed before opening so the header cannot replace Astryx's trigger focus.
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(open), [open]);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const attach = useCallback(
    (dialog: HTMLDialogElement | null) => {
      const cleanup = dialogRef?.(dialog);
      if (!dialog) return;
      const closed = () => setMounted(false);
      dialog.addEventListener('close', closed);
      return () => {
        dialog.removeEventListener('close', closed);
        if (typeof cleanup === 'function') cleanup();
        else dialogRef?.(null);
      };
    },
    [dialogRef]
  );
  if (!open && !mounted) return null;
  const dismiss = () => {
    if (!pending) close();
  };
  return (
    <Dialog
      isOpen={open && shown}
      ref={attach}
      onOpenChange={value => {
        if (!value) dismiss();
      }}
      width={width}
      style={height ? {height} : undefined}
      maxHeight="85dvh"
      purpose={pending ? 'required' : 'form'}
    >
      <Layout
        header={<DialogHeader title={title} onOpenChange={pending ? undefined : dismiss} />}
        content={
          <LayoutContent className="lite-dialog-content">
            <VStack gap={4}>
              {children}
              {notice && 'error' in notice && <Feedback notice={notice} />}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <DialogActions
              onReset={reset}
              onCancel={dismiss}
              cancelLabel={cancelLabel}
              confirmLabel={label}
              onConfirm={confirm}
              isPending={pending}
              isCancelDisabled={pending}
              isConfirmDisabled={disabled || pending}
              confirmTooltip={disabledReason}
              variant={destructive ? 'destructive' : 'primary'}
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
