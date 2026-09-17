import {useState} from 'react';
import {getApi} from '../../api';
import {
  useCapabilities,
  useConnectionClose,
  useConnections,
  useGeodata,
  useGroups,
  useProviderRefresh,
  useProviders,
  useRuntime,
  useRuntimeMode,
  useRuntimeOperations
} from '../../api/store';
import {formatBytes} from '../../api/u64';
import {localTime, relativeStart} from '../../api/selectors';
import {LOCALE, formatNumber, useLang, useT} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {Button, DataTable, ErrorMessage, ModalDialog, Segmented, TextTooltip, errorText, toast} from '../../ui/ui';

const operationLabels: Record<'reload' | 'suspend' | 'resume', Key> = {reload: 'ov.reload', suspend: 'ov.suspend', resume: 'ov.resume'};
const modeLabels: Record<string, Key> = {rule: 'mode.rule', global: 'mode.global', direct: 'mode.direct'};

// One place for the one-shot backend actions the contract offers: reload, suspend or resume, the outbound mode,
// the DNS cache, subscriptions, connections and the geodata files. Each action lives on its own page too; this
// card only gathers them, and every button is gated on the capability that backs it.
export function BackendActionsCard() {
  const t = useT();
  const locale = LOCALE[useLang()];
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const runtime = useRuntime(!!resources?.runtime.available);
  const operations = useRuntimeOperations(runtime.data, capabilities.data, runtime.refetch);
  const runtimeMode = useRuntimeMode(resources?.runtime_mode?.available !== false);
  const groups = useGroups();
  const providers = useProviders(resources?.providers.available !== false);
  const refresh = useProviderRefresh(providers.refetch);
  const connections = useConnections(undefined);
  const closing = useConnectionClose(connections.refetch);
  const geodata = useGeodata(resources?.geodata.available ?? false);
  const [flushing, setFlushing] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const fail = (error: unknown) => toast('negative', errorText(error));
  const mode = runtimeMode.data?.mode ?? 'rule';
  const target = runtimeMode.data?.target ?? groups.data?.[0]?.id ?? '';
  const subscriptions = (providers.data?.providers ?? []).filter(item => item.kind === 'subscription');
  const live = (connections.data ? [...connections.data.tcp, ...connections.data.udp] : []).map(c => c.id);

  const runOperation = async (kind: 'reload' | 'suspend' | 'resume') => {
    try {
      const result = await operations.run(kind);
      if (result)
        toast(
          result.status === 'succeeded' ? 'positive' : 'negative',
          t('ov.operationResult', {
            action: t(operationLabels[kind]),
            status: t(result.status === 'succeeded' ? 'ov.succeeded' : 'ov.failed'),
            id: result.operation_id
          })
        );
    } catch (error) {
      toast('negative', t('ov.operationError', {error: errorText(error)}));
    }
  };
  const flush = async () => {
    setFlushing(true);
    try {
      const result = await api.flushDnsCache();
      toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.flushFailed', {error: errorText(error)}));
    } finally {
      setFlushing(false);
    }
  };
  // Subscriptions refresh one after another: the backend keeps one refresh per provider in flight anyway.
  const refreshAll = async () => {
    setRefreshingAll(true);
    let done = 0;
    try {
      for (const item of subscriptions) {
        try {
          if (await refresh.refresh(item.id)) done += 1;
        } catch (error) {
          fail(error);
        }
      }
      toast(done ? 'positive' : 'negative', t('settings.refreshedAll', {n: formatNumber(done, locale), total: formatNumber(subscriptions.length, locale)}));
    } finally {
      setRefreshingAll(false);
    }
  };
  return (
    <section className="rp-card" aria-labelledby="settings-actions">
      <h2 className="rp-h3" id="settings-actions">
        {t('settings.actions')}
      </h2>
      <span className="rp-label">{t('settings.actionsNote')}</span>
      <ErrorMessage error={runtime.error} />
      <div className="rp-toolbar">
        {(['reload', 'suspend', 'resume'] as const)
          .filter(kind => operations.canRun(kind) || operations.busy === kind)
          .map(kind => (
            <Button key={kind} secondary isPending={operations.busy === kind} isDisabled={!!operations.busy} onPress={() => void runOperation(kind)}>
              {t(operationLabels[kind])}
            </Button>
          ))}
        {resources?.runtime_mode?.available && (
          <Segmented
            label={t('act.mode')}
            value={mode}
            onChange={next => {
              void runtimeMode
                .change(next === 'global' ? {mode: 'global', target} : {mode: next as 'rule' | 'direct'})
                .then(result => toast('positive', t('act.modeChanged', {mode: t(modeLabels[result.mode])})), fail);
            }}
            items={[
              ['rule', t('mode.rule')],
              ['global', t('mode.global')],
              ['direct', t('mode.direct')]
            ]}
          />
        )}
      </div>
      <div className="rp-toolbar">
        {resources?.dns_cache.available && resources.dns_cache.flush && (
          <ModalDialog
            alert
            narrow
            title={t('dns.flushAll')}
            trigger={
              <Button negative quiet isPending={flushing} isDisabled={flushing}>
                {t('dns.flushAll')}
              </Button>
            }
            footer={close => (
              <>
                <Button onPress={close}>{t('ui.cancel')}</Button>
                <Button
                  negative
                  onPress={() => {
                    close();
                    void flush();
                  }}
                >
                  {t('dns.flushAll')}
                </Button>
              </>
            )}
          >
            <p>{t('settings.flushConfirm')}</p>
          </ModalDialog>
        )}
        {resources?.providers.can_refresh && (
          <Button secondary isPending={refreshingAll} isDisabled={refreshingAll || !!refresh.busy || !subscriptions.length} onPress={() => void refreshAll()}>
            {t('settings.refreshAll', {n: formatNumber(subscriptions.length, locale)})}
          </Button>
        )}
        {resources?.connections.can_close && (
          <ModalDialog
            title={t('conn.closeAll')}
            narrow
            alert
            trigger={
              <Button negative quiet isDisabled={!live.length || !!closing.busy} isPending={closing.busy === 'all'}>
                {t('conn.closeAll')}
              </Button>
            }
            footer={close => (
              <>
                <Button onPress={close}>{t('ui.cancel')}</Button>
                <Button
                  negative
                  onPress={() => {
                    close();
                    void closing
                      .closeAll(live)
                      .then(tally => toast(tally.closed ? 'positive' : 'negative', t('conn.closedAll', {closed: tally.closed, skipped: tally.skipped})), fail);
                  }}
                >
                  {t('conn.closeAll')}
                </Button>
              </>
            )}
          >
            <span className="rp-label">{t('conn.closeAllHelp', {n: live.length})}</span>
          </ModalDialog>
        )}
        {resources?.geodata.can_update && (
          <Button
            secondary
            isPending={geodata.busy}
            isDisabled={geodata.busy || !geodata.data}
            onPress={() => {
              void geodata.update().then(result => {
                if (result) toast('positive', t('settings.geodataUpdated'));
              }, fail);
            }}
          >
            {t('settings.geodataUpdate')}
          </Button>
        )}
      </div>
      {resources?.geodata.available && (
        <>
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
        </>
      )}
    </section>
  );
}
