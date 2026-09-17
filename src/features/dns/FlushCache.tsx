import {useT} from '../../i18n';
import {Button, ModalDialog} from '../../ui/ui';

// The flush-everything button with its confirmation; the page it sits on supplies the call.
export function FlushCacheButton({count, busy, isDisabled, onFlush}: {count: number | null; busy: boolean; isDisabled?: boolean; onFlush: () => void}) {
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
      <p>{count === null ? t('dns.flushConfirmAll') : t('dns.flushConfirm', {n: count})}</p>
    </ModalDialog>
  );
}
