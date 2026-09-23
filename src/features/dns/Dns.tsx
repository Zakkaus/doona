import {useMemo} from 'react';
import {useT} from '../../i18n';
import Delete from '../../ui/icons/Delete';
import Download from '../../ui/icons/Download';
import {
  Badge,
  Button,
  DataTable,
  ErrorMessage,
  Light,
  TextTooltip,
  TimeCell,
  Kv,
  LabeledSelect,
  Tabs,
  TextField,
  DetailPanel,
  Empty,
  type TableColumn
} from '../../ui/ui';
import type {PageProps} from '../types';
import {FlushCacheButton} from './FlushCache';
import {useDns, useDnsCacheTab, useDnsLogTab} from './useDns';
import {DnsStats} from './Analysis';
import {errorText} from '../../api/error';

type DnsCacheRow = ReturnType<typeof useDnsCacheTab>['rows'][number];
type DnsLogRow = ReturnType<typeof useDnsLogTab>['rows'][number];

export function Dns(props: PageProps) {
  const t = useT();
  const vm = useDns(props);
  const queryTab = (
    <>
      <form
        className="rp-card"
        onSubmit={event => {
          event.preventDefault();
          vm.submit();
        }}
      >
        <div className="rp-toolbar">
          <TextField side label={t('ui.domain')} value={vm.domain} onChange={vm.setDomain} width={280} placeholder="example.com" />
          <LabeledSelect label={t('ui.type')} side value={vm.type} onChange={vm.setType} items={vm.choices} />
          <Button accent type="submit" isPending={vm.pending} isDisabled={vm.disabled}>
            {t('dns.query')}
          </Button>
          {vm.unavailable && <span className="rp-label">{t('dns.unavailable')}</span>}
        </div>
      </form>
      {vm.cards.length > 0 && (
        <div className="rp-col">
          {vm.cards.map(card => (
            <section key={card.id} className="rp-card rp-col">
              <div className="rp-row">
                <div className="rp-cluster">
                  <h3 className="rp-h3">{card.title}</h3>
                  <Badge tone={card.cacheTone}>{card.cacheText}</Badge>
                </div>
                {vm.showCache && (
                  <Button quiet small onPress={vm.viewCache}>
                    {t('dns.viewCache')}
                  </Button>
                )}
              </div>
              <Kv inline items={card.fields} />
              {card.answers.length ? (
                <div className="rp-list">
                  {card.answers.map((answer, i) => (
                    <div key={i} className="rp-code">
                      {answer}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>{t('dns.noAnswers')}</Empty>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
  const content: Record<string, React.ReactNode> = {
    stats: <DnsStats enabled={vm.logEnabled} />,
    query: queryTab,
    cache: <DnsCache domain={vm.filterDomain} clearFilter={vm.clearCacheFilter} />,
    log: <DnsLog enabled={vm.logEnabled} initialName={vm.filterDomain} />
  };
  return (
    <div className="rp-page">
      {vm.error && <ErrorMessage error={vm.error} />}
      {vm.queryError && <ErrorMessage error={vm.queryError} message={t('dns.queryFailed', {error: errorText(vm.queryError, t)})} />}
      <Tabs keepMounted label={t('nav.dns')} items={vm.tabs.map(tab => ({...tab, content: content[tab.id]}))} value={vm.tab} onChange={vm.setTab} />
    </div>
  );
}

function DnsCache({domain, clearFilter}: {domain: string; clearFilter: () => void}) {
  const t = useT();
  const vm = useDnsCacheTab(domain);
  const {remove} = vm;
  // Stable column definitions: a new array on every poll would re-render every visible row.
  const columns = useMemo(
    (): TableColumn<DnsCacheRow>[] => [
      {
        id: 'q',
        label: t('ui.domain'),
        minWidth: 192,
        isRowHeader: true,
        render: entry => (
          <TextTooltip className="rp-code" text={entry.id}>
            {entry.domain}
          </TextTooltip>
        )
      },
      {id: 't', label: t('ui.type'), minWidth: 64, grow: 0, render: entry => entry.type},
      {id: 's', label: t('ui.state'), minWidth: 104, grow: 0, render: entry => entry.status},
      {id: 'e', label: t('dns.expires'), minWidth: 96, render: entry => <TimeCell at={entry.expiresAt} />},
      {id: 'st', label: t('dns.staleUntil'), minWidth: 104, render: entry => <TimeCell at={entry.staleUntil} />},
      {
        id: 'a',
        label: t('ui.delete'),
        minWidth: 80,
        grow: 0,
        render: entry => (
          <Button quiet icon small label={entry.deleteLabel} isPending={entry.pending} isDisabled={entry.disabled} onPress={() => remove(entry.id)}>
            <Delete />
          </Button>
        )
      }
    ],
    [t, remove]
  );
  return (
    <>
      {vm.error && <ErrorMessage error={vm.error} />}
      <div className="rp-toolbar">
        <Kv row items={vm.fields} />
        {vm.coverage.map(badge => (
          <Badge key={badge.id} tone="warn">
            {badge.text}
          </Badge>
        ))}
        {vm.filterText && (
          <Button small onPress={clearFilter}>
            {vm.filterText}
          </Button>
        )}
        <span className="rp-grow" />
        <FlushCacheButton confirmationText={vm.confirmationText} busy={vm.flushPending} isDisabled={vm.flushDisabled} onFlush={vm.flush} />
      </div>
      <DataTable label={t('ui.cache')} height={442} rows={vm.rows} loading={vm.loading} empty={vm.empty} cols={columns} />
    </>
  );
}

function DnsLog({enabled, initialName}: {enabled: boolean | undefined; initialName: string}) {
  const t = useT();
  const vm = useDnsLogTab(enabled, initialName);
  // Stable column definitions: a new array on every poll would re-render every visible row.
  const columns = useMemo(
    (): TableColumn<DnsLogRow>[] => [
      {id: 't', label: t('ui.time'), minWidth: 96, grow: 0, render: record => <TimeCell at={record.observedAt} />},
      {id: 'q', label: t('ui.domain'), minWidth: 200, grow: 2, isRowHeader: true, render: record => <TextTooltip>{record.name}</TextTooltip>},
      {id: 'ty', label: t('ui.type'), minWidth: 64, grow: 0, drop: 3, render: record => record.type},
      {id: 's', label: t('ui.source'), minWidth: 128, drop: 2, render: record => <TextTooltip className="rp-code">{record.source}</TextTooltip>},
      {
        id: 'r',
        label: t('dns.result'),
        minWidth: 160,
        grow: 2,
        render: record =>
          record.resultError ? (
            <Light small tone="err">
              {record.result}
            </Light>
          ) : (
            <TextTooltip className="rp-code">{record.result}</TextTooltip>
          )
      },
      {
        id: 'u',
        label: t('ui.upstream'),
        minWidth: 128,
        drop: 1,
        render: record =>
          record.cached ? (
            <Light small tone="ok">
              {record.upstream}
            </Light>
          ) : (
            <TextTooltip>{record.upstream}</TextTooltip>
          )
      },
      {id: 'e', label: t('ui.elapsed'), minWidth: 72, grow: 0, align: 'end', drop: 4, render: record => record.elapsed}
    ],
    [t]
  );
  return (
    <>
      <div className="rp-toolbar">
        <TextField search label={t('ui.domain')} value={vm.name} onChange={vm.setName} placeholder={t('dns.logFilterHint')} width={240} />
        <LabeledSelect label={t('ui.type')} side value={vm.type} onChange={vm.setType} items={vm.choices} />
        <TextField search label={t('ui.source')} value={vm.src} onChange={vm.setSrc} placeholder="10.0.0.12" width={160} />
        {vm.total && <span className="rp-label">{vm.total}</span>}
        {vm.loaded && <span className="rp-label">{vm.loaded}</span>}
        <span className="rp-grow" />
        <Button isDisabled={!vm.rows.length} onPress={vm.export}>
          <Download />
          {t('dns.exportLog')}
        </Button>
        <Button onPress={vm.refresh}>{t('refresh')}</Button>
        {vm.hasOlder && (
          <Button isPending={vm.loadingOlder} onPress={vm.loadOlder}>
            {t('dns.loadOlder')}
          </Button>
        )}
      </div>
      {vm.error && <ErrorMessage error={vm.error} />}
      {vm.newerWaiting && <p className="rp-label">{t('dns.newerWaiting')}</p>}
      <div className="rp-with-panel" data-open={vm.detail ? '' : undefined}>
        <DataTable
          label={t('dns.log')}
          height={520}
          rows={vm.rows}
          selected={vm.selected}
          onSelect={vm.setSelected}
          selectOnFocus={vm.wide}
          loading={vm.loading}
          empty={vm.empty}
          cols={columns}
        />
        <DetailPanel open={!!vm.detail} title={vm.detailTitle} onClose={() => vm.setSelected(null)}>
          {vm.detail && (
            <>
              <Kv inline items={vm.detail.fields} />
              {vm.detail.answers.length ? (
                <div className="rp-list">
                  {vm.detail.answers.map((answer, i) => (
                    <div key={i} className="rp-code">
                      {answer}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>{t('dns.noAnswers')}</Empty>
              )}
            </>
          )}
        </DetailPanel>
      </div>
    </>
  );
}
