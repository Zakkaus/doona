import {useT} from '../../i18n';
import {Badge, Button, Card, ConfirmDialog, Diff, Disclosure, InlineAlert} from '../../ui/ui';
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
