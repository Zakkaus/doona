import {useId} from 'react';
import {useT} from '../../i18n';
import {Badge, Button, Card, ConfirmDialog, Diff, Disclosure, InlineAlert, Radio, RadioGroup} from '../../ui/ui';
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
          <Disclosure title={t('rule.template.more')} defaultExpanded={model.more.some(choice => choice.id === model.selected)}>
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
        onCancel={model.close}
        onConfirm={() => void model.confirm()}
      >
        {dialog && (
          <div className="rp-col">
            <p>{t('rule.template.scope', {file: dialog.file})}</p>
            <section className="rp-col" aria-label={t('rule.template.created')}>
              <h3 className="rp-h3">{t('rule.template.created')}</h3>
              {dialog.impact.created.length ? (
                <ul className="rp-templates">
                  {dialog.impact.created.map(group => (
                    <li key={group.name} className="rp-template">
                      <span className="rp-template-text">
                        <code>{group.name}</code>
                        {group.label && <span>{group.label}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="rp-label">{t('rule.template.createdNone')}</span>
              )}
            </section>
            {dialog.impact.reused.length > 0 && (
              <section className="rp-col" aria-label={t('rule.template.reused')}>
                <h3 className="rp-h3">{t('rule.template.reused')}</h3>
                <ul className="rp-templates">
                  {dialog.impact.reused.map(group => (
                    <li key={group.name} className="rp-template">
                      <span className="rp-template-text">
                        <code>{group.name}</code>
                        {group.pinned && <span>{t('rule.template.pinnedHelp')}</span>}
                      </span>
                      {group.pinned && <Badge>{t('rule.template.pinned')}</Badge>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {dialog.impact.collisions.map(name => (
              <InlineAlert key={name} tone="informative">
                {t('rule.template.collision', {name})}
              </InlineAlert>
            ))}
            <h3 className="rp-h3">{t('rule.template.changes', {file: dialog.file})}</h3>
            <Diff rows={dialog.diff} label={t('rule.template.changes', {file: dialog.file})} />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
