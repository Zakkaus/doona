import {useT} from '../../i18n';
import type {ConfigSource} from '../../api/model';
import type {ConfigEditor} from './useConfigPage';
import {Button, LabeledSelect, TextField} from '../../ui/ui';
import Close from '../../ui/icons/Close';
import {CodeEditor} from '../../ui/code/CodeEditor';
import type {WizardState} from '../../dae/setup';
import {useWizard} from './useWizard';
export function Wizard(props: {main: ConfigSource; editor: ConfigEditor; onDone: () => void}) {
  const t = useT();
  const {
    state,
    text,
    busy,
    rows,
    groupUsedText,
    templateHelp,
    networkError,
    patch,
    setSubscription,
    apply,
    saveDisabled,
    saving,
    saveTip,
    writeHelp,
    showLan,
    templates,
    add,
    remove
  } = useWizard(props);
  return (
    <section className="rp-card" aria-label={t('config.wizard')}>
      <span className="rp-label">{t('config.wizardNote')}</span>

      <h3 className="rp-h3">{t('config.wizardSubscriptions')}</h3>
      <div className="rp-list">
        {rows.map(item => (
          <div className="rp-toolbar top" key={item.index}>
            {item.raw !== null ? (
              // A line in a form the wizard does not model (a file, a multi-line entry) stays as written.
              <span className="rp-code rp-grow rp-config-raw">{item.raw}</span>
            ) : (
              <>
                <TextField
                  isDisabled={busy}
                  label={t('config.wizardSubscriptionName')}
                  value={item.name}
                  width={140}
                  onChange={name => setSubscription(item.index, {name})}
                />
                <TextField
                  isDisabled={busy}
                  label={t('config.wizardSubscription')}
                  value={item.url}
                  width={520}
                  placeholder="https://example.org/sub?token=…"
                  error={item.error}
                  description={item.description}
                  onChange={url => setSubscription(item.index, {url})}
                />
              </>
            )}
            <span className={item.raw === null ? 'rp-field-row' : undefined}>
              <Button isDisabled={busy} quiet small label={item.removeLabel} onPress={() => remove(item.index)}>
                <Close />
              </Button>
            </span>
          </div>
        ))}
        <div>
          <Button isDisabled={busy} small onPress={add}>
            {t('config.wizardAddSubscription')}
          </Button>
        </div>
      </div>

      <h3 className="rp-h3">{t('config.wizardTemplate')}</h3>
      <div className="rp-toolbar top">
        <LabeledSelect
          isDisabled={busy}
          label={t('config.wizardTemplate')}
          value={state.rules}
          onChange={rules => patch({rules: rules as WizardState['rules']})}
          items={templates}
        />
        {showLan && (
          <TextField
            isDisabled={busy}
            label={t('config.wizardLan')}
            value={state.lanInterface}
            width={140}
            placeholder="auto"
            onChange={lanInterface => patch({lanInterface})}
          />
        )}
      </div>
      {groupUsedText && <span className="rp-label">{groupUsedText}</span>}
      {templateHelp && <span className="rp-label">{templateHelp}</span>}
      {showLan && (
        <div className="rp-toolbar top">
          <TextField
            isDisabled={busy}
            label={t('config.wizardListenerPort')}
            value={state.listenerPort}
            width={140}
            onChange={listenerPort => patch({listenerPort})}
            error={networkError}
          />
          <TextField isDisabled={busy} label={t('config.wizardDefaultDns')} value={state.defaultDns} onChange={defaultDns => patch({defaultDns})} />
          <TextField isDisabled={busy} label={t('config.wizardChinaDns')} value={state.chinaDns} onChange={chinaDns => patch({chinaDns})} />
        </div>
      )}

      <h3 className="rp-h3">{t('config.wizardPreview')}</h3>
      <CodeEditor label={t('config.wizardPreview')} value={text} readOnly compact />
      <div className="rp-toolbar">
        <Button accent isDisabled={saveDisabled} isPending={saving} tip={saveTip} onPress={() => void apply()}>
          {t('config.save')}
        </Button>
        {writeHelp && <span className="rp-label">{writeHelp}</span>}
      </div>
    </section>
  );
}
