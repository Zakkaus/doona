// Virtualize lists above 12 items; smaller collections use plain tiles.
import {useMemo, useState} from 'react';
import {Autocomplete, Menu, MenuSection, Header, ListLayout, GridLayout, GridList, GridListItem, Size, Virtualizer, useFilter} from 'react-aria-components';
import {regionOf} from './geo';
import {millis} from '../../api/u64';
import {compareLatency, healthMillis} from '../../api/selectors';
import {InlineSelect, ChoiceMenu, NodeTile, Switch, TextField, latencyTone, type NodeTileProps, Empty} from '../../ui/ui';
import {MenuButton, MenuChoice, pickMenuKey} from '../../ui/ui';
import type {Group, HealthObservation} from '../../api/model';
import {useT} from '../../i18n';

// `alive` false is an observed failure; `alive` undefined with no `tcp` is a node nothing has measured yet.
export type NodeInfo = {name: string; tcp?: number; alive?: boolean};
export type MemberInfo = Group['members'][number] & {health?: HealthObservation};
const BIG = 12;

function regions(nodes: Array<{name: string}>) {
  const m = new Map<string, number>();
  for (const n of nodes) {
    const r = regionOf(n.name) ?? '?';
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}
const byLatency = (a: NodeInfo, b: NodeInfo) => compareLatency(a.tcp, b.tcp);

export function NodeGrid({
  nodes,
  selected,
  cur,
  onSelect,
  isDisabled
}: {
  nodes: MemberInfo[];
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
    const list = nodes.filter(
      n => (!q || contains(n.name, q)) && (region === 'all' || (regionOf(n.name) ?? '?') === region) && (!aliveOnly || n.health?.state === 'healthy')
    );
    if (sort === 'latency') list.sort((a, b) => compareLatency(healthMillis(a.health), healthMillis(b.health)));
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
  const down = shown.filter(n => n.health?.state === 'unavailable').length;
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
function MemberTile({n, ...props}: {n: MemberInfo} & Pick<NodeTileProps, 'selected' | 'cur' | 'isDisabled' | 'onPress' | 'bodyOnly'>) {
  const health = n.health;
  return (
    <NodeTile
      {...props}
      name={n.name}
      nested={n.kind === 'group'}
      tcp={healthMillis(health)}
      unavailable={health?.state === 'unavailable'}
      description={health ? health.transport.toUpperCase() + ' · ' + health.purpose : ' '}
    />
  );
}

export function NodeMenu({nodes, value, onChange, label}: {nodes: NodeInfo[]; value: string; onChange: (name: string) => void; label: string}) {
  const t = useT();
  const {contains} = useFilter({sensitivity: 'base'});
  const big = nodes.length > BIG;
  const items = useMemo(() => nodes.map(node => ({...node, id: node.name, label: node.name})), [nodes]);
  const sections = useMemo(() => {
    if (!big) return undefined;
    const groups = new Map<string, typeof items>();
    for (const node of [...items].sort(byLatency)) {
      const region = regionOf(node.name) ?? '—';
      const group = groups.get(region);
      if (group) group.push(node);
      else groups.set(region, [node]);
    }
    return [...groups].map(([title, items]) => ({
      title,
      items,
      heading: (
        <span className="rp-il">
          {title}
          <span className="rp-muted"> · {items.length}</span>
        </span>
      )
    }));
  }, [items, big]);
  const item = (node: (typeof items)[number]) => (
    <MenuChoice key={node.id} item={node}>
      {node.alive === false ? (
        <span className="desc err">{t('ui.unavailable')}</span>
      ) : node.tcp === undefined ? (
        <span className="desc">—</span>
      ) : (
        <span className={'desc ' + latencyTone(node.tcp)}>{t('ui.latency', {n: millis(node.tcp)})}</span>
      )}
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
              <Header className="rp-sec-h">{section.heading}</Header>
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
