import {useT} from '../../i18n';
import {
  ActionHelp,
  Button,
  Card,
  ConfirmDialog,
  ContextualHelp,
  DataTable,
  Disclosure,
  ErrorMessage,
  Kv,
  LabeledSelect,
  Link,
  Loading,
  Switch,
  TextField,
  TextTooltip,
  TimeCell
} from '../../ui/ui';
import ChevronDown from '../../ui/icons/ChevronDown';
import {useGeodataSettings} from './useGeodataSettings';
import {settingsCard} from './nav';

const card = settingsCard('geodata');

// Files are always shown; source controls mount only where the backend lets them be configured.
export function GeodataSettingsCard() {
  const t = useT();
  const m = useGeodataSettings();
  if (!m.available) return null;
  return (
    <Card level={2} title={t(card.titleKey)} titleId={card.headingId}>
      {m.note && <span className="rp-label">{m.note}</span>}
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
              {m.route.group !== null && <ErrorMessage error={m.route.groupsError} onRetry={m.route.retryGroups} />}
            </div>
          )}
          {m.checksum && (
            <div className="rp-ops-group">
              <span className="rp-label">{t('settings.geodataVerifyChecksum')}</span>
              <div className="rp-cluster">
                <Switch aria-label={t('settings.geodataVerifyChecksum')} isSelected={m.checksum.enabled} isDisabled={m.busy} onChange={m.checksum.toggle} />
                <span className="rp-label">{m.checksum.help}</span>
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
        </div>
      )}
      <div className="rp-geodata">
        <div className="rp-ops-group">
          <span className="rp-label">{t('settings.geodataStatus')}</span>
          <ActionHelp reason={m.canUpdate ? m.updateReason : null}>
            <div className="rp-cluster">
              <span role="status" className={m.status.error ? 'rp-geodata-note negative' : undefined}>
                {m.status.text}
              </span>
              {m.status.help && <ContextualHelp {...m.status.help} />}
              {m.canUpdate && (
                <Button isPending={m.updating} isDisabled={m.updateBlocked} onPress={m.update}>
                  {t('settings.geodataUpdateNow')}
                </Button>
              )}
              {m.ready && (
                <Button isDisabled={m.busy} onPress={m.reset.ask}>
                  {t('settings.geodataReset')}
                </Button>
              )}
            </div>
          </ActionHelp>
        </div>
        <ErrorMessage error={m.statusError} onRetry={m.retryStatus} />
        {m.ready && m.status.details.length > 0 && (
          <Disclosure title={t('settings.geodataDetails')}>
            <div className="rp-geodata-details">
              <Kv items={m.status.details} />
            </div>
          </Disclosure>
        )}
        {m.ready && m.lifecycleNote && <span className="rp-label">{m.lifecycleNote}</span>}
        <span className="rp-label">{t('settings.geodataNote')}</span>
        {m.fromConfig && (
          <span className="rp-label rp-geodata-from-config">
            {m.fromConfig.text}{' '}
            <Link appearance="link" external href={m.fromConfig.docs.href}>
              {m.fromConfig.docs.text}
              <span aria-hidden="true">↗</span>
            </Link>
            {m.fromConfig.config && (
              <>
                {' '}
                <Link appearance="link" href={m.fromConfig.config.href}>
                  {m.fromConfig.config.text}
                </Link>
              </>
            )}
          </span>
        )}
        <DataTable
          label={t('settings.geodata')}
          loading={m.geodataLoading}
          rows={m.rows}
          height={160}
          fit
          cols={[
            {id: 'kind', label: t('settings.geodataAsset'), minWidth: 100, grow: 0, isRowHeader: true, render: asset => asset.kind},
            {id: 'size', label: t('settings.geodataSize'), minWidth: 100, grow: 0, render: asset => asset.size},
            {
              id: 'modified',
              label: t('nodes.updated'),
              minWidth: 140,
              grow: 0,
              render: asset => <TimeCell at={asset.modifiedAt} />
            },
            {
              id: 'sha',
              label: 'SHA-256',
              minWidth: 160,
              drop: 2,
              render: asset => (
                <TextTooltip text={asset.shaTitle}>
                  <span className="rp-code">{asset.sha}</span>
                </TextTooltip>
              )
            },
            {
              id: 'source',
              label: t('settings.geodataSource'),
              minWidth: 240,
              grow: 2,
              render: asset => <TextTooltip className="rp-code">{asset.source}</TextTooltip>
            }
          ]}
        />
      </div>
      {m.reset.dialog && (
        <ConfirmDialog
          title={m.reset.dialog.title}
          tone="accent"
          isOpen
          onCancel={m.reset.dialog.cancel}
          confirmLabel={m.reset.dialog.confirm}
          onConfirm={m.reset.dialog.save}
        >
          <p className="rp-label">{m.reset.dialog.help}</p>
        </ConfirmDialog>
      )}
      {m.lacking && (
        <ConfirmDialog title={m.lacking.title} tone="accent" isOpen onCancel={m.lacking.cancel} confirmLabel={m.lacking.confirm} onConfirm={m.lacking.save}>
          <p className="rp-label">{m.lacking.text}</p>
        </ConfirmDialog>
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
                  className="rp-url-field"
                  spellCheck={false}
                  autoComplete="off"
                  label={field.label}
                  value={field.value}
                  error={field.error}
                  isDisabled={m.dialog?.pending}
                  onChange={field.change}
                  action={
                    <>
                      <Button quiet icon small label={field.upLabel} isDisabled={m.dialog?.pending || !field.up} onPress={field.up}>
                        <ChevronDown className="rp-up" />
                      </Button>
                      <Button quiet icon small label={field.downLabel} isDisabled={m.dialog?.pending || !field.down} onPress={field.down}>
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
    </Card>
  );
}
