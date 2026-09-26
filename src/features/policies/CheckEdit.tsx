import {useT} from '../../i18n';
import {Button, ModalDialog, TextField} from '../../ui/ui';
import type {CheckEditView} from './useCheckEdit';
export function CheckEdit({model: m}: {model: CheckEditView}) {
  const t = useT();
  return (
    <ModalDialog
      title={m.title}
      narrow
      isOpen={m.open}
      onOpenChange={open => {
        if (!open) m.close();
      }}
      trigger={
        m.available ? (
          <Button quiet isDisabled={m.busy} onPress={m.show}>
            {t('policy.checkEdit')}
          </Button>
        ) : undefined
      }
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button accent isDisabled={!m.changed} isPending={m.busy} onPress={() => m.save(close)}>
            {t('policy.save')}
          </Button>
        </>
      )}
    >
      {m.open && (
        <div className="rp-list">
          {m.fields.map(field => (
            <TextField
              key={field.id}
              label={field.label}
              type={field.id === 'check_url' ? 'url' : undefined}
              value={field.value}
              description={field.description}
              error={field.error}
              spellCheck={false}
              onChange={field.change}
            />
          ))}
        </div>
      )}
    </ModalDialog>
  );
}
