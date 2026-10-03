import {IncludesEditor} from './IncludesEditor';
import {useId} from 'react';
import {useT} from '../../../i18n';
import {Button, ContextualHelp, DialogForm, DialogSection, InlineAlert, Kv, ProblemAlert, ModalDialog, Switch, TextField, type KvItem} from '../../../ui/ui';
import {LabeledSelect} from '../../../ui/Picker';
import {SearchSelect} from '../../../ui/SearchSelect';
import type {GroupDialogView} from './useGroupDialog';
import {policyChoices} from '../../shared/policyText';
import {FilterSummary} from './FilterSummary';
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
export function GroupDialog({model: m, details}: {model: GroupDialogView; details: PolicyDetails | null}) {
  const t = useT();
  const form = useId();
  const policy = policyChoices(m.policy, t);
  return (
    <ModalDialog
      title={m.title}
      titleHelp={m.editing && !m.name ? <ContextualHelp title={m.title} text={t('policy.editDetails')} /> : undefined}
      description={m.editing && !m.name ? t('policy.editHelp') : undefined}
      narrow
      scrollBody
      isOpen={m.open}
      onOpenChange={open => {
        if (!open) m.close();
      }}
      footer={close =>
        m.editing ? (
          <>
            <Button quiet onPress={m.undo} isDisabled={!m.canUndo || m.busy}>
              {t('policy.undo')}
            </Button>
            <Button secondary onPress={close}>
              {t('ui.cancel')}
            </Button>
            <Button accent type="submit" form={form} isDisabled={!m.open || m.invalid || !!m.removed} tip={m.removed ?? undefined} isPending={m.busy}>
              {m.submitLabel}
            </Button>
          </>
        ) : (
          <Button onPress={close}>{t('ui.close')}</Button>
        )
      }
    >
      {m.open && !m.editing && m.membershipFilters && <FilterSummary filters={m.membershipFilters} showRules={!m.editing} />}
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
                label={t('group.groupName')}
                isRequired
                validationBehavior="aria"
                value={m.name.value}
                onChange={m.name.change}
                description={t('group.groupNameHint')}
                error={m.name.error ?? undefined}
                spellCheck={false}
                isDisabled={m.busy}
              />
            )}
            {m.removed && <InlineAlert tone="notice">{m.removed}</InlineAlert>}
            {m.problem && <ProblemAlert key={m.problem.id} problem={m.problem} />}
            <LabeledSelect label={t('group.policy')} value={policy.selected} onChange={m.setPolicy} items={policy.items} isDisabled={m.busy} />
            <IncludesEditor model={m} />
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
