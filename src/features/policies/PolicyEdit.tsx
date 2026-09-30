import {useT} from '../../i18n';
import Close from '../../ui/icons/Close';
import {Button, InlineAlert, ModalDialog, TextField} from '../../ui/ui';
import {SearchSelect} from '../../ui/SearchSelect';
import type {PolicyEditView} from './usePolicyEdit';
import {PolicyPicker} from '../shared/PolicyPicker';
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
          <PolicyPicker value={m.policy} onChange={m.setPolicy} />
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
          {m.routes.map(field => (
            <SearchSelect
              key={field.id}
              label={field.label}
              searchLabel={field.searchLabel}
              sections={field.sections}
              value={field.value}
              description={field.description}
              takeFocus={field.takeFocus}
              isDisabled={m.busy}
              onChange={field.change}
            />
          ))}
        </div>
      )}
    </ModalDialog>
  );
}
