import {useT} from '../../i18n';
import {ConfirmDialog} from '../../ui/ui';

// Reloading honk rereads its files, so the top bar and the overview both ask first, in the same words.
export function ReloadConfirm({
  isOpen,
  onCancel,
  onConfirm,
  isPending,
  isDisabled
}: {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isPending?: boolean;
  isDisabled?: boolean;
}) {
  const t = useT();
  return (
    <ConfirmDialog
      title={t('shell.reloadTitle')}
      tone="accent"
      isOpen={isOpen}
      onCancel={onCancel}
      confirmLabel={t('shell.reloadEngine')}
      isPending={isPending}
      isDisabled={isDisabled}
      onConfirm={onConfirm}
    >
      <p className="rp-label">{t('shell.reloadHelp')}</p>
    </ConfirmDialog>
  );
}
