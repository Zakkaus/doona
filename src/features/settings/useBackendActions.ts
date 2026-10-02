import {useCapabilities, useGeodata, useVersion} from '../../store';
import {LOCALE, useLang, useT} from '../../i18n';
import {toast, toastFailure} from '../../ui/ui';
import {geodataFromConfig, geodataRows, geodataUpdateReason} from './view';
import {backendActionsVisible, geodataConfigurable} from './nav';
export function useBackendActions() {
  const t = useT();
  const lang = useLang();
  const locale = LOCALE[lang];
  const capabilities = useCapabilities();
  const version = useVersion();
  const resources = capabilities.data?.resources;
  // Where sources are configurable, geodata has its own card with the update button, so this card leaves it out.
  const plainGeodata = !!resources?.geodata.available && !geodataConfigurable(resources);
  const geodata = useGeodata(plainGeodata);
  const lifecycle = !!resources?.operations.available && (['reload', 'suspend', 'resume'] as const).some(kind => resources[kind].available);
  return {
    visible: backendActionsVisible(resources),
    lifecycle,
    geodataBusy: geodata.busy,
    geodataBlocked: geodata.busy || !geodata.data,
    geodataReason: geodataUpdateReason({busy: geodata.busy, loaded: !!geodata.data, failed: !!geodata.error}, t),
    geodataLoading: geodata.loading && !geodata.data,
    geodataError: geodata.error,
    retryGeodata: geodata.refetch,
    // Only while capabilities are on their way; a failed load is reported by the page banner, not a spinner.
    waiting: !resources && !capabilities.error,
    note: t('settings.actionsNote'),
    canFlush: !!(resources?.dns_cache.available && resources.dns_cache.flush),
    canRefresh: !!(resources?.providers.available && resources.providers.can_refresh),
    canClose: !!(resources?.connections.available && resources.connections.can_close),
    canUpdate: !!resources?.geodata.can_update,
    hasGeodata: plainGeodata,
    fromConfig: geodataFromConfig(capabilities.data, version.data, t, lang),
    rows: geodataRows(geodata.data?.assets ?? [], locale),
    update: () =>
      void geodata.update().then(
        result => {
          if (result) toast('positive', t('settings.geodataUpdated'));
        },
        error => toastFailure(error, t, t('settings.geodataFailed'))
      )
  };
}
