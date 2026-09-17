import type {useConnectionClose} from '../../api/store';
import {useT} from '../../i18n';
import {Button, ModalDialog, errorText, toast} from '../../ui/ui';

// Closes every listed connection one request at a time, behind a confirmation; the tally names what the
// backend did not own and therefore skipped. The page owns `closing`, so its row buttons and this one
// share one busy state.
export function CloseAllButton({ids, closing, onStart}: {ids: string[]; closing: ReturnType<typeof useConnectionClose>; onStart?: () => void}) {
  const t = useT();
  return (
    <ModalDialog
      title={t('conn.closeAll')}
      narrow
      alert
      trigger={
        <Button negative quiet isDisabled={!ids.length || !!closing.busy} isPending={closing.busy === 'all'}>
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
              onStart?.();
              void closing.closeAll(ids).then(
                tally => toast(tally.closed ? 'positive' : 'negative', t('conn.closedAll', {closed: tally.closed, skipped: tally.skipped})),
                (error: unknown) => toast('negative', t('conn.closeFailed', {error: errorText(error)}))
              );
            }}
          >
            {t('conn.closeAll')}
          </Button>
        </>
      )}
    >
      <span className="rp-label">{t('conn.closeAllHelp', {n: ids.length})}</span>
    </ModalDialog>
  );
}
