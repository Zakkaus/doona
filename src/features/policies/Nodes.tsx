// Virtualize lists above 12 items; smaller collections use plain tiles.
import {useMemo} from 'react';
import {
  Autocomplete,
  Menu,
  MenuSection,
  Header,
  ListLayout,
  GridLayout,
  GridList,
  GridListItem,
  Size,
  ToggleButton,
  Virtualizer,
  useFilter
} from 'react-aria-components';
import {InlineSelect, ChoiceMenu, NodeTile, Switch, TextField, Empty} from '../../ui/ui';
import {MenuButton, MenuChoice, pickMenuKey} from '../../ui/ui';
import {menuViews, type MemberView} from './view';
import {useT} from '../../i18n';
import {useNodeGrid} from './useNodeGrid';
import {cx} from '../../ui/cx';

// `alive` false is an observed failure; `alive` undefined with no `tcp` is a node nothing has measured yet.
export type NodeInfo = {name: string; tcp?: number; alive?: boolean};
const BIG = 12;

export function NodeGrid({
  nodes,
  selected,
  cur,
  onSelect,
  isDisabled
}: {
  nodes: MemberView[];
  selected?: string;
  cur?: string;
  onSelect?: (id: string) => void;
  isDisabled?: boolean;
}) {
  const t = useT();
  const m = useNodeGrid(nodes, isDisabled);
  if (!nodes.length) return <Empty>{t('policy.none')}</Empty>;
  if (!m.big) {
    return (
      <div className="rp-nodes">
        {nodes.map(n =>
          onSelect ? (
            <ToggleButton key={n.id} className="rp-node" isSelected={selected === n.id} isDisabled={isDisabled} onChange={() => onSelect(n.id)}>
              <MemberTile n={n} />
            </ToggleButton>
          ) : (
            <div key={n.id} className={cx('rp-node', cur === n.id && 'cur')}>
              <MemberTile n={n} current={cur === n.id} />
            </div>
          )
        )}
      </div>
    );
  }
  return (
    <div className="rp-form">
      <div className="rp-toolbar">
        <TextField search label={t('policy.filter')} value={m.q} onChange={m.setQ} width={240} />
        <ChoiceMenu quiet label={t('policy.region')} value={m.region} onChange={m.setRegion} items={m.regions}>
          {m.regionLabel}
        </ChoiceMenu>
        <InlineSelect
          label={t('policy.sort')}
          value={m.sort}
          onChange={m.setSort}
          items={[
            {id: 'latency', label: t('policy.byLatency')},
            {id: 'name', label: t('policy.byName')}
          ]}
        />
        <Switch isSelected={m.aliveOnly} onChange={m.setAliveOnly}>
          {t('policy.aliveOnly')}
        </Switch>
        <span className="rp-grow" />
        <span className="rp-label">{m.count}</span>
      </div>
      <Virtualizer layout={GridLayout} layoutOptions={{minItemSize: new Size(200, 56), maxItemSize: new Size(Infinity, 56), minSpace: new Size(8, 8)}}>
        <GridList
          className="rp-nodegrid"
          aria-label={t('policy.filter')}
          items={m.shown}
          selectionMode={onSelect ? 'single' : 'none'}
          disabledKeys={m.disabledKeys}
          disallowEmptySelection
          selectedKeys={onSelect && selected ? [selected] : []}
          onSelectionChange={k => {
            if (!onSelect || isDisabled || k === 'all') return;
            const v = [...k][0];
            if (v != null) onSelect(String(v));
          }}
          renderEmptyState={() => <Empty>{t('policy.none')}</Empty>}
        >
          {n => (
            <GridListItem id={n.id} textValue={n.name} className={cx('rp-node', cur === n.id && !onSelect && 'cur')}>
              <MemberTile n={n} current={!onSelect && cur === n.id} />
            </GridListItem>
          )}
        </GridList>
      </Virtualizer>
    </div>
  );
}
function MemberTile({n, current}: {n: MemberView; current?: boolean}) {
  return <NodeTile name={n.name} status={n.status} description={n.description} current={current} />;
}

export function NodeMenu({nodes, value, onChange, label}: {nodes: NodeInfo[]; value: string; onChange: (name: string) => void; label: string}) {
  const t = useT();
  const {contains} = useFilter({sensitivity: 'base'});
  const big = nodes.length > BIG;
  const prepared = useMemo(() => menuViews(nodes, t), [nodes, t]);
  const {items} = prepared;
  const sections = big ? prepared.sections : undefined;
  const item = (node: (typeof items)[number]) => (
    <MenuChoice key={node.id} item={node}>
      <span className={node.className}>{node.description}</span>
    </MenuChoice>
  );
  const menu = (
    <Menu
      aria-label={label}
      className="rp-menu-scroll"
      selectionMode={big ? undefined : 'single'}
      selectedKeys={big ? undefined : [value]}
      onSelectionChange={big ? undefined : pickMenuKey(onChange)}
    >
      {sections
        ? sections.map(section => (
            <MenuSection key={section.title} id={section.title} selectionMode="single" selectedKeys={[value]} onSelectionChange={pickMenuKey(onChange)}>
              <Header className="rp-sec-h">
                <span className="rp-il">
                  {section.title}
                  <span className="rp-muted">{section.count}</span>
                </span>
              </Header>
              {section.items.map(item)}
            </MenuSection>
          ))
        : items.map(item)}
    </Menu>
  );
  return (
    <MenuButton
      appearance="select"
      placement="bottom start"
      label={label}
      content={
        big ? (
          <Autocomplete filter={contains}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the menu the user just opened */}
            <TextField search label={t('policy.filter')} autoFocus className="rp-menu-search" />
            <Virtualizer layout={ListLayout} layoutOptions={{rowHeight: 32, headingHeight: 26}}>
              {menu}
            </Virtualizer>
          </Autocomplete>
        ) : (
          menu
        )
      }
    >
      <span className="rp-il">
        <span>{value}</span>
      </span>
    </MenuButton>
  );
}
