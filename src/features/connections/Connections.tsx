import {Menu} from 'react-aria-components';
import {
  Badge,
  Button,
  ConfirmButton,
  DetailPanel,
  Kv,
  LabeledSelect,
  Light,
  ChoiceMenu,
  MenuButton,
  MenuChoice,
  RuleRef,
  Segmented,
  TextField,
  ErrorMessage,
  Tabs,
  TextTooltip
} from '../../ui/ui';
import Download from '../../ui/icons/Download';
import {Traffic} from './Traffic';
import {ConnectionTable} from './ConnectionTable';
import {RuleDialog} from './RuleDialog';
import type {PageProps} from '../../shell/routes';
import {useT} from '../../i18n';
import {useConnectionsPage} from './useConnectionsPage';
import type {ConnectionView} from './view';

export function Connections(props: PageProps) {
  const t = useT();
  const vm = useConnectionsPage(props);
  const cur = vm.detail;
  const list = (
    <>
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <div className="rp-toolbar">
        <TextField search label={t('ui.filter')} value={vm.text} onChange={vm.setText} placeholder={t('conn.filterHint')} width={240} />
        <Segmented label={t('ui.network')} value={vm.network} onChange={vm.setNetwork} items={vm.networks} />
        <LabeledSelect label={t('ui.outbound')} side value={vm.out} onChange={vm.setOut} items={vm.outbounds} />
        <ChoiceMenu quiet label={t('conn.pick')} sections={vm.picks} onAction={vm.pick}>
          {t('conn.pick')}
        </ChoiceMenu>
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
        <MenuButton
          label={t('conn.columns')}
          content={
            <Menu
              aria-label={t('conn.columns')}
              selectionMode="multiple"
              shouldCloseOnSelect={false}
              selectedKeys={vm.visibleColumns}
              onAction={vm.toggleColumn}
            >
              {vm.columns.map(column => (
                <MenuChoice key={column.id} item={column} />
              ))}
            </Menu>
          }
        >
          {t('conn.columns')}
        </MenuButton>
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
          onSort={sort => vm.updateView({sort})}
        />
        <DetailPanel open={!!cur} title={vm.detailTitle} onClose={() => vm.select(null)}>
          {cur && (
            <>
              <Light small tone={cur.tone}>
                {cur.status}
              </Light>
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
              {(vm.ruleAction.canAdd || vm.ruleAction.canShow) && (
                <div className="rp-cluster">
                  {vm.ruleAction.canAdd && <Button onPress={vm.ruleAction.openAdd}>{t('rule.add')}</Button>}
                  {vm.ruleAction.canShow && (
                    <Button quiet onPress={vm.showRule}>
                      {t('conn.showRule')}
                    </Button>
                  )}
                </div>
              )}
              <div className="rp-cluster">
                {vm.canViewFlow && <Button onPress={vm.showFlow}>{t('conn.viewFlow')}</Button>}
                {cur.source && (
                  <Button quiet onPress={vm.onlyClient}>
                    {t('conn.onlyThisClient')}
                  </Button>
                )}
                {vm.canClose && cur.closable && (
                  <>
                    <span className="rp-grow" />
                    <Button negative quiet isPending={vm.close.pending} isDisabled={vm.close.disabled} onPress={vm.close.run}>
                      {t('conn.close')}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DetailPanel>
      </div>
      {vm.notInSnapshot && <span className="rp-label">{t('conn.notInSnapshot')}</span>}
      <RuleDialog dialog={vm.ruleAction.dialog} />
    </>
  );
  return (
    <div className="rp-page">
      <Tabs
        keepMounted
        label={t('nav.connections')}
        value={vm.tab}
        onChange={vm.setTab}
        items={[
          {
            id: 'traffic',
            label: t('conn.tab.traffic'),
            content: <Traffic records={vm.rows} outbounds={vm.outboundKeys} latency={vm.latency} truncated={vm.truncated} onSelect={vm.openInList} />
          },
          {id: 'list', label: t('conn.tab.list'), content: list}
        ]}
      />
    </div>
  );
}
