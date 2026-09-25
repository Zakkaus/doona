import {useT} from '../../i18n';
import {Button, ConfirmDialog, Disclosure, ErrorMessage, Kv, LabeledSelect, Loading, Switch, TextField} from '../../ui/ui';
import ChevronDown from '../../ui/icons/ChevronDown';
import {useGeodataSettings} from './useGeodataSettings';
import {settingsCard} from './view';

const card = settingsCard('geodata');

// Source, download route, automatic updates and status as labelled rows; each control saves as it changes. Only
// mounted where the backend lets the sources be configured.
export function GeodataSettingsCard() {
  const t = useT();
  const m = useGeodataSettings();
  if (!m.available) return null;
  return (
    <section className="rp-card" aria-labelledby={card.headingId}>
      <h2 className="rp-h3" id={card.headingId}>
        {t(card.titleKey)}
      </h2>
      <span className="rp-label">{m.note}</span>
      <ErrorMessage error={m.error} onRetry={m.retry} />
      {m.loading && (
        <div className="rp-chart-wait ops">
          <Loading />
        </div>
      )}
      {m.ready && (
        <div className="rp-ops">
          <div className="rp-ops-group">
            <span className="rp-label">{t('settings.geodataSource')}</span>
            <div className="rp-cluster">
              <LabeledSelect
                bare
                label={t('settings.geodataSource')}
                value={m.source.value}
                onChange={m.source.change}
                items={m.source.items}
                isDisabled={m.busy}
              />
              {m.source.note && <span className={m.source.note.notice ? 'rp-label rp-geodata-note notice' : 'rp-label'}>{m.source.note.text}</span>}
            </div>
          </div>
          {m.customHosts && (
            <div className="rp-ops-group">
              <span className="rp-label">{t('settings.geodataCustomUrls')}</span>
              <div className="rp-cluster">
                <Button isDisabled={m.busy} onPress={m.editCustom}>
                  {t('settings.geodataEdit')}
                </Button>
                <span className="rp-label">{m.customHosts}</span>
              </div>
            </div>
          )}
          {m.route && (
            <div className="rp-ops-group">
              <span className="rp-label">{t('settings.geodataRoute')}</span>
              <div className="rp-cluster">
                <LabeledSelect
                  bare
                  label={t('settings.geodataRoute')}
                  value={m.route.value}
                  onChange={m.route.change}
                  items={m.route.items}
                  isDisabled={m.busy}
                />
                {m.route.group !== null && (
                  <LabeledSelect
                    bare
                    label={t('settings.geodataRouteGroup')}
                    value={m.route.group}
                    onChange={m.route.pickGroup}
                    items={m.route.groups}
                    isDisabled={m.busy}
                  />
                )}
              </div>
            </div>
          )}
          <div className="rp-ops-group">
            <span className="rp-label">{t('settings.geodataAutoUpdate')}</span>
            <div className="rp-cluster">
              <Switch aria-label={t('settings.geodataAutoUpdate')} isSelected={m.auto.enabled} isDisabled={m.busy} onChange={m.auto.toggle} />
              {m.auto.enabled && (
                <LabeledSelect
                  bare
                  label={t('settings.geodataInterval')}
                  value={m.auto.interval}
                  onChange={m.auto.pick}
                  items={m.auto.intervals}
                  isDisabled={m.busy}
                />
              )}
            </div>
          </div>
          <div className="rp-ops-group">
            <span className="rp-label">{t('settings.geodataStatus')}</span>
            <div className="rp-cluster">
              <span role="status" className={m.status.error ? 'rp-geodata-note negative' : undefined}>
                {m.status.text}
              </span>
              {m.canUpdate && (
                <Button isPending={m.updating} isDisabled={m.updateBlocked} onPress={m.update}>
                  {t('settings.geodataUpdateNow')}
                </Button>
              )}
            </div>
          </div>
          <ErrorMessage error={m.statusError} onRetry={m.retryStatus} />
          {m.status.details.length > 0 && (
            <Disclosure title={t('settings.geodataDetails')}>
              <div className="rp-geodata-details">
                <Kv items={m.status.details} />
              </div>
            </Disclosure>
          )}
          {m.seededFromConfig && <span className="rp-label">{t('settings.geodataConfigSeeded')}</span>}
        </div>
      )}
      {m.dialog && (
        <ConfirmDialog
          title={t('settings.geodataCustomUrls')}
          tone="accent"
          isOpen
          onCancel={m.dialog.cancel}
          confirmLabel={m.dialog.confirm}
          onConfirm={m.dialog.save}
          isPending={m.dialog.pending}
          isDisabled={m.dialog.blocked}
        >
          {m.dialog.lists.map(list => (
            <div key={list.kind} className="rp-field" role="group" aria-label={list.kind}>
              {list.fields.map(field => (
                <TextField
                  key={field.id}
                  type="url"
                  spellCheck={false}
                  autoComplete="off"
                  label={field.label}
                  value={field.value}
                  error={field.error}
                  onChange={field.change}
                  action={
                    <>
                      <Button quiet icon small label={field.upLabel} isDisabled={!field.up} onPress={field.up}>
                        <ChevronDown className="rp-up" />
                      </Button>
                      <Button quiet icon small label={field.downLabel} isDisabled={!field.down} onPress={field.down}>
                        <ChevronDown />
                      </Button>
                    </>
                  }
                />
              ))}
              {list.empty && <span className="rp-label">{t('settings.geodataUrlRequired')}</span>}
            </div>
          ))}
          <span className="rp-label">{t('settings.geodataUrlHelp')}</span>
        </ConfirmDialog>
      )}
    </section>
  );
}
