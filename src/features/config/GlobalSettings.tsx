import {useT} from '../../i18n';
import {
  Button,
  PrimaryActions,
  Card,
  ErrorMessage,
  InlineAlert,
  LabeledSelect,
  NumberField,
  TextField,
  Toolbar,
  Form,
  SkeletonBar,
  SkeletonGroup,
  textFromNumber
} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {RestartNotice} from './RestartNotice';
import {useGlobalSettings} from './useGlobalSettings';

// The first read's Skeleton, drawn from the same groups and fields as the form: each real label, key and hint stays and
// only the control is a bar, so nothing moves when the values arrive.
function GlobalSkeleton({groups}: {groups: ReturnType<typeof useGlobalSettings>['groups']}) {
  const t = useT();
  return (
    <div className="rp-page">
      <SkeletonGroup>
        <Toolbar page>
          <span className="rp-cluster nowrap rp-source-pick">
            <SkeletonBar width={240} />
          </span>
        </Toolbar>
        <span className="rp-label">{t('config.globalNote')}</span>
        {groups.map(group => (
          <Card key={group.id} title={group.title}>
            <Toolbar className="top rp-fieldgrid">
              {group.fields.map(field => (
                <div key={field.key} className="rp-field" inert aria-hidden="true">
                  <span className="lbl">{field.label}</span>
                  <SkeletonBar />
                  <span className="rp-label rp-code">{field.key}</span>
                  {field.hint && <span className="rp-label">{field.hint}</span>}
                </div>
              ))}
            </Toolbar>
          </Card>
        ))}
        <Toolbar page>
          <SkeletonBar width={96} />
        </Toolbar>
      </SkeletonGroup>
    </div>
  );
}

export function GlobalSettings(props: PageProps) {
  const t = useT();
  const m = useGlobalSettings(props);
  if (!m.available) return null;
  if (m.loading) return <GlobalSkeleton groups={m.groups} />;
  return (
    <Form
      id="config-global-form"
      className="rp-page"
      onSubmit={event => {
        event.preventDefault();
        void m.save();
      }}
    >
      <Toolbar page>
        <span className="rp-cluster nowrap rp-source-pick">
          <LabeledSelect side cut="path" label={t('config.source')} value={m.selected} items={m.choices} onChange={m.select} isDisabled={m.busy || !m.source} />
        </span>
      </Toolbar>
      <span className="rp-label">{t('config.globalNote')}</span>
      {m.unread && <InlineAlert tone="informative">{m.unread}</InlineAlert>}
      <ErrorMessage error={m.error} onRetry={m.retry} />
      {m.failure && <InlineAlert>{m.failure}</InlineAlert>}
      {m.restart.length > 0 && <RestartNotice settings={m.restart} sources={m.sources} />}
      {m.conflict && <InlineAlert>{t('config.changedOnDisk')}</InlineAlert>}
      {m.source && !m.writable && <InlineAlert tone="informative">{t('config.readOnly')}</InlineAlert>}
      {m.groups.map(group => (
        <Card key={group.id} title={group.title}>
          <Toolbar className="top rp-fieldgrid">
            {group.fields.map(field => (
              <div key={field.key} className="rp-field" data-setting={field.key}>
                {field.items ? (
                  <LabeledSelect
                    label={field.label}
                    value={field.value}
                    isDisabled={!m.writable || m.busy || field.duplicate}
                    onChange={field.change}
                    items={field.items}
                  />
                ) : field.number ? (
                  <NumberField
                    label={field.label}
                    name={field.key}
                    value={field.number.value}
                    onChange={value => field.change(textFromNumber(value))}
                    minValue={0}
                    maxValue={field.number.max}
                    step={1}
                    isDisabled={!m.writable || m.busy || field.duplicate}
                    placeholder={t('config.globalUnset')}
                    error={field.invalid ? t('config.globalInvalid') : undefined}
                    aria-describedby={field.hint ? `config-global-${field.key}` : undefined}
                  />
                ) : (
                  <TextField
                    label={field.label}
                    name={field.key}
                    value={field.value}
                    onChange={field.change}
                    isDisabled={!m.writable || m.busy || field.duplicate}
                    placeholder={t('config.globalUnset')}
                    error={field.invalid ? t('config.globalInvalid') : undefined}
                    aria-describedby={field.hint ? `config-global-${field.key}` : undefined}
                  />
                )}
                {/* The key, then the hint, follow every control alike, so a row of pickers and text fields keeps one rhythm. */}
                <span className="rp-label rp-code">{field.key}</span>
                {field.hint && (
                  <span id={`config-global-${field.key}`} className="rp-label">
                    {field.hint}
                  </span>
                )}
                {field.duplicate && <span className="rp-label">{t('config.globalDuplicate')}</span>}
              </div>
            ))}
          </Toolbar>
        </Card>
      ))}
      <Toolbar page>
        <PrimaryActions>
          <Button accent type="submit" isPending={m.busy} isDisabled={m.blocked}>
            {t('config.globalSave')}
          </Button>
          {m.dirty && (
            <Button onPress={m.cancel} isDisabled={m.busy}>
              {t('config.discard')}
            </Button>
          )}
        </PrimaryActions>
      </Toolbar>
    </Form>
  );
}
