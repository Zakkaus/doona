import {useMemo} from 'react';
import {useT} from '../../i18n';
import Delete from '../../ui/icons/Delete';
import Download from '../../ui/icons/Download';
import Refresh from '../../ui/icons/Refresh';
import {
  ActionGroup,
  ActionHelp,
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
  Switch,
  DetailPanel,
  ConfirmButton,
  Empty,
  Card,
  cardClass,
  HelpRow,
  type Action,
  type TableColumn
} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {useDns, useDnsCacheTab, useDnsLogTab} from './useDns';
import {DnsStats} from './Analysis';
import type {MatchKind} from './match';
import {RuleDialog} from '../shared/RuleDialog';
import type {useQuickRule} from '../shared/useQuickRule';

type DnsCacheRow = ReturnType<typeof useDnsCacheTab>['rows'][number];
type DnsLogRow = ReturnType<typeof useDnsLogTab>['rows'][number];
// What a tab needs of the page's add-rule dialog.
type QuickRule = Pick<ReturnType<typeof useQuickRule>, 'canAdd' | 'open'>;

export function Dns(props: PageProps) {
  const t = useT();
  const vm = useDns(props);
  const queryTab = (
    <>
      {vm.queryError && <ErrorMessage error={vm.queryError} onRetry={vm.submit} message={error => t('dns.queryFailed', {error})} />}
      <form
        className={cardClass()}
        onSubmit={event => {
          event.preventDefault();
          vm.submit();
        }}
      >
        <ActionHelp reason={vm.reason}>
          <div className="rp-toolbar">
            <TextField side label={t('ui.domain')} value={vm.domain} onChange={vm.setDomain} width={280} placeholder="example.com" />
            <LabeledSelect label={t('ui.type')} side value={vm.type} onChange={vm.setType} items={vm.choices} />
            {vm.upstreams.length > 0 && <LabeledSelect label={t('ui.upstream')} side value={vm.upstream} onChange={vm.setUpstream} items={vm.upstreams} />}
            <Switch isSelected={vm.bypassCache} onChange={vm.setBypassCache}>
              {t('dns.bypassCache')}
            </Switch>
            <Button accent type="submit" isPending={vm.pending} isDisabled={vm.disabled}>
              {t('dns.query')}
            </Button>
          </div>
        </ActionHelp>
      </form>
      {vm.cards.length > 0 && (
        <div className="rp-col">
          {vm.cards.map(card => (
            <Card key={card.id} className="rp-col">
              <div className="rp-row">
                <div className="rp-cluster">
                  <h2 className="rp-h3">{card.title}</h2>
                  <Badge tone={card.cacheTone}>{card.cacheText}</Badge>
                </div>
                <div className="rp-cluster">
                  {vm.rule.canAdd(card.seed) && (
                    <Button quiet small onPress={() => vm.rule.open(card.seed)}>
                      {t('rule.add')}
                    </Button>
                  )}
                  {vm.showCache && (
                    <Button quiet small onPress={vm.viewCache}>
                      {t('dns.viewCache')}
                    </Button>
                  )}
                </div>
              </div>
              <Kv inline items={card.fields} />
              {card.answers.length ? (
                <div className="rp-list">
                  {card.answers.map((answer, i) => {
                    const address = card.answerSeeds[i];
                    return (
                      <div key={i} className="rp-cluster">
                        <div className="rp-code">{answer}</div>
                        {address && vm.rule.canAdd(address.seed) && (
                          <Button quiet small label={t('dns.addRuleFor', {value: address.address})} onPress={() => vm.rule.open(address.seed)}>
                            {t('rule.add')}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty>{t('dns.noAnswers')}</Empty>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
  const content: Record<string, React.ReactNode> = {
    stats: <DnsStats enabled={vm.logEnabled} links={{cache: vm.cacheHref, log: vm.logHref}} />,
    query: queryTab,
    cache: <DnsCache domain={vm.filterDomain} clearFilter={vm.clearCacheFilter} rule={vm.rule} />,
    log: <DnsLog enabled={vm.logEnabled} initialName={vm.filterDomain} initialSrc={vm.filterDevice} links={vm.logLinks} rule={vm.rule} />
  };
  return (
    <div className="rp-page">
      <Tabs keepMounted label={t('nav.dns')} items={vm.tabs.map(tab => ({...tab, content: content[tab.id]}))} value={vm.tab} onChange={vm.setTab} />
      <RuleDialog dialog={vm.rule.dialog} />
    </div>
  );
}

function DnsCache({domain, clearFilter, rule}: {domain: string; clearFilter: () => void; rule: QuickRule}) {
  const t = useT();
  const vm = useDnsCacheTab(domain);
  const {remove} = vm;
  // Stable column definitions: a new array on every poll would re-render every visible row.
  const columns = useMemo(
    (): TableColumn<DnsCacheRow>[] => [
      {
        id: 'q',
        label: t('ui.domain'),
        text: 'wrap',
        minWidth: 320,
        isRowHeader: true,
        render: entry => <span className="rp-code">{entry.domain}</span>
      },
      // Wide enough for a six-letter type, DNSKEY (about 52px), with the cell's padding.
      {id: 't', label: t('ui.type'), minWidth: 88, grow: 0, drop: 3, render: entry => entry.type},
      {id: 's', label: t('ui.state'), minWidth: 104, grow: 0, render: entry => entry.status},
      // Wide enough for the longest relative time ahead, English "in 59 minutes" (about 90px), with the cell's padding.
      {id: 'e', label: t('dns.expires'), minWidth: 128, drop: 2, render: entry => <TimeCell at={entry.expiresAt} />},
      {id: 'st', label: t('dns.staleUntil'), minWidth: 128, drop: 1, render: entry => <TimeCell at={entry.staleUntil} />},
      {
        id: 'a',
        actions: true,
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
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <ActionHelp reason={vm.flushReason}>
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
          <Button isDisabled={!vm.seed || !rule.canAdd(vm.seed)} tip={vm.seed ? undefined : t('ui.selectRow')} onPress={() => vm.seed && rule.open(vm.seed)}>
            {t('rule.add')}
          </Button>
          <ConfirmButton
            label={t('dns.flushAll')}
            confirmationText={vm.confirmationText}
            isPending={vm.flushPending}
            isDisabled={vm.flushPending || vm.flushDisabled}
            onConfirm={vm.flush}
            onAbort={vm.abortFlush}
          />
        </div>
      </ActionHelp>
      {(vm.deleteBy.name || vm.deleteBy.entry) && (
        <ActionHelp reason={vm.matchReason}>
          <div className="rp-toolbar">
            <LabeledSelect side label={t('rule.kind')} value={vm.matchKind} onChange={k => vm.setMatchKind(k as MatchKind)} items={vm.matchKinds} />
            <TextField
              side
              label={t('dns.pattern')}
              value={vm.matchText}
              onChange={vm.setMatchText}
              error={vm.matchError}
              help={vm.matchKind === 'regex' ? {title: t('dns.pattern'), text: t('dns.regexHelp')} : undefined}
              width={280}
              placeholder="example.com"
            />
            <LabeledSelect side label={t('ui.type')} value={vm.matchType} onChange={vm.setMatchType} items={vm.matchTypes} />
            <ConfirmButton
              label={t('dns.deleteMatching')}
              confirmationText={vm.matchConfirmation}
              details={
                <ul className="rp-impact">
                  {vm.matchListed.map(entry => (
                    <li key={entry.entry_id}>
                      <span className="rp-cluster nowrap">
                        <TextTooltip className="rp-code">{entry.domain}</TextTooltip>
                        <span className="rp-note">{entry.type}</span>
                      </span>
                    </li>
                  ))}
                  {vm.matchMore && <li className="rp-note">{vm.matchMore}</li>}
                </ul>
              }
              isPending={vm.matchPending}
              isDisabled={vm.matchDisabled}
              onConfirm={vm.removeMatching}
              onAbort={vm.abortFlush}
            />
          </div>
        </ActionHelp>
      )}
      <ActionHelp reason={vm.deleteReason} above>
        <DataTable
          label={t('ui.cache')}
          height={442}
          fit
          rows={vm.rows}
          selected={vm.selected}
          onSelect={vm.setSelected}
          loading={vm.loading}
          empty={vm.empty}
          cols={columns}
        />
      </ActionHelp>
    </>
  );
}

function DnsLog({
  enabled,
  initialName,
  initialSrc,
  links,
  rule
}: {
  enabled: boolean | undefined;
  initialName: string;
  initialSrc: string;
  links: Action[];
  rule: QuickRule;
}) {
  const t = useT();
  const vm = useDnsLogTab(enabled, initialName, initialSrc);
  const seed = vm.detail?.seed;
  // Stable column definitions: a new array on every poll would re-render every visible row.
  const columns = useMemo(
    (): TableColumn<DnsLogRow>[] => [
      // Wide enough for the longest relative time, English "59 seconds ago" (about 101px), with the cell's padding.
      {id: 't', label: t('ui.time'), minWidth: 140, grow: 0, render: record => <TimeCell at={record.observedAt} />},
      {id: 'q', label: t('ui.domain'), minWidth: 200, grow: 2, isRowHeader: true, render: record => <TextTooltip>{record.name}</TextTooltip>},
      // Wide enough for a six-letter type, DNSKEY (about 52px), with the cell's padding.
      {id: 'ty', label: t('ui.type'), minWidth: 88, grow: 0, drop: 3, render: record => record.type},
      {id: 's', label: t('ui.device'), minWidth: 128, drop: 2, render: record => <TextTooltip className="rp-code">{record.source}</TextTooltip>},
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
      // Wide enough for four digits and the unit, "9999 ms" (about 55px), with the cell's padding.
      {id: 'e', label: t('ui.elapsed'), minWidth: 88, grow: 0, drop: 4, render: record => record.elapsed}
    ],
    [t]
  );
  return (
    <>
      <div className="rp-toolbar">
        <TextField search label={t('ui.domain')} value={vm.name} onChange={vm.setName} placeholder={t('dns.logFilterHint')} width={240} />
        <LabeledSelect label={t('ui.type')} side value={vm.type} onChange={vm.setType} items={vm.choices} />
        <TextField search label={t('ui.device')} value={vm.src} onChange={vm.setSrc} error={vm.srcError} placeholder="10.0.0.12" width={160} />
        {vm.total && (
          <HelpRow help={vm.totalHelp}>
            <span className="rp-label">{vm.total}</span>
          </HelpRow>
        )}
        {vm.loaded && <span className="rp-label">{vm.loaded}</span>}
        <span className="rp-grow" />
        <ActionGroup
          actions={[
            // On a phone the first action stays a button, so Refresh keeps its place ahead of Export.
            {id: 'refresh', label: t('ui.refresh'), icon: <Refresh className="rp-spin-on-press" />, isPending: vm.refreshing, onAction: vm.refresh},
            {id: 'export', label: t('dns.exportLog'), icon: <Download />, isDisabled: !vm.rows.length, onAction: vm.export},
            {
              id: 'rule',
              label: t('rule.add'),
              isDisabled: !seed || !rule.canAdd(seed),
              reason: seed ? undefined : t('ui.selectRow'),
              onAction: () => seed && rule.open(seed)
            },
            ...links,
            ...(vm.hasOlder ? [{id: 'older', label: t('dns.loadOlder'), isPending: vm.loadingOlder, onAction: vm.loadOlder}] : [])
          ]}
        />
      </div>
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      {vm.newerWaiting && <p className="rp-note">{t('dns.newerWaiting')}</p>}
      <div className="rp-with-panel" data-open={vm.detail ? '' : undefined}>
        <DataTable
          label={t('dns.log')}
          rowDetail
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
              {rule.canAdd(vm.detail.seed) && (
                <div className="rp-cluster">
                  <Button small onPress={() => rule.open(vm.detail!.seed)}>
                    {t('rule.add')}
                  </Button>
                </div>
              )}
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
      {/* On a phone the toolbar's copy is in its overflow menu, so the log's continuation also sits at its end. */}
      {vm.hasOlder && (
        <div className="rp-narrow-only">
          <div className="rp-cluster">
            <Button small isPending={vm.loadingOlder} onPress={vm.loadOlder}>
              {t('dns.loadOlder')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
