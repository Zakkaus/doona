import {useT} from '../../i18n';
import {Badge, Button, Card, ConfirmDialog, Disclosure, InlineAlert} from '../../ui/ui';
import type {TemplateChoice} from './template';
import type {RuleTemplatesModel} from './useRuleTemplates';

// The simple view of the routing list: the routing in plain words, and the templates it can be replaced with.
export function RuleTemplates({model}: {model: RuleTemplatesModel}) {
  const t = useT();
  const {current, dialog} = model;
  return (
    <div className="rp-col">
      <Card title={t('rule.template.current')}>
        <div className="rp-template">
          <div className="rp-template-text">
            <strong>{current ? current.name : t('rule.template.custom')}</strong>
            <span>{current ? current.help : t('rule.template.customHelp')}</span>
          </div>
          {!current && (
            <Button small onPress={() => model.setMode('advanced')}>
              {t('rule.template.openAdvanced')}
            </Button>
          )}
        </div>
      </Card>
      <Card title={t('rule.template.choices')} note={t('rule.template.common')}>
        {model.refusal && <InlineAlert tone="informative">{model.refusal}</InlineAlert>}
        <TemplateRows choices={model.primary} model={model} />
        <Disclosure title={t('rule.template.more')}>
          <TemplateRows choices={model.more} model={model} />
        </Disclosure>
      </Card>
      <ConfirmDialog
        title={dialog ? t('rule.template.confirmTitle', {name: dialog.choice.name}) : ''}
        isOpen={!!dialog}
        tone="accent"
        confirmLabel={t('rule.template.confirm')}
        isPending={model.applying}
        onCancel={model.close}
        onConfirm={() => void model.confirm()}
      >
        {dialog && <p>{t('rule.template.scope', {file: dialog.file})}</p>}
      </ConfirmDialog>
    </div>
  );
}

function TemplateRows({choices, model}: {choices: TemplateChoice[]; model: RuleTemplatesModel}) {
  const t = useT();
  return (
    <ul className="rp-templates">
      {choices.map(choice => (
        <li key={choice.id} className="rp-template">
          <div className="rp-template-text">
            <strong>{choice.name}</strong>
            <span>{choice.help}</span>
          </div>
          {choice.id === model.current?.id ? (
            <Badge>{t('rule.template.currentBadge')}</Badge>
          ) : (
            !model.refusal && (
              <Button small isDisabled={!model.canApply} label={t('rule.template.applyLabel', {name: choice.name})} onPress={() => model.open(choice.id)}>
                {t('rule.template.apply')}
              </Button>
            )
          )}
        </li>
      ))}
    </ul>
  );
}
