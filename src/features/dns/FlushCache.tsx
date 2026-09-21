import {useT} from '../../i18n';
import {Button, ModalDialog} from '../../ui/ui';

export function FlushCacheButton({
  confirmationText,
  busy,
  isDisabled,
  onFlush
}: {
  confirmationText: string;
  busy: boolean;
  isDisabled?: boolean;
  onFlush: () => void;
}) {
  const t = useT();
  return (
    <ModalDialog
      alert
      narrow
      title={t('dns.flushAll')}
      trigger={
        <Button negative quiet isPending={busy} isDisabled={busy || isDisabled}>
          {t('dns.flushAll')}
        </Button>
      }
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button
            negative
            onPress={() => {
              close();
              onFlush();
            }}
          >
            {t('dns.flushAll')}
          </Button>
        </>
      )}
    >
      <p>{confirmationText}</p>
    </ModalDialog>
  );
}
