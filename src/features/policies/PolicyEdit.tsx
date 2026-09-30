import {useT} from '../../i18n';
import Close from '../../ui/icons/Close';
import {Button, InlineAlert, Kv, ModalDialog, Switch, TextField} from '../../ui/ui';
import {SearchSelect} from '../../ui/SearchSelect';
import type {PolicyEditView} from './usePolicyEdit';
import {PolicyPicker} from '../shared/PolicyPicker';
export type PolicyDetails = {
  fields: Array<[string, string]>;
  heading: string | null;
  reason: string | null;
  interrupt: {selected: boolean; unset: boolean; isDisabled: boolean; change: (value: boolean) => void} | null;
};
// The group's configuration and its interrupt switch, under the declaration while editing and alone read-only.
function Details({id, details: d}: {id: string; details: PolicyDetails}) {
  const t = useT();
  return (
    <>
      {d.reason && <span className="rp-label">{d.reason}</span>}
      {d.heading && (d.fields.length > 0 || d.interrupt) && <h3 className="rp-label">{d.heading}</h3>}
      {d.interrupt && (
        <div className="rp-field">
          <Switch
            isSelected={d.interrupt.selected}
            isDisabled={d.interrupt.isDisabled}
            onChange={d.interrupt.change}
            aria-describedby={d.interrupt.unset ? `${id}-interrupt-unset` : undefined}
          >
            {t('policy.interrupt')}
          </Switch>
          {d.interrupt.unset && (
            <span id={`${id}-interrupt-unset`} className="rp-label">
              {t('policy.unsetDefault')}
            </span>
          )}
        </div>
      )}
      {d.fields.length > 0 && <Kv items={d.fields} />}
    </>
  );
}
export function PolicyEdit({id, model: m, details}: {id: string; model: PolicyEditView; details: PolicyDetails | null}) {
  const t = useT();
  return (
    <ModalDialog
      title={m.title}
      narrow
      isOpen={m.open}
      onOpenChange={open => {
        if (!open) m.close();
      }}
      footer={close =>
        m.editing ? (
          <>
            <Button onPress={close}>{t('ui.cancel')}</Button>
            <Button accent isDisabled={!m.open} isPending={m.busy} onPress={() => m.save(close)}>
              {t('policy.save')}
            </Button>
          </>
        ) : (
          <Button onPress={close}>{t('ui.close')}</Button>
        )
      }
    >
      {m.open && !m.editing && details && (
        <div className="rp-list">
          <Details id={id} details={details} />
        </div>
      )}
      {m.editing && (
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
              isDisabled={m.busy}
              onChange={field.change}
            />
          ))}
          {details && <Details id={id} details={details} />}
        </div>
      )}
    </ModalDialog>
  );
}
