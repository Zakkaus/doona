import {useT} from '../../i18n';
import {Button, ModalDialog} from '../../ui/ui';

export type CloseAllAction = {confirmationText: string; disabled: boolean; pending: boolean; run: () => void};
export function CloseAllButton({confirmationText, disabled, pending, run}: CloseAllAction) {
  const t = useT();
  return (
    <ModalDialog
      title={t('conn.closeAll')}
      narrow
      alert
      trigger={
        <Button negative quiet isDisabled={disabled} isPending={pending}>
          {t('conn.closeAll')}
        </Button>
      }
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button
            negative
            onPress={() => {
              close();
              run();
            }}
          >
            {t('conn.closeAll')}
          </Button>
        </>
      )}
    >
      <span className="rp-label">{confirmationText}</span>
    </ModalDialog>
  );
}
