import {useT} from '../../i18n';
import {
  ActionHelp,
  Button,
  PrimaryActions,
  Card,
  ErrorMessage,
  InlineAlert,
  LabeledSelect,
  Light,
  Link,
  NumberField,
  numberFromText,
  SkeletonBar,
  SkeletonBody,
  SkeletonGroup,
  textFromNumber,
  Toolbar,
  ChartWait,
  Form
} from '../../ui/ui';
import {useRuntimeSettingsForm} from './useRuntimeSettingsForm';
import {recordingLimitsHref} from '../shared/link';
import {runtimeFieldLabels, settingsCard} from './nav';

const card = settingsCard('runtime');

export function RuntimeSettingsCard() {
  const t = useT();
  const m = useRuntimeSettingsForm();
  return (
    <Card
      level={2}
      title={t(card.titleKey)}
      titleId={card.headingId}
      // The row stays while the source is unknown, so the heading does not move when it arrives.
      aside={<>{m.source && <Light tone={m.sourceTone}>{m.source}</Light>}</>}
    >
      {m.waiting && m.capsError ? (
        <ErrorMessage error={m.capsError} onRetry={m.retryCaps} />
      ) : (
        // The note's line is held while capabilities load, so the form's reserved box below starts where the form will.
        <span className="rp-label">{m.waiting ? '\u00a0' : m.note}</span>
      )}
      {!m.waiting && m.persistent && (
        <div className="rp-cluster">
          <Link appearance="button" href={m.persistent}>
            {t('settings.runtimePersistent')}
          </Link>
        </div>
      )}
      {m.waiting && !m.capsError && (
        <ChartWait holds="form">
          <SkeletonBody shape="fields" />
        </ChartWait>
      )}
      {!m.waiting && m.available && (
        <>
          <ErrorMessage error={m.error} onRetry={m.retry} />
          {m.conflict && <InlineAlert>{m.conflict}</InlineAlert>}
          {m.loading && (
            // The settings' first read: the same fields and rows the form draws, from the same lists, under their real
            // labels, each control a Skeleton bar.
            <SkeletonGroup>
              <Toolbar className="top rp-fieldgrid">
                {m.hasLevel && (
                  <div className="rp-field">
                    <span className="rp-label">{t(runtimeFieldLabels['log.level'])}</span>
                    <SkeletonBar />
                  </div>
                )}
                {m.numeric.map(field => (
                  <div key={field.id} className="rp-field" style={{width: 180}}>
                    <span className="rp-label">{field.label}</span>
                    <SkeletonBar />
                    {field.description && <span className="rp-label">{field.description}</span>}
                  </div>
                ))}
              </Toolbar>
              {m.recorders.length > 0 && (
                <Toolbar className="top rp-fieldgrid">
                  {m.recorders.map(recorder => (
                    <div key={recorder.id} className="rp-field">
                      <span className="rp-label">{recorder.label}</span>
                      <SkeletonBar />
                      <SkeletonBar line="caption" />
                    </div>
                  ))}
                  {/* The recording note follows the settings; the flow note is known already. */}
                  <span className="rp-label">
                    <SkeletonBar line="caption" />
                  </span>
                  {m.flowNote && <span className="rp-label">{m.flowNote}</span>}
                </Toolbar>
              )}
              <Toolbar>
                <SkeletonBar width={96} />
              </Toolbar>
            </SkeletonGroup>
          )}
          {m.hasBaseline && (
            // Enter in a field applies, as the button does.
            <Form
              className="rp-contents"
              onSubmit={event => {
                event.preventDefault();
                if (!m.blocked && !m.busy) m.apply();
              }}
            >
              <Toolbar className="top rp-fieldgrid">
                {m.hasLevel && (
                  <div className="rp-contents" data-setting="log.level">
                    <LabeledSelect label={t(runtimeFieldLabels['log.level'])} value={m.level} onChange={m.setLevel} items={m.levels} isDisabled={m.busy} />
                  </div>
                )}
                {m.numeric.map(field => (
                  <div key={field.id} className="rp-contents" data-setting={field.id}>
                    <NumberField
                      label={field.label}
                      value={numberFromText(field.value)}
                      minValue={field.floor}
                      maxValue={field.ceiling}
                      step={1}
                      isDisabled={m.busy}
                      isInvalid={field.invalid}
                      onChange={value => field.change(textFromNumber(value))}
                      description={field.description}
                    />
                  </div>
                ))}
              </Toolbar>
              {m.recorders.length > 0 && (
                <Toolbar className="top rp-fieldgrid" role="group" aria-label={t('settings.recording')}>
                  {m.recorders.map(recorder => (
                    <div key={recorder.id} className="rp-field" data-setting={recorder.id}>
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
                      {recorder.disabled && (
                        <Link appearance="link" href={recordingLimitsHref}>
                          {t('settings.recordingRequirements')}
                        </Link>
                      )}
                    </div>
                  ))}
                  {m.recordingNote && <span className="rp-label">{m.recordingNote}</span>}
                  {m.flowNote && <span className="rp-label">{m.flowNote}</span>}
                </Toolbar>
              )}
              <ActionHelp reason={m.reason}>
                <Toolbar>
                  <PrimaryActions>
                    <Button accent type="submit" isPending={m.busy} isDisabled={m.blocked}>
                      {t('settings.apply')}
                    </Button>
                    {m.dirty && (
                      <Button isDisabled={m.busy} onPress={m.discard}>
                        {t('config.discard')}
                      </Button>
                    )}
                  </PrimaryActions>
                </Toolbar>
              </ActionHelp>
            </Form>
          )}
        </>
      )}
    </Card>
  );
}
