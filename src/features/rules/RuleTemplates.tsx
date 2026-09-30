import {useId} from 'react';
import {useT} from '../../i18n';
import {Button, Card, Checkbox, ConfirmDialog, Diff, Disclosure, InlineAlert, Light, Radio, RadioGroup} from '../../ui/ui';
import type {RuleTemplate} from '../../dae/templates';
import type {TemplateChoice} from './template';
import type {RuleTemplatesModel} from './useRuleTemplates';

// The simple view of the routing list: the routing modes as one choice, the detected one selected, and Apply to write
// another.
export function RuleTemplates({model}: {model: RuleTemplatesModel}) {
  const t = useT();
  const headingId = useId();
  const {current, dialog} = model;
  const radios = (choices: TemplateChoice[]) =>
    choices.map(choice => <Radio key={choice.id} value={choice.id} label={choice.name} description={choice.help} />);
  return (
    <div className="rp-col">
      <Card title={t('rule.template.mode')} titleId={headingId} reason={model.refusal}>
        {!current && <InlineAlert tone="informative">{t('rule.template.customNote', {file: model.file ?? ''})}</InlineAlert>}
        <RadioGroup
          aria-labelledby={headingId}
          description={t('rule.template.common')}
          value={model.selected}
          onChange={id => model.select(id as RuleTemplate)}
        >
          {radios(model.primary)}
          <Disclosure flush title={t('rule.template.more')} defaultExpanded={model.more.some(choice => choice.id === model.selected)}>
            {radios(model.more)}
          </Disclosure>
        </RadioGroup>
        <div className="rp-toolbar">
          <Button accent isDisabled={!model.canApply} onPress={model.open}>
            {t('rule.template.apply')}
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        title={dialog ? t('rule.template.confirmTitle', {name: dialog.choice.name}) : ''}
        isOpen={!!dialog}
        tone="accent"
        confirmLabel={t('rule.template.apply')}
        isPending={model.applying}
        scrollBody
        onCancel={model.close}
        onConfirm={() => void model.confirm()}
      >
        {dialog && (
          <>
            <p>{t('rule.template.scope', {file: dialog.file})}</p>
            <ImpactList
              title={t('rule.template.created')}
              columns
              empty={t('rule.template.createdNone')}
              rows={dialog.impact.created.map(group => ({
                name: group.name,
                label: group.label,
                warning: dialog.impact.collisions.includes(group.name) ? t('rule.template.collision', {name: group.name}) : null
              }))}
            />
            {dialog.impact.reused.length > 0 && (
              <ImpactList
                title={t('rule.template.reused')}
                rows={dialog.impact.reused.map(group => ({name: group.name, label: null, warning: group.pinned ? t('rule.template.pinnedHelp') : null}))}
              />
            )}
            {dialog.dns !== null && (
              <Checkbox label={t('rule.template.addDns')} description={t('rule.template.addDnsHelp')} isSelected={dialog.dns} onChange={model.setDns} />
            )}
            <Disclosure flush title={t('rule.template.changes', {file: dialog.file})}>
              <Diff rows={dialog.diff} label={t('rule.template.changes', {file: dialog.file})} />
            </Disclosure>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

type ImpactRow = {name: string; label: string | null; warning: string | null};
// A titled list of groups in the apply dialog: each name with its label, and a warning light under it. `columns` lays
// a long list out in as many columns as fit.
function ImpactList({title, empty, columns, rows}: {title: string; empty?: string; columns?: boolean; rows: ImpactRow[]}) {
  const headingId = useId();
  return (
    <section className="rp-impact-section" aria-labelledby={headingId}>
      <h3 className="rp-h3" id={headingId}>
        {title}
      </h3>
      {rows.length ? (
        <ul className={columns ? 'rp-impact grid' : 'rp-impact'}>
          {rows.map(row => (
            <li key={row.name}>
              <span className="rp-cluster">
                <code className="rp-code">{row.name}</code>
                {row.label && <span className="rp-note">{row.label}</span>}
              </span>
              {row.warning && (
                <Light small tone="warn">
                  {row.warning}
                </Light>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rp-note">{empty}</p>
      )}
    </section>
  );
}
