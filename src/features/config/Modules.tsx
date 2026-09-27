import {useT} from '../../i18n';
import {ActionHelp, Badge, Button, Card, Light, Link} from '../../ui/ui';
import {CodeEditor} from '../../ui/code/CodeEditor';
import {ChangedOnDisk} from './ChangedOnDisk';
import {useModules, type ModulesProps} from './useModules';
export function Modules(props: ModulesProps) {
  const t = useT();
  const vm = useModules(props);
  return (
    <div className="rp-page">
      {vm.cards.map(card => (
        <Card key={card.id} aria-label={card.kind}>
          <ActionHelp reason={card.editReason}>
            <div className="rp-row">
              <span className="rp-cluster">
                <h3 className="rp-h3 rp-code">{card.kind}</h3>
                <span className="rp-label rp-code">{card.range}</span>
                {card.editing && vm.dirty && <Badge tone="warn">{t('config.unsaved')}</Badge>}
              </span>
              <span className="rp-cluster">
                {card.href && (
                  <Link appearance="button" href={card.href}>
                    {t('config.moduleOpen')}
                  </Link>
                )}
                {card.canEdit && !card.editing && (
                  <Button isDisabled={card.editDisabled} tip={card.editTip} onPress={card.edit}>
                    {t('config.edit')}
                  </Button>
                )}
                {card.manual && !card.editing && (
                  <Button quiet tip={t('config.moduleManualTip')} onPress={card.manual}>
                    {t('config.moduleManual')}
                  </Button>
                )}
              </span>
            </div>
          </ActionHelp>
          <Light small tone={card.muted ? 'muted' : 'info'}>
            {card.summary}
          </Light>
          {card.note && (
            <Light small tone="muted">
              {card.note}
            </Light>
          )}
          {card.editing && (
            <>
              <CodeEditor
                label={card.range}
                value={vm.text}
                onChange={vm.change}
                readOnly={vm.busy}
                marks={vm.marks}
                outbounds={vm.outbounds}
                onSave={vm.dirty && !vm.busy ? () => void vm.save() : undefined}
              />
              {vm.conflict && <ChangedOnDisk message={vm.conflict} busy={vm.busy} keep={vm.keep} />}
              {vm.diagnostics.length > 0 && (
                <div className="rp-list rp-config-diagnostics" role="list" aria-label={t('config.diagnostics')}>
                  {vm.diagnostics.map(item => (
                    <div key={item.id} role="listitem">
                      <Light small tone={item.tone}>
                        {item.detail}
                      </Light>
                    </div>
                  ))}
                </div>
              )}
              <ActionHelp reason={vm.saveReason}>
                <div className="rp-cluster">
                  {vm.canValidate && (
                    <Button isPending={vm.validating} isDisabled={vm.busy} onPress={() => void vm.validate()}>
                      {t('config.validate')}
                    </Button>
                  )}
                  <Button accent isPending={vm.saving} isDisabled={vm.busy || !vm.dirty || !!vm.conflict} onPress={() => void vm.save()}>
                    {t('config.save')}
                  </Button>
                  <Button isDisabled={vm.busy} onPress={vm.cancel}>
                    {t('ui.cancel')}
                  </Button>
                </div>
              </ActionHelp>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
