/**
 * A dialog footer: 取消 (secondary) followed by the confirm button, end-aligned.
 * Place it in LayoutFooter for dialogs using the library's Layout slots.
 * While the confirm is disabled, its reason shows as text above the buttons on
 * every width (a disabled button takes no tap or focus on touch); the tooltip
 * stays as a desktop extra.
 */
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {useId} from 'react';
import {useMessages} from '../i18n';

export function DialogActions({
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  isConfirmDisabled = false,
  confirmTooltip,
  isPending = false,
  isCancelDisabled = false,
  variant = 'primary',
  label,
  onReset
}: {
  /** Text of the cancel button. */
  cancelLabel?: string;
  /** Closes the dialog without acting. */
  onCancel: () => void;
  /** The verb on the confirm button, such as 儲存 or 升級. */
  confirmLabel: string;
  /** Runs the action. */
  onConfirm: () => void;
  /** Disables the confirm button until the form is valid. */
  isConfirmDisabled?: boolean;
  /** Says why the confirm button is disabled, when validation prevents submission. */
  confirmTooltip?: string;
  /** Shows a spinner on the confirm button while the action runs. */
  isPending?: boolean;
  /** Disables 取消 too, for a write that cannot be called back once sent. */
  isCancelDisabled?: boolean;
  /** `destructive` for an action that deletes or cannot be undone. */
  variant?: 'primary' | 'destructive';
  /** Accessible name of the button group. */
  label?: string;
  onReset?: () => void;
}) {
  const t = useMessages();
  const reasonId = useId();
  const reason = isConfirmDisabled && !isPending ? (confirmTooltip ?? t.completeDialog) : undefined;
  return (
    <VStack gap={2} hAlign="end">
      {reason ? (
        <Text id={reasonId} type="supporting" color="secondary" role="status" aria-live="polite">
          {reason}
        </Text>
      ) : null}
      <HStack hAlign="end" gap={2} wrap="wrap" role="group" aria-label={label ?? t.dialogActions}>
        <>{onReset && <Button label={t.resetOriginal} variant="secondary" isDisabled={isPending} onClick={onReset} />}</>
        <Button label={cancelLabel ?? t.cancel} variant="secondary" isDisabled={isCancelDisabled} onClick={onCancel} />
        <Button
          label={confirmLabel}
          variant={variant}
          isDisabled={isConfirmDisabled}
          isLoading={isPending}
          tooltip={confirmTooltip}
          aria-describedby={reason ? reasonId : undefined}
          onClick={onConfirm}
        />
      </HStack>
    </VStack>
  );
}
