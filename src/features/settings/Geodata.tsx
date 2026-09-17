import {useCapabilities, useGeodata} from '../../api/store';
import {formatBytes} from '../../api/u64';
import {localTime, relativeStart} from '../../api/selectors';
import {LOCALE, useLang, useT} from '../../i18n';
import {Button, DataTable, ErrorMessage, TextTooltip, errorText, toast} from '../../ui/ui';

// The geosite and geoip files the routing rules match against: what is loaded, and one button to download the
// latest from the configured sources and reload. Shown only when the backend reports the resource.
export function GeodataCard() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const resources = useCapabilities().data?.resources;
  const available = resources?.geodata.available ?? false;
  const geodata = useGeodata(available);
  if (!available) return null;
  return (
    <section className="rp-card" aria-labelledby="settings-geodata">
      <div className="rp-row">
        <h2 className="rp-h3" id="settings-geodata">
          {t('settings.geodata')}
        </h2>
        <span className="rp-grow" />
        {resources?.geodata.can_update && (
          <Button
            small
            isPending={geodata.busy}
            isDisabled={geodata.busy || !geodata.data}
            onPress={() => {
              void geodata.update().then(
                result => {
                  if (result) toast('positive', t('settings.geodataUpdated'));
                },
                (error: unknown) => toast('negative', errorText(error))
              );
            }}
          >
            {t('settings.geodataUpdate')}
          </Button>
        )}
      </div>
      <span className="rp-label">{t('settings.geodataNote')}</span>
      <ErrorMessage error={geodata.error} />
      <DataTable
        label={t('settings.geodata')}
        loading={geodata.loading && !geodata.data}
        rows={(geodata.data?.assets ?? []).map(asset => ({...asset, id: asset.kind}))}
        height={160}
        cols={[
          {id: 'kind', label: t('settings.geodataAsset'), minWidth: 100, grow: 0, isRowHeader: true},
          {id: 'size', label: t('settings.geodataSize'), minWidth: 100, grow: 0, align: 'end'},
          {id: 'modified', label: t('nodes.updated'), minWidth: 140, grow: 0},
          {id: 'sha', label: 'SHA-256', minWidth: 160, drop: 2},
          {id: 'source', label: t('settings.geodataSource'), minWidth: 240, grow: 2, drop: 1}
        ]}
        render={asset => [
          asset.kind,
          formatBytes(asset.size_bytes),
          <TextTooltip text={asset.modified_at ? localTime(asset.modified_at, locale) : undefined}>{relativeStart(asset.modified_at, locale)}</TextTooltip>,
          <TextTooltip text={asset.sha256}>
            <span className="rp-code">{asset.sha256.slice(0, 12)}</span>
          </TextTooltip>,
          asset.source_redacted ?? '—'
        ]}
      />
    </section>
  );
}
