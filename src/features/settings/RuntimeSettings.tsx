import {useT} from '../../i18n';
import {Button, ErrorMessage, LabeledSelect, Light, Loading, TextField} from '../../ui/ui';
import {useRuntimeSettingsForm} from './useRuntimeSettingsForm';

export function RuntimeSettingsCard() {
  const t = useT();
  const m = useRuntimeSettingsForm();
  return (
    <section className="rp-card" aria-labelledby="settings-runtime">
      <div className="rp-row">
        <h2 className="rp-h3" id="settings-runtime">
          {t('settings.runtime')}
        </h2>
        {m.source && <Light tone={m.sourceTone}>{m.source}</Light>}
      </div>
      {m.waiting && m.capsError ? (
        <ErrorMessage error={m.capsError} />
      ) : (
        // The note's line is held while capabilities load, so the form's reserved box below starts where the form will.
        <span className="rp-label">{m.waiting ? '\u00a0' : m.note}</span>
      )}
      {m.waiting && !m.capsError && (
        <div className="rp-chart-wait form">
          <Loading />
        </div>
      )}
      {!m.waiting && m.available && (
        <>
          <ErrorMessage error={m.error} />
          {m.conflict && (
            <p role="alert" className="rp-alert">
              {m.conflict}
            </p>
          )}
          {m.loading && (
            <div className="rp-chart-wait form">
              <Loading />
            </div>
          )}
          {m.hasBaseline && (
            <>
              <div className="rp-toolbar top">
                {m.hasLevel && <LabeledSelect label={t('settings.logLevel')} value={m.level} onChange={m.setLevel} items={m.levels} isDisabled={m.busy} />}
                {m.numeric.map(field => (
                  <TextField
                    key={field.id}
                    width={180}
                    type="text"
                    label={field.label}
                    value={field.value}
                    isDisabled={m.busy}
                    isInvalid={field.invalid}
                    onChange={field.change}
                    description={field.description}
                  />
                ))}
              </div>
              {m.recorders.length > 0 && (
                <div className="rp-toolbar" role="group" aria-label={t('settings.recording')}>
                  {m.recorders.map(recorder => (
                    <div key={recorder.id} className="rp-field">
                      <LabeledSelect
                        label={recorder.label}
                        value={recorder.value}
                        onChange={recorder.change}
                        items={recorder.items}
                        isDisabled={m.busy || recorder.disabled}
                      />
                      <Light tone={recorder.tone} small>
                        {recorder.status}
                      </Light>
                    </div>
                  ))}
                  {m.recordingNote && <span className="rp-label">{m.recordingNote}</span>}
                </div>
              )}
              <div className="rp-toolbar">
                <Button accent isPending={m.busy} isDisabled={m.blocked} onPress={m.apply}>
                  {t('settings.apply')}
                </Button>
                {m.dirty && (
                  <Button isDisabled={m.busy} onPress={m.discard}>
                    {t('config.discard')}
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
