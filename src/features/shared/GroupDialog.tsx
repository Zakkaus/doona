import {useId} from 'react';
import {useT} from '../../i18n';
import Close from '../../ui/icons/Close';
import AddCircle from '../../ui/icons/AddCircle';
import {Button, ContextualHelp, DialogForm, DialogSection, InlineAlert, Kv, ModalDialog, Switch, TextField, type KvItem} from '../../ui/ui';
import {SearchSelect} from '../../ui/SearchSelect';
import type {GroupDialogView} from './useGroupDialog';
import {PolicyPicker} from './PolicyPicker';
import {FilterSummary} from '../policies/FilterSummary';
export type PolicyDetails = {
  fields: KvItem[];
  heading: string | null;
  reason: string | null;
  interrupt: {selected: boolean; unset: boolean; isDisabled: boolean; change: (value: boolean) => void} | null;
};
// The group's configuration and its interrupt switch, under the declaration while editing and alone read-only.
function Details({details: d}: {details: PolicyDetails}) {
  const t = useT();
  return (
    <DialogSection title={d.heading && (d.fields.length > 0 || d.interrupt) ? d.heading : null}>
      {d.reason && <InlineAlert tone="informative">{d.reason}</InlineAlert>}
      {d.interrupt && (
        <Switch
          isSelected={d.interrupt.selected}
          isDisabled={d.interrupt.isDisabled}
          onChange={d.interrupt.change}
          description={d.interrupt.unset ? t('policy.unsetDefault') : undefined}
        >
          {t('policy.interrupt')}
        </Switch>
      )}
      {d.fields.length > 0 && <Kv items={d.fields} />}
    </DialogSection>
  );
}
export function GroupDialog({model: m, details}: {id: string; model: GroupDialogView; details: PolicyDetails | null}) {
  const t = useT();
  const form = useId();
  const filterHelp = useId();
  return (
    <ModalDialog
      title={m.title}
      titleHelp={m.editing && !m.name ? <ContextualHelp title={m.title} text={t('policy.editDetails')} /> : undefined}
      description={m.editing && !m.name ? m.help : undefined}
      narrow
      scrollBody
      isOpen={m.open}
      onOpenChange={open => {
        if (!open) m.close();
      }}
      footer={close =>
        m.editing ? (
          <>
            <Button secondary onPress={close}>
              {t('ui.cancel')}
            </Button>
            <Button accent type="submit" form={form} isDisabled={!m.open} isPending={m.busy}>
              {m.submitLabel}
            </Button>
          </>
        ) : (
          <Button onPress={close}>{t('ui.close')}</Button>
        )
      }
    >
      {m.open && m.membershipFilters && <FilterSummary filters={m.membershipFilters} showRules={!m.editing} />}
      {m.open && !m.editing && details && <Details details={details} />}
      {m.editing && (
        <DialogForm
          id={form}
          onSubmit={event => {
            event.preventDefault();
            m.save(m.close);
          }}
        >
          <DialogSection>
            {m.name && (
              <TextField
                label={t('arrange.groupName')}
                isRequired
                validationBehavior="aria"
                value={m.name.value}
                onChange={m.name.change}
                description={t('arrange.groupNameHint')}
                error={m.name.error ?? undefined}
                spellCheck={false}
                isDisabled={m.busy}
              />
            )}
            {m.problem && (
              <InlineAlert key={m.problem.id} takeFocus>
                {m.problem.text}
              </InlineAlert>
            )}
            <PolicyPicker value={m.policy} onChange={m.setPolicy} isDisabled={m.busy} />
            <div
              className="group-dialog-filters"
              role="group"
              aria-label={t('ui.filter')}
              aria-describedby={m.name || m.filters.length > 0 ? filterHelp : undefined}
            >
              <div className="group-dialog-filter-list">
                {m.filters.map(field => (
                  <TextField
                    key={field.id}
                    label={field.label}
                    value={field.value}
                    placeholder="name(keyword: 'HK')"
                    aria-describedby={filterHelp}
                    isDisabled={m.busy}
                    spellCheck={false}
                    onChange={field.change}
                    action={
                      <Button quiet icon isDisabled={m.busy} label={field.removeLabel} onPress={field.remove}>
                        <Close />
                      </Button>
                    }
                  />
                ))}
              </div>
              {m.filters.length > 0 && (
                <span id={filterHelp} className="group-dialog-filter-help">
                  {t('policy.filterHelp')}
                  {m.name ? ` ${m.help}` : ''}
                </span>
              )}
              <Button secondary isDisabled={m.busy} onPress={m.add}>
                <AddCircle />
                {t('policy.addFilter')}
              </Button>
              {m.filters.length === 0 && m.name && (
                <span id={filterHelp} className="group-dialog-filter-help">
                  {m.help}
                </span>
              )}
            </div>
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
          </DialogSection>
          {!m.name && details && <Details details={details} />}
        </DialogForm>
      )}
    </ModalDialog>
  );
}
