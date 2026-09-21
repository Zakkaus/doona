// Virtualize lists above 12 items; smaller collections use plain tiles.
import {useMemo, useState} from 'react';
import {Autocomplete, Menu, MenuSection, Header, ListLayout, GridLayout, GridList, GridListItem, Size, Virtualizer, useFilter} from 'react-aria-components';
import {regionOf} from './geo';
import {compareLatency} from '../../api/selectors';
import {InlineSelect, ChoiceMenu, NodeTile, Switch, TextField, type NodeTileProps, Empty} from '../../ui/ui';
import {MenuButton, MenuChoice, pickMenuKey} from '../../ui/ui';
import {menuViews, type MemberView} from './view';
import {useT} from '../../i18n';

// `alive` false is an observed failure; `alive` undefined with no `tcp` is a node nothing has measured yet.
export type NodeInfo = {name: string; tcp?: number; alive?: boolean};
const BIG = 12;

function regions(nodes: Array<{name: string}>) {
  const m = new Map<string, number>();
  for (const n of nodes) {
    const r = regionOf(n.name) ?? '?';
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}

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
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('all');
  const [sort, setSort] = useState('latency');
  const [aliveOnly, setAliveOnly] = useState(false);
  const {contains} = useFilter({sensitivity: 'base'});
  const big = nodes.length > BIG;
  const shown = useMemo(() => {
    if (!big) return nodes;
    const list = nodes.filter(n => (!q || contains(n.name, q)) && (region === 'all' || (regionOf(n.name) ?? '?') === region) && (!aliveOnly || n.healthy));
    if (sort === 'latency') list.sort((a, b) => compareLatency(a.tcp, b.tcp));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [nodes, big, q, region, sort, aliveOnly, contains]);
  const facets = useMemo(() => regions(nodes), [nodes]);
  if (!nodes.length) return <Empty>{t('policy.none')}</Empty>;
  if (!big) {
    return (
      <div className="rp-nodes">
        {nodes.map(n => (
          <MemberTile
            key={n.id}
            n={n}
            selected={selected === n.id}
            isDisabled={isDisabled}
            onPress={onSelect ? () => onSelect(n.id) : undefined}
            cur={!onSelect && cur === n.id}
          />
        ))}
      </div>
    );
  }
  const down = shown.filter(n => n.unavailable).length;
  return (
    <div className="rp-form">
      <div className="rp-toolbar">
        <TextField search label={t('policy.filter')} value={q} onChange={setQ} width={240} />
        <ChoiceMenu
          quiet
          label={t('policy.region')}
          value={region}
          onChange={setRegion}
          items={[{id: 'all', label: t('policy.allRegions')}, ...facets.map(([r, c]) => ({id: r, label: r === '?' ? '—' : r, desc: String(c)}))]}
        >
          {region === 'all' ? t('policy.allRegions') : region}
        </ChoiceMenu>
        <InlineSelect
          label={t('policy.sort')}
          value={sort}
          onChange={setSort}
          items={[
            {id: 'latency', label: t('policy.byLatency')},
            {id: 'name', label: t('policy.byName')}
          ]}
        />
        <Switch isSelected={aliveOnly} onChange={setAliveOnly}>
          {t('policy.aliveOnly')}
        </Switch>
        <span className="rp-grow" />
        <span className="rp-label">{down ? t('policy.membersDown', {n: shown.length, down}) : t('policy.members', {n: shown.length})}</span>
      </div>
      <Virtualizer layout={GridLayout} layoutOptions={{minItemSize: new Size(200, 56), maxItemSize: new Size(Infinity, 56), minSpace: new Size(8, 8)}}>
        <GridList
          className="rp-nodegrid"
          aria-label={t('policy.filter')}
          items={shown}
          selectionMode={onSelect ? 'single' : 'none'}
          disabledKeys={isDisabled ? nodes.map(n => n.id) : []}
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
            <GridListItem id={n.id} textValue={n.name} className={'rp-node' + (cur === n.id && !onSelect ? ' cur' : '')}>
              <MemberTile n={n} cur={!onSelect && cur === n.id} bodyOnly />
            </GridListItem>
          )}
        </GridList>
      </Virtualizer>
    </div>
  );
}
function MemberTile({n, ...props}: {n: MemberView} & Pick<NodeTileProps, 'selected' | 'cur' | 'isDisabled' | 'onPress' | 'bodyOnly'>) {
  return <NodeTile {...props} name={n.name} nested={n.nested} tcp={n.tcp} unavailable={n.unavailable} description={n.description} />;
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
