import {useState} from 'react';
import {useT} from '../../i18n';
import {Button, ModalDialog} from '../../ui/ui';

type CloseAllAction = {confirmationText: string; disabled: boolean; pending: boolean; run: () => void; open?: boolean; setOpen?: (open: boolean) => void};
// One open state only: a DialogTrigger around a controlled dialog keeps a second one that never closes. The
// connections page controls it to snapshot the selection on open; other callers leave it local.
export function CloseAllButton({confirmationText, disabled, pending, run, open, setOpen}: CloseAllAction) {
  const t = useT();
  const [local, setLocal] = useState(false);
  const isOpen = open ?? local;
  const change = setOpen ?? setLocal;
  return (
    <>
      <Button negative quiet isDisabled={disabled} isPending={pending} onPress={() => change(true)}>
        {t('conn.closeAll')}
      </Button>
      <ModalDialog
        title={t('conn.closeAll')}
        narrow
        alert
        isOpen={isOpen}
        onOpenChange={change}
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
    </>
  );
}
