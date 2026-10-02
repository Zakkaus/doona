import {useId, useState} from 'react';
import {useT} from '../../i18n';
import type {ProbeChoice, ProbeOptions} from '../../store/probeOptions';
import {Button, DialogForm, LabeledSelect, ModalDialog, Switch} from '../../ui/ui';

export type ProbeOptionsDialogModel = {
  name: string;
  group: boolean;
  choices: ProbeChoice[];
  busy: boolean;
  close: () => void;
  submit: (options: ProbeOptions) => void;
};
export function ProbeOptionsDialog({model: m}: {model: ProbeOptionsDialogModel}) {
  const t = useT();
  const form = useId();
  const [choice, setChoice] = useState(m.choices[0]?.id ?? '');
  const [cold, setCold] = useState(false);
  const [leaves, setLeaves] = useState(false);
  const disabled = m.busy || !m.choices.some(item => item.id === choice);
  return (
    <ModalDialog
      narrow
      isOpen
      onOpenChange={open => !open && m.close()}
      title={t('probe.title')}
      description={m.name}
      footer={() => (
        <>
          <Button onPress={m.close}>{t('ui.cancel')}</Button>
          <Button accent type="submit" form={form} isDisabled={disabled}>
            {t('probe.submit')}
          </Button>
        </>
      )}
    >
      <DialogForm
        id={form}
        onSubmit={event => {
          event.preventDefault();
          if (!disabled) m.submit({choice, cold, leaves});
        }}
      >
        <LabeledSelect label={t('probe.kind')} value={choice} onChange={setChoice} items={m.choices.map(item => ({id: item.id, label: t(item.label)}))} />
        <Switch isSelected={cold} onChange={setCold}>
          {t('probe.cold')}
        </Switch>
        {m.group && (
          <Switch isSelected={leaves} onChange={setLeaves}>
            {t('probe.leaves')}
          </Switch>
        )}
      </DialogForm>
    </ModalDialog>
  );
}
