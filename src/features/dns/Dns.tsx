import {useT} from '../../i18n';
import Delete from '../../ui/icons/Delete';
import Download from '../../ui/icons/Download';
import {Badge, Button, DataTable, ErrorMessage, Light, TextTooltip, Kv, LabeledSelect, Tabs, TextField, DetailPanel, Empty} from '../../ui/ui';
import type {PageProps} from '../types';
import {FlushCacheButton} from './FlushCache';
import {useDns, useDnsCache, useDnsLog} from './useDns';

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
    query: queryTab,
    cache: <DnsCache domain={vm.filterDomain} clearFilter={vm.clearCacheFilter} />,
    log: <DnsLog enabled={vm.logEnabled} initialName={vm.filterDomain} />
  };
  return (
    <div className="rp-page">
      {vm.error && <ErrorMessage error={vm.error} />}
      <Tabs label={t('nav.dns')} items={vm.tabs.map(tab => ({...tab, content: content[tab.id]}))} value={vm.tab} onChange={vm.setTab} />
    </div>
  );
}

function DnsCache({domain, clearFilter}: {domain: string; clearFilter: () => void}) {
  const t = useT();
  const vm = useDnsCache(domain);
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
      <DataTable
        label={t('ui.cache')}
        height={442}
        rows={vm.rows}
        loading={vm.loading}
        empty={vm.empty}
        cols={[
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
          {id: 'e', label: t('dns.expires'), minWidth: 96, render: entry => <TextTooltip text={entry.expiresTooltip}>{entry.expires}</TextTooltip>},
          {id: 'st', label: t('dns.staleUntil'), minWidth: 104, render: entry => <TextTooltip text={entry.staleTooltip}>{entry.stale}</TextTooltip>},
          {
            id: 'a',
            label: t('ui.delete'),
            minWidth: 56,
            grow: 0,
            render: entry => (
              <Button quiet icon small label={entry.deleteLabel} isPending={entry.pending} isDisabled={entry.disabled} onPress={() => vm.remove(entry.id)}>
                <Delete />
              </Button>
            )
          }
        ]}
      />
    </>
  );
}

function DnsLog({enabled, initialName}: {enabled: boolean; initialName: string}) {
  const t = useT();
  const vm = useDnsLog(enabled, initialName);
  return (
    <>
      <div className="rp-toolbar">
        <TextField search label={t('ui.domain')} value={vm.name} onChange={vm.setName} placeholder={t('dns.logFilterHint')} width={240} />
        <LabeledSelect label={t('ui.type')} side value={vm.type} onChange={vm.setType} items={vm.choices} />
        <TextField search label={t('ui.source')} value={vm.src} onChange={vm.setSrc} placeholder="10.0.0.12" width={160} />
        {vm.total && <span className="rp-label">{vm.total}</span>}
        <span className="rp-grow" />
        <Button isDisabled={!vm.rows.length} onPress={vm.export}>
          <Download />
          {t('dns.exportLog')}
        </Button>
      </div>
      {vm.error && <ErrorMessage error={vm.error} />}
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
          cols={[
            {id: 't', label: t('ui.time'), minWidth: 96, grow: 0, render: record => <TextTooltip text={record.timeTooltip}>{record.time}</TextTooltip>},
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
          ]}
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
