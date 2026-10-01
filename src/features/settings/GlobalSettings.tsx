import {useT} from '../../i18n';
import {Button, Card, ErrorMessage, InlineAlert, LabeledSelect, TextField} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {settingsCard} from './nav';
import {useGlobalSettings} from './useGlobalSettings';

const card = settingsCard('global');
export function GlobalSettings(props: PageProps) {
  const t = useT();
  const m = useGlobalSettings(props);
  if (!m.available) return null;
  return (
    <Card level={2} title={t(card.titleKey)} titleId={card.headingId}>
      <p className="rp-label">{t('settings.globalNote')}</p>
      <ErrorMessage error={m.error} onRetry={m.retry} />
      {m.failure && <InlineAlert>{m.failure}</InlineAlert>}
      {m.conflict && <InlineAlert>{t('config.changedOnDisk')}</InlineAlert>}
      {m.source && !m.writable && <InlineAlert>{t('config.readOnly')}</InlineAlert>}
      <LabeledSelect label={t('config.source')} value={m.selected} items={m.choices} onChange={m.select} isDisabled={m.busy || !m.source} />
      <form
        id="settings-global-form"
        className="rp-form"
        onSubmit={event => {
          event.preventDefault();
          void m.save();
        }}
      >
        <div className="rp-toolbar top rp-fieldgrid">
          {m.fields.map(field => (
            <div key={field.key} className="rp-field" data-setting={field.key}>
              {field.type === 'boolean' || (field.choices && field.type !== 'integer') ? (
                <LabeledSelect
                  label={field.key}
                  value={field.value}
                  isDisabled={!m.writable || m.busy || field.duplicate}
                  onChange={field.change}
                  items={[
                    {id: '', label: t('settings.globalUnset')},
                    ...(field.type === 'boolean' ? ['true', 'false'] : field.choices!).map(value => ({id: value, label: value})),
                    ...(!field.value || field.choices?.includes(field.value) || ['true', 'false'].includes(field.value)
                      ? []
                      : [{id: field.value, label: field.value}])
                  ]}
                />
              ) : (
                <TextField
                  label={field.key}
                  name={field.key}
                  value={field.value}
                  onChange={field.change}
                  isDisabled={!m.writable || m.busy || field.duplicate}
                  placeholder={t('settings.globalUnset')}
                  error={field.invalid ? t('settings.globalInvalid') : undefined}
                  description={
                    field.max
                      ? t(field.choices ? 'settings.globalRangeChoice' : 'settings.globalRange', {max: field.max, choices: field.choices?.join(', ') ?? ''})
                      : field.units
                        ? t('settings.globalUnits', {units: field.units.filter(Boolean).join(', ')})
                        : field.type === 'list'
                          ? t('settings.globalList')
                          : undefined
                  }
                />
              )}
              {field.duplicate && <span className="rp-label">{t('settings.globalDuplicate')}</span>}
            </div>
          ))}
        </div>
        <div className="rp-toolbar">
          <Button accent type="submit" isPending={m.busy} isDisabled={m.blocked}>
            {t('settings.globalSave')}
          </Button>
          {m.dirty && (
            <Button onPress={m.cancel} isDisabled={m.busy}>
              {t('config.discard')}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
