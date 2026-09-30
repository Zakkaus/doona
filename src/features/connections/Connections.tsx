import {
  Badge,
  Button,
  ConfirmButton,
  HelpRow,
  DetailPanel,
  Kv,
  LabeledSelect,
  Light,
  ChoiceMenu,
  RuleRef,
  Segmented,
  TextField,
  ErrorMessage,
  Tabs,
  TextTooltip,
  MoreMenu
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import {SearchSelect} from '../../ui/SearchSelect';
import {Traffic} from './Traffic';
import {ConnectionTable} from './ConnectionTable';
import {RuleDialog} from '../shared/RuleDialog';
import type {PageProps} from '../../shell/routes';
import {useT} from '../../i18n';
import {useConnectionsPage} from './useConnectionsPage';
import {connectionsTabs} from './nav';
import type {ConnectionView} from './view';

export function Connections(props: PageProps) {
  const t = useT();
  const vm = useConnectionsPage(props);
  const cur = vm.detail;
  const list = (
    <>
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <div className="rp-toolbar">
        {vm.compact ? (
          <span className="rp-filter-row">
            <TextField search label={t('ui.filter')} value={vm.text} onChange={vm.setText} placeholder={t('conn.filterHint')} className="rp-filter" />
            <ChoiceMenu
              label={vm.filterMenu.active ? t('conn.filtersActive', {n: vm.filterMenu.active}) : t('conn.filters')}
              count={vm.filterMenu.active}
              submenus={vm.filterMenu.submenus}
            >
              {t('conn.filters')}
            </ChoiceMenu>
          </span>
        ) : (
          <>
            <TextField search label={t('ui.filter')} value={vm.text} onChange={vm.setText} placeholder={t('conn.filterHint')} className="rp-filter" />
            <Segmented label={t('ui.network')} value={vm.network} onChange={vm.setNetwork} items={vm.networks} />
            <SearchSelect
              side
              label={t('ui.outbound')}
              searchLabel={t('ui.filterOutbounds')}
              value={vm.out}
              onChange={vm.setOut}
              sections={vm.outboundSections}
            />
            <ChoiceMenu quiet label={t('conn.pick')} sections={vm.picks} onAction={vm.pick} searchLabel={t('conn.filterPick')}>
              {t('conn.pick')}
            </ChoiceMenu>
          </>
        )}
        <LabeledSelect
          label={t('conn.group')}
          side
          value={vm.view.group}
          onChange={group => vm.updateView({group: group as ConnectionView['group']})}
          items={[
            {id: 'source', label: t('conn.byClient')},
            {id: 'outbound', label: t('ui.outbound')},
            {id: 'none', label: t('conn.ungrouped')}
          ]}
        />
        {vm.view.group !== 'none' && <Button onPress={vm.toggleCollapseAll}>{t(vm.collapse.allCollapsed ? 'conn.expandAll' : 'conn.collapseAll')}</Button>}
        <ChoiceMenu label={t('conn.columns')} selectionMode="multiple" items={vm.columns} value={vm.visibleColumns} onAction={vm.toggleColumn}>
          {t('conn.columns')}
        </ChoiceMenu>
        {vm.filtered && (
          <Button quiet onPress={vm.clear}>
            {t('ui.clearFilters')}
          </Button>
        )}
        {vm.truncated && <Badge tone="warn">{t('conn.truncated')}</Badge>}
        {vm.visibility && (
          <TextTooltip text={t('conn.visibilityNote')}>
            <Badge>{vm.visibility}</Badge>
          </TextTooltip>
        )}
        <span className="rp-grow" />
        <Button isDisabled={!vm.ruleAction.canAdd} tip={vm.ruleAction.addTip} onPress={vm.ruleAction.openAdd}>
          {t('rule.add')}
        </Button>
        {vm.canClose && <ConfirmButton label={t('conn.closeAll')} {...vm.closeAll} />}
        <Button isDisabled={!vm.canExport} onPress={vm.export}>
          <Download />
          {t('conn.export')}
        </Button>
      </div>
      <div className="rp-with-panel" data-open={cur ? '' : undefined}>
        <ConnectionTable
          collection={vm.collection}
          loading={vm.loading}
          selected={vm.sel}
          onSelect={vm.select}
          selectOnFocus={vm.wide}
          view={vm.view}
          collapse={vm.collapse}
          onToggleGroup={vm.toggleCollapse}
          onSort={sort => vm.updateView({sort})}
        />
        <DetailPanel open={!!cur} title={vm.detailTitle} onClose={() => vm.select(null)}>
          {cur && (
            <>
              <HelpRow help={cur.stateHelp}>
                <Light small tone={cur.tone}>
                  {cur.status}
                </Light>
              </HelpRow>
              {/* One primary action; the rest go into the trailing More menu, Close connection, the destructive one, last. */}
              <div className="rp-cluster">
                {vm.ruleAction.canAdd && <Button onPress={vm.ruleAction.openAdd}>{t('rule.add')}</Button>}
                <MoreMenu
                  actions={[
                    ...(vm.ruleAction.canShow ? [{id: 'show-rule', label: t('conn.showRule'), onAction: () => vm.showRule()}] : []),
                    ...(vm.ruleAction.canEdit ? [{id: 'edit-rule', label: t('conn.editRule'), onAction: () => vm.showRule(true)}] : []),
                    ...(vm.canViewFlow ? [{id: 'view-flow', label: t('conn.viewFlow'), onAction: vm.showFlow}] : []),
                    ...(vm.canTrace ? [{id: 'trace', label: t('conn.trace'), onAction: vm.traceConnection}] : []),
                    ...(cur.source ? [{id: 'only-client', label: t('conn.onlyThisClient'), onAction: vm.onlyClient}] : []),
                    ...(vm.canClose && cur.closable
                      ? [
                          {
                            id: 'close',
                            label: t('conn.close'),
                            negative: true,
                            isPending: vm.close.pending,
                            isDisabled: vm.close.disabled || !!cur.closeReason,
                            reason: cur.closeReason ?? undefined,
                            onAction: vm.close.run
                          }
                        ]
                      : [])
                  ]}
                />
              </div>
              <Kv items={cur.fields} />
              <Kv
                items={[
                  [t('ui.outbound'), cur.outbound],
                  [t('conn.chain'), cur.chain]
                ]}
              />
              <div className="rp-list">
                <span className="rp-label">{t('conn.rule')}</span>
                <RuleRef {...cur.rule} />
              </div>
            </>
          )}
        </DetailPanel>
      </div>
      {vm.notInSnapshot && <span className="rp-label">{t('conn.notInSnapshot')}</span>}
      <RuleDialog dialog={vm.ruleAction.dialog} />
    </>
  );
  const content = {
    list,
    traffic: (
      <Traffic
        records={vm.rows}
        outbounds={vm.outboundKeys}
        latency={vm.latency}
        latencyError={vm.latencyError}
        retryLatency={vm.retryLatency}
        truncated={vm.truncated}
        onSelect={vm.openInList}
      />
    )
  };
  return (
    <div className="rp-page">
      <Tabs
        keepMounted
        label={t('nav.connections')}
        value={vm.tab}
        onChange={vm.setTab}
        items={connectionsTabs().map(tab => ({id: tab.id, label: t(tab.titleKey), content: content[tab.id]}))}
      />
    </div>
  );
}
