import type {useConnectionClose} from '../../api/store';
import {useT} from '../../i18n';
import {Button, ModalDialog, errorText, toast} from '../../ui/ui';

// Share the page's closing state with row actions; use bulk close only when the current selection is expressible by that endpoint.
export function CloseAllButton({
  count,
  selection,
  closing,
  onStart
}: {
  count: number;
  selection: Parameters<ReturnType<typeof useConnectionClose>['closeAll']>[0];
  closing: ReturnType<typeof useConnectionClose>;
  onStart?: () => void;
}) {
  const t = useT();
  return (
    <ModalDialog
      title={t('conn.closeAll')}
      narrow
      alert
      trigger={
        <Button negative quiet isDisabled={!count || !!closing.busy} isPending={closing.busy === 'all'}>
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
              void closing.closeAll(selection).then(
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
      <span className="rp-label">{t('conn.closeAllHelp', {n: count})}</span>
    </ModalDialog>
  );
}
