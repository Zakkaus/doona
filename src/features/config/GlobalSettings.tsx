import {useT} from '../../i18n';
import {Button, Card, ErrorMessage, InlineAlert, LabeledSelect, TextField, Toolbar} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {RestartNotice} from './RestartNotice';
import {useGlobalSettings} from './useGlobalSettings';

export function GlobalSettings(props: PageProps) {
  const t = useT();
  const m = useGlobalSettings(props);
  if (!m.available) return null;
  return (
    <form
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
        <Button accent type="submit" isPending={m.busy} isDisabled={m.blocked}>
          {t('config.globalSave')}
        </Button>
        {m.dirty && (
          <Button onPress={m.cancel} isDisabled={m.busy}>
            {t('config.discard')}
          </Button>
        )}
      </Toolbar>
    </form>
  );
}
