import {Menu, MenuSection, Header} from 'react-aria-components';
import {
  Badge,
  Button,
  DetailPanel,
  Kv,
  LabeledSelect,
  Light,
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
import {pickTab, within} from '../../shell/route';
import {ConnectionTable} from './ConnectionTable';
import {CloseAllButton} from './CloseAll';
import type {PageProps} from '../types';
import {useT} from '../../i18n';
import {useConnections} from './useConnections';
import type {ConnectionView} from './view';

export function Connections(props: PageProps) {
  const t = useT();
  const vm = useConnections(props);
  const cur = vm.detail;
  // The traffic chart comes first; a link into the table (a connection, a source, a filter) opens the table.
  const listLink = ['id', 'src', 'network', 'out', 'rule', 'q'].some(key => new URLSearchParams(props.query).has(key));
  const fallback = listLink ? 'list' : 'traffic';
  const tab = pickTab(props.query, ['traffic', 'list'], fallback);
  const list = (
    <>
      {vm.error && <ErrorMessage error={vm.error} onRetry={vm.retry} />}
      <div className="rp-toolbar">
        <TextField search label={t('ui.filter')} value={vm.text} onChange={vm.setText} placeholder={t('conn.filterHint')} width={260} />
        <Segmented label={t('ui.network')} value={vm.network} onChange={vm.setNetwork} items={vm.networks} />
        <LabeledSelect label={t('ui.outbound')} side value={vm.out} onChange={vm.setOut} items={vm.outbounds} />
        <MenuButton
          quiet
          label={t('conn.pick')}
          content={
            <Menu aria-label={t('conn.pick')} onAction={vm.pick}>
              {vm.picks.map(section => (
                <MenuSection key={section.title} id={section.title} selectionMode="single" selectedKeys={[section.value]}>
                  <Header className="rp-sec-h">{section.title}</Header>
                  {section.items.map(item => (
                    <MenuChoice key={item.id} item={item} />
                  ))}
                </MenuSection>
              ))}
            </Menu>
          }
        >
          {t('conn.pick')}
        </MenuButton>
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
        {vm.canClose && <CloseAllButton {...vm.closeAll} />}
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
    </>
  );
  return (
    <div className="rp-page">
      <Tabs
        keepMounted
        label={t('nav.connections')}
        value={tab}
        // The tab is written only when it differs from the default, which a link into the table turns to the list.
        onChange={next => props.go('connections', within(props.query, {tab: next === fallback ? null : next}))}
        items={[
          {
            id: 'traffic',
            label: t('conn.tab.traffic'),
            content: (
              <Traffic
                records={vm.rows}
                outbounds={vm.outboundKeys}
                truncated={vm.truncated}
                onSelect={id => props.go('connections', within(props.query, {tab: 'list', id}))}
              />
            )
          },
          {id: 'list', label: t('conn.tab.list'), content: list}
        ]}
      />
    </div>
  );
}
