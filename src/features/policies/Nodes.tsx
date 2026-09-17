// Node collections that stay usable at airport scale (hundreds of nodes): a filterable, virtualised grid for policy
// groups and a searchable, region-sectioned menu for pickers. Small collections fall back to the plain tiles.
import {useMemo, useState} from 'react';
import {
  Autocomplete,
  GridLayout,
  GridList,
  GridListItem,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Header,
  Size,
  Virtualizer,
  useFilter,
  type Key
} from 'react-aria-components';
import ChevronDown from '../../ui/icons/ChevronDown';
import {regionOf} from './geo';
import {OutboundMark} from './Mark';
import {Button, Check, InlineSelect, MenuButton, NodeTile, Switch, TextField, latencyTone, type NodeTileProps} from '../../ui/ui';
import type {Group, HealthObservation} from '../../api/model';
import {useT} from '../../i18n';

// `alive` false is an observed failure; `alive` undefined with no `tcp` is a node nothing has measured yet.
export type NodeInfo = {name: string; tcp?: number; alive?: boolean; nested?: boolean};
export type MemberInfo = Group['members'][number] & {health?: HealthObservation; leaf?: string};
const BIG = 12;

// Region facets for a node list, ordered by count.
function regions(nodes: Array<{name: string}>) {
  const m = new Map<string, number>();
  for (const n of nodes) {
    const r = regionOf(n.name) ?? '?';
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}
const byLatency = (a: NodeInfo, b: NodeInfo) => (a.alive ? (a.tcp ?? 0) : 1e9) - (b.alive ? (b.tcp ?? 0) : 1e9);

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
    if (sort === 'latency')
      list.sort(
        (a, b) =>
          (a.health?.state === 'healthy' ? (a.health.latency_ms ?? Infinity) : Infinity) -
          (b.health?.state === 'healthy' ? (b.health.latency_ms ?? Infinity) : Infinity)
      );
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [nodes, big, q, region, sort, aliveOnly, contains]);
  const facets = useMemo(() => regions(nodes), [nodes]);
  if (!nodes.length) return <div className="rp-empty">{t('policy.none')}</div>;
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
  const down = nodes.filter(n => n.health?.state === 'unavailable').length;
  return (
    <div className="rp-form">
      <div className="rp-toolbar">
        <TextField search label={t('policy.filter')} value={q} onChange={setQ} width={240} />
        <MenuButton
          quiet
          label={t('policy.region')}
          value={region}
          onChange={setRegion}
          items={[{id: 'all', label: t('policy.allRegions')}, ...facets.map(([r, c]) => ({id: r, label: r === '?' ? '—' : r, desc: String(c)}))]}
        >
          {region === 'all' ? t('policy.allRegions') : region}
        </MenuButton>
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
          renderEmptyState={() => <div className="rp-empty">{t('policy.none')}</div>}
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
      icon={n.kind === 'group' ? <OutboundMark name={n.leaf ?? null} /> : undefined}
      nested={n.kind === 'group'}
      tcp={health?.state === 'healthy' ? (health.latency_ms ?? undefined) : undefined}
      unavailable={health?.state === 'unavailable'}
      description={health ? health.transport.toUpperCase() + ' · ' + health.purpose : ' '}
    />
  );
}

// Picker for one node out of many: the trigger shows flag and name; the menu is searchable and grouped by region.
export function NodeMenu({nodes, value, onChange, label}: {nodes: NodeInfo[]; value: string; onChange: (name: string) => void; label: string}) {
  const t = useT();
  const {contains} = useFilter({sensitivity: 'base'});
  const big = nodes.length > BIG;
  const sections = useMemo(() => {
    const m = new Map<string, NodeInfo[]>();
    for (const n of [...nodes].sort(byLatency)) {
      const r = regionOf(n.name) ?? '—';
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(n);
    }
    return [...m];
  }, [nodes]);
  const item = (n: NodeInfo) => (
    <MenuItem key={n.name} id={n.name} className="rp-item" textValue={n.name}>
      <Check />
      <span className="rp-il">
        <span>{n.name}</span>
      </span>
      {n.alive === false ? (
        <span className="desc err">{t('ui.unavailable')}</span>
      ) : n.tcp === undefined ? (
        <span className="desc">—</span>
      ) : (
        <span className={'desc ' + latencyTone(n.tcp)}>{t('ui.latency', {n: n.tcp})}</span>
      )}
    </MenuItem>
  );
  const menu = (
    <Menu
      className="rp-menu-scroll"
      aria-label={label}
      selectionMode="single"
      selectedKeys={[value]}
      onSelectionChange={(k: 'all' | Set<Key>) => {
        if (k === 'all') return;
        const v = [...k][0];
        if (v != null) onChange(String(v));
      }}
    >
      {big
        ? sections.map(([r, list]) => (
            <MenuSection key={r} id={r}>
              <Header className="rp-sec-h">
                <span className="rp-il">
                  {r}
                  <span className="rp-muted"> · {list.length}</span>
                </span>
              </Header>
              {list.map(item)}
            </MenuSection>
          ))
        : nodes.map(item)}
    </Menu>
  );
  return (
    <MenuTrigger>
      <Button appearance="select" label={label}>
        <span className="rp-il">
          <span>{value}</span>
        </span>
        <ChevronDown />
      </Button>
      <Popover className="rp-popover" placement="bottom start">
        {big ? (
          <Autocomplete filter={contains}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog the user just opened */}
            <TextField search label={t('policy.filter')} autoFocus className="rp-menu-search" />
            {menu}
          </Autocomplete>
        ) : (
          menu
        )}
      </Popover>
    </MenuTrigger>
  );
}
