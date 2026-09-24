import {useT} from '../../i18n';
import {Button, DataTable, ErrorMessage, InlineAlert, Kv, LabeledSelect, Light, Loading, Switch, TextField, TextTooltip, TimeCell} from '../../ui/ui';
import {useGeodataSettings} from './useGeodataSettings';
import {settingsCard} from './view';

const card = settingsCard('geodata');

// Sources, automatic updates and update status; only mounted where the backend lets them be configured.
export function GeodataSettingsCard() {
  const t = useT();
  const m = useGeodataSettings();
  if (!m.available) return null;
  return (
    <section className="rp-card" aria-labelledby={card.headingId}>
      <div className="rp-row">
        <h2 className="rp-h3" id={card.headingId}>
          {t(card.titleKey)}
        </h2>
        {m.source && <Light tone={m.sourceTone}>{m.source}</Light>}
      </div>
      <span className="rp-label">{t('settings.geodataSourcesNote')}</span>
      <ErrorMessage error={m.error} onRetry={m.retry} />
      {m.loading && (
        <div className="rp-chart-wait form">
          <Loading />
        </div>
      )}
      {m.hasBaseline && (
        <>
          {m.conflict && (
            <p role="alert" className="rp-alert">
              {m.conflict}
            </p>
          )}
          {m.configOwned && <InlineAlert tone="informative">{t('settings.geodataConfigOwned')}</InlineAlert>}
          <Kv
            row
            items={[
              [t('settings.geodataCurrent'), m.current],
              ...(m.presetSize ? [[t('settings.geodataPresetSizeLabel'), m.presetSize] as [string, string]] : [])
            ]}
          />
          <div className="rp-toolbar top rp-fieldgrid">
            {!m.configOwned && (
              <LabeledSelect label={t('settings.geodataSource')} value={m.choice} onChange={m.setChoice} items={m.choices} isDisabled={m.busy} />
            )}
            <TextField
              width={180}
              type="text"
              label={t('settings.geodataInterval')}
              value={m.interval.value}
              isDisabled={m.busy}
              isInvalid={m.interval.invalid}
              onChange={m.interval.change}
              description={m.interval.description}
            />
            <div className="rp-field-row rp-geodata-auto">
              <Switch isSelected={m.enabled} isDisabled={m.busy} onChange={m.setEnabled}>
                {t('settings.geodataAutoUpdate')}
              </Switch>
            </div>
          </div>
          {m.configUrls.length > 0 && (
            <div className="rp-geodata-urls">
              {m.configUrls.map(list => (
                <div key={list.kind} className="rp-field">
                  <span className="rp-label">{list.kind}</span>
                  {list.urls.length ? (
                    list.urls.map(url => (
                      <TextTooltip key={url} className="rp-code">
                        {url}
                      </TextTooltip>
                    ))
                  ) : (
                    <span>—</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {m.custom.length > 0 && (
            <div className="rp-geodata-urls">
              {m.custom.map(list => (
                <div key={list.kind} className="rp-field" role="group" aria-label={list.kind}>
                  {list.fields.map(field => (
                    <TextField
                      key={field.id}
                      type="url"
                      spellCheck={false}
                      autoComplete="off"
                      label={field.label}
                      value={field.value}
                      isDisabled={m.busy}
                      error={field.error}
                      onChange={field.change}
                    />
                  ))}
                  {list.empty && <span className="rp-label">{t('settings.geodataUrlRequired')}</span>}
                </div>
              ))}
            </div>
          )}
          {m.custom.length > 0 && <span className="rp-label">{t('settings.geodataUrlHelp')}</span>}
          {m.missing && (
            <InlineAlert title={m.missing.title}>
              <span className="rp-geodata-lines">
                {m.missing.lines.map(line => (
                  <span key={line}>{line}</span>
                ))}
                <span>{t('settings.geodataMissingHelp')}</span>
              </span>
            </InlineAlert>
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
      <div className="rp-geodata">
        <div className="rp-ops-group">
          <span className="rp-label">{t('settings.geodataStatus')}</span>
          <div className="rp-cluster">
            {m.canUpdate && (
              <Button isPending={m.updating} isDisabled={m.updateBlocked} onPress={m.update}>
                {t('settings.geodataUpdateNow')}
              </Button>
            )}
          </div>
        </div>
        <ErrorMessage error={m.statusError} onRetry={m.retryStatus} />
        <Kv items={m.status} />
        <DataTable
          label={t('settings.geodata')}
          loading={m.rowsLoading}
          rows={m.rows}
          height={160}
          fit
          cols={[
            {id: 'kind', label: t('settings.geodataAsset'), minWidth: 100, grow: 0, isRowHeader: true, render: asset => asset.kind},
            {id: 'size', label: t('settings.geodataSize'), minWidth: 100, grow: 0, align: 'end', render: asset => asset.size},
            {id: 'modified', label: t('nodes.updated'), minWidth: 140, grow: 0, render: asset => <TimeCell at={asset.modifiedAt} />},
            {
              id: 'verified',
              label: t('settings.geodataVerified'),
              minWidth: 120,
              grow: 0,
              render: asset => (
                <Light small tone={asset.verified ? 'ok' : 'muted'}>
                  {t(asset.verified ? 'settings.geodataVerifiedYes' : 'settings.geodataVerifiedNo')}
                </Light>
              )
            },
            {
              id: 'fetched',
              label: t('settings.geodataFetched'),
              minWidth: 240,
              grow: 2,
              render: asset => <TextTooltip className="rp-code">{asset.fetched}</TextTooltip>
            }
          ]}
        />
      </div>
    </section>
  );
}
