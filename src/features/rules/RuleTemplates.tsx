import {useT} from '../../i18n';
import {Button, Card, Disclosure} from '../../ui/ui';
import type {TemplateChoice} from './template';
import type {RuleTemplatesModel} from './useRuleTemplates';

// The simple view of the routing list: the routing in plain words, and the templates it can be replaced with.
export function RuleTemplates({model}: {model: RuleTemplatesModel}) {
  const t = useT();
  const {current} = model;
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
        <TemplateRows choices={model.primary} current={current} />
        <Disclosure title={t('rule.template.more')}>
          <TemplateRows choices={model.more} current={current} />
        </Disclosure>
      </Card>
    </div>
  );
}

function TemplateRows({choices, current}: {choices: TemplateChoice[]; current: TemplateChoice | null}) {
  return (
    <ul className="rp-templates">
      {choices.map(choice => (
        <li key={choice.id} className="rp-template" data-current={choice.id === current?.id || undefined}>
          <div className="rp-template-text">
            <strong>{choice.name}</strong>
            <span>{choice.help}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
