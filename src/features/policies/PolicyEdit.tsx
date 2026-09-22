import {useT} from '../../i18n';
import Close from '../../ui/icons/Close';
import {Button, InlineAlert, ModalDialog, TextField} from '../../ui/ui';
import type {PolicyEditView} from './usePolicyEdit';
export function PolicyEdit({model: m}: {model: PolicyEditView}) {
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
          <Button quiet isDisabled={m.disabled} tip={m.tip} onPress={m.show}>
            {t('policy.edit')}
          </Button>
        ) : undefined
      }
      footer={close => (
        <>
          <Button onPress={close}>{t('ui.cancel')}</Button>
          <Button accent isDisabled={!m.open} isPending={m.busy} onPress={() => m.save(close)}>
            {t('policy.save')}
          </Button>
        </>
      )}
    >
      {m.open && (
        <div className="rp-list">
          <span className="rp-label">{t('policy.editHelp')}</span>
          {m.problem && (
            <InlineAlert key={m.problem.id} takeFocus>
              {m.problem.text}
            </InlineAlert>
          )}
          <TextField label={t('policy.policy')} value={m.policy} onChange={m.setPolicy} description={m.policyHint} spellCheck={false} />
          {m.filters.map(field => (
            <TextField
              key={field.id}
              label={field.label}
              value={field.value}
              placeholder="name(keyword: 'HK')"
              spellCheck={false}
              onChange={field.change}
              action={
                <Button quiet icon label={field.removeLabel} onPress={field.remove}>
                  <Close />
                </Button>
              }
            />
          ))}
          <Button small quiet onPress={m.add}>
            {t('policy.addFilter')}
          </Button>
        </div>
      )}
    </ModalDialog>
  );
}
