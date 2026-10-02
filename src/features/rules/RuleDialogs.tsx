import {useId} from 'react';
import {useT} from '../../i18n';
import {ConditionRow} from '../../ui/ConditionRow';
import {DaeCode} from '../../ui/DaeCode';
import {SearchSelect} from '../../ui/SearchSelect';
import {Button, ConfirmDialog, DialogForm, LabeledSelect, Segmented, StaticField, Switch, TextField, Toolbar} from '../../ui/ui';
import type {RuleConditionKind} from '../../dae/groups';
import type {DictionaryModel} from './useRuleList';

// The add, edit and remove dialogs of one rule list.
export function RuleDialogs({view}: {view: DictionaryModel}) {
  const t = useT();
  const {form, setForm, draft, dialog} = view;
  const {target} = view.copy;
  const mustHelpId = useId();
  // What the rule routes to, which both adding and editing a rule set.
  const targetFields = (
    <>
      <Toolbar className="end">
        {view.table.outboundSections ? (
          <SearchSelect
            isDisabled={view.busy}
            label={target}
            searchLabel={t('ui.filterOutbounds')}
            value={form.outbound}
            onChange={outbound => setForm({...form, outbound})}
            sections={view.table.outboundSections}
          />
        ) : (
          <LabeledSelect
            isDisabled={view.busy}
            label={target}
            value={form.outbound}
            onChange={outbound => setForm({...form, outbound})}
            items={view.table.outbounds}
          />
        )}
        {view.copy.must && (
          <Switch isDisabled={view.busy} isSelected={form.must} onChange={must => setForm({...form, must})} aria-describedby={mustHelpId}>
            {t('rule.must')} <code>must</code>
          </Switch>
        )}
      </Toolbar>
      {view.copy.must && (
        <span id={mustHelpId} className="rp-label">
          {t('rule.mustHelp')}
        </span>
      )}
    </>
  );
  const conditionFields = (
    <DialogForm onSubmit={event => event.preventDefault()}>
      {view.conditions?.map(row => (
        <ConditionRow
          key={row.id}
          negate={row.negate}
          onNegate={negate => view.setCondition(row.id, {...row, negate})}
          negateLabel={t('rule.negate')}
          removeLabel={t('rule.removeCondition')}
          onRemove={() => view.removeCondition(row.id)}
          isDisabled={view.busy}
          removeDisabled={view.conditions!.length === 1}
        >
          <LabeledSelect
            isDisabled={view.busy}
            label={t('rule.kind')}
            value={row.kind}
            onChange={kind => view.setCondition(row.id, {...row, kind: kind as RuleConditionKind})}
            items={row.draft.choices}
          />
          <TextField
            isDisabled={view.busy}
            label={t('rule.values')}
            value={row.value}
            placeholder={row.draft.hint}
            description={t('rule.valuesHelp')}
            error={row.draft.pickError}
            spellCheck={false}
            onChange={value => view.setCondition(row.id, {...row, value})}
          />
        </ConditionRow>
      ))}
      <Toolbar>
        <Button small isDisabled={view.busy} onPress={view.addCondition}>
          {t('rule.addCondition')}
        </Button>
      </Toolbar>
    </DialogForm>
  );
  return (
    <ConfirmDialog
      scrollBody
      title={view.dialogTitle}
      isOpen={dialog !== null}
      onCancel={view.close}
      tone={dialog?.kind === 'remove' ? 'negative' : 'accent'}
      confirmLabel={view.submitLabel}
      isDisabled={view.submitDisabled}
      reason={view.submitReason}
      isPending={view.busy}
      onConfirm={() => void view.submit(view.close)}
    >
      {dialog?.kind === 'remove' && (
        <div className="rp-list">
          <span className="rp-label">{dialog.help}</span>
          <DaeCode text={dialog.expression} />
        </div>
      )}
      {dialog?.kind === 'edit' && (
        <div className="rp-list">
          <span className="rp-label">{t(dialog.fallback ? 'rule.editFallbackHelp' : view.conditions ? 'rule.editHelp' : 'rule.editExpressionHelp')}</span>
          <DaeCode text={dialog.expression} />
          {!dialog.fallback &&
            (view.conditions ? (
              conditionFields
            ) : (
              <TextField
                isDisabled={view.busy}
                label={t('rule.expression')}
                value={form.condition}
                isInvalid={draft.rawInvalid}
                spellCheck={false}
                onChange={condition => setForm({...form, condition})}
              />
            ))}
          {targetFields}
        </div>
      )}
      {dialog?.kind === 'add' && (
        <div className="rp-list">
          <span className="rp-label">{draft.mode === 'pick' ? view.copy.addHelp : t('rule.addExpressionHelp')}</span>
          <Segmented
            isDisabled={view.busy}
            label={t('rule.conditionMode')}
            value={draft.mode}
            onChange={view.changeMode}
            items={[
              ['pick', t('rule.pick')],
              ['text', t('rule.expression')]
            ]}
          />
          {draft.mode === 'pick' ? (
            <>
              {conditionFields}
              {draft.preview && <DaeCode text={draft.preview} />}
            </>
          ) : (
            <TextField
              isDisabled={view.busy}
              label={t('rule.condition')}
              value={form.condition}
              placeholder={view.copy.placeholder}
              description={view.expressionHint ?? undefined}
              isInvalid={draft.rawInvalid}
              spellCheck={false}
              onChange={condition => setForm({...form, condition})}
            />
          )}
          {targetFields}
          {view.table.positions.length === 1 ? (
            <StaticField label={t('rule.position')} value={view.table.positions[0].label} description={view.table.positions[0].desc} />
          ) : (
            <SearchSelect
              isDisabled={view.busy}
              label={t('rule.position')}
              searchLabel={t('ui.filterPositions')}
              value={form.before}
              onChange={before => setForm({...form, before})}
              sections={view.table.positionSections}
            />
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
