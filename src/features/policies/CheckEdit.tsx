import {useT} from '../../i18n';
import {Button, Form, ModalDialog, NumberField, TextField, numberFromText, textFromNumber} from '../../ui/ui';
import type {CheckEditView} from './useCheckEdit';
const form = 'policy-check-form';
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
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button accent type="submit" form={form} isDisabled={!m.changed} isPending={m.busy}>
            {t('policy.save')}
          </Button>
        </>
      )}
    >
      {m.open && (
        <Form
          id={form}
          className="rp-list"
          onSubmit={event => {
            event.preventDefault();
            m.save(m.close);
          }}
        >
          {m.fields.map(field =>
            field.minValue === undefined ? (
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
            ) : (
              <NumberField
                key={field.id}
                label={field.label}
                value={numberFromText(field.value)}
                minValue={field.minValue}
                maxValue={Number.MAX_SAFE_INTEGER}
                step={1}
                description={field.description}
                error={field.error}
                onChange={value => field.change(textFromNumber(value))}
              />
            )
          )}
        </Form>
      )}
    </ModalDialog>
  );
}
