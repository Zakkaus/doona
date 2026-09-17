// Node collections that stay usable at airport scale (hundreds of nodes): a filterable, virtualised grid for policy
// groups and a searchable, region-sectioned menu for pickers. Small collections fall back to the plain tiles.
import {useEffect, useMemo, useRef, useState} from 'react';
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
import {Flag, OutboundMark} from './Flag';
import {Button, Check, InlineSelect, MenuButton, NodeTile, Switch, TextField, latencyTone, type NodeTileProps} from '../../ui/ui';
import type {Group, HealthObservation} from '../../api/model';
import {useT} from '../../i18n';

export type NodeInfo = {name: string; tcp?: number; udp?: number; v6?: boolean; alive?: boolean; nested?: boolean};
export type MemberInfo = Group['members'][number] & {health?: HealthObservation; leaf?: string};
export type NodeLabels = {
  timeout: string;
  nested: string;
  cur: string;
  filter: string;
  region: string;
  allRegions: string;
  sort: string;
  byLatency: string;
  byName: string;
  aliveOnly: string;
  count: (n: number, down: number) => string;
  none: string;
};
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
  labels,
  isDisabled
}: {
  nodes: MemberInfo[];
  selected?: string;
  cur?: string;
  onSelect?: (id: string) => void;
  labels: NodeLabels;
  isDisabled?: boolean;
}) {
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
  if (!nodes.length) return <div className="rp-empty">{labels.none}</div>;
  if (!big) {
    return (
      <div className="rp-nodes">
        {nodes.map(n => (
          <MemberTile
            key={n.id}
            n={n}
            labels={labels}
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
        <TextField search label={labels.filter} value={q} onChange={setQ} width={240} />
        <MenuButton
          quiet
          label={labels.region}
          value={region}
          onChange={setRegion}
          items={[
            {id: 'all', label: labels.allRegions},
            ...regions(nodes).map(([r, c]) => ({id: r, label: r === '?' ? '—' : r, icon: r === '?' ? undefined : <Flag name={r} />, desc: String(c)}))
          ]}
        >
          {region === 'all' ? (
            labels.allRegions
          ) : (
            <>
              <Flag name={region} />
              {region}
            </>
          )}
        </MenuButton>
        <InlineSelect
          label={labels.sort}
          value={sort}
          onChange={setSort}
          items={[
            {id: 'latency', label: labels.byLatency},
            {id: 'name', label: labels.byName}
          ]}
        />
        <Switch isSelected={aliveOnly} onChange={setAliveOnly}>
          {labels.aliveOnly}
        </Switch>
        <span className="rp-grow" />
        <span className="rp-label">{labels.count(shown.length, down)}</span>
      </div>
      <Virtualizer layout={GridLayout} layoutOptions={{minItemSize: new Size(200, 56), maxItemSize: new Size(Infinity, 56), minSpace: new Size(8, 8)}}>
        <GridList
          className="rp-nodegrid"
          aria-label={labels.filter}
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
          renderEmptyState={() => <div className="rp-empty">{labels.none}</div>}
        >
          {n => (
            <GridListItem id={n.id} textValue={n.name} className={'rp-node' + (cur === n.id && !onSelect ? ' cur' : '')}>
              <MemberTile n={n} labels={labels} cur={!onSelect && cur === n.id} bodyOnly />
            </GridListItem>
          )}
        </GridList>
      </Virtualizer>
    </div>
  );
}
function MemberTile({n, ...props}: {n: MemberInfo} & Pick<NodeTileProps, 'labels' | 'selected' | 'cur' | 'isDisabled' | 'onPress' | 'bodyOnly'>) {
  const health = n.health;
  return (
    <NodeTile
      {...props}
      name={n.name}
      icon={n.kind === 'group' ? <OutboundMark name={n.leaf ?? null} /> : <Flag name={n.name} />}
      nested={n.kind === 'group'}
      tcp={health?.state === 'healthy' ? (health.latency_ms ?? undefined) : undefined}
      unavailable={health?.state === 'unavailable'}
      description={health ? health.transport.toUpperCase() + ' · ' + health.purpose : ' '}
    />
  );
}

// Picker for one node out of many: the trigger shows flag and name; the menu is searchable and grouped by region.
export function NodeMenu({
  nodes,
  value,
  onChange,
  label,
  labels
}: {
  nodes: NodeInfo[];
  value: string;
  onChange: (name: string) => void;
  label: string;
  labels: {timeout: string; filter: string; loading: string};
}) {
  const t = useT();
  const {contains} = useFilter({sensitivity: 'base'});
  const big = nodes.length > BIG;
  const all = useMemo(() => {
    const m = new Map<string, NodeInfo[]>();
    for (const n of [...nodes].sort(byLatency)) {
      const r = regionOf(n.name) ?? '—';
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(n);
    }
    return [...m];
  }, [nodes]);
  // Sections arrive in pages of three, as from a backend; reaching the end of the list asks for the next page.
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const sections = all.slice(0, pages * 3);
  const done = sections.length >= all.length;
  useEffect(() => {
    if (!loading) return;
    const id = setTimeout(() => {
      setPages(p => p + 1);
      setLoading(false);
    }, 350);
    return () => clearTimeout(id);
  }, [loading]);
  const listRef = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = listRef.current;
    if (!el || loading || done) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) setLoading(true);
  };
  const item = (n: NodeInfo) => (
    <MenuItem key={n.name} id={n.name} className="rp-item" textValue={n.name}>
      <Check />
      <span className="rp-il">
        <span className="ic">
          <Flag name={n.name} />
        </span>
        <span>{n.name}</span>
      </span>
      <span className={'desc ' + (n.alive !== false ? latencyTone(n.tcp ?? 0) : 'err')}>
        {n.alive !== false ? t('ui.latency', {n: String(n.tcp)}) : labels.timeout}
      </span>
    </MenuItem>
  );
  const menu = (
    <Menu
      ref={listRef}
      onScroll={onScroll}
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
                  {r !== '—' && (
                    <span className="ic">
                      <Flag name={r} />
                    </span>
                  )}
                  {r}
                  <span className="rp-muted"> · {list.length}</span>
                </span>
              </Header>
              {list.map(item)}
            </MenuSection>
          ))
        : nodes.map(item)}
      {big && !done && (
        <MenuItem id="__more" isDisabled className="rp-item rp-more" textValue={labels.loading}>
          <span />
          <span className="rp-il">
            <span className="rp-spinner" />
            {labels.loading}
          </span>
        </MenuItem>
      )}
    </Menu>
  );
  return (
    <MenuTrigger>
      <Button appearance="select" label={label}>
        <span className="rp-il">
          <span className="ic">
            <Flag name={value} />
          </span>
          <span>{value}</span>
        </span>
        <ChevronDown />
      </Button>
      <Popover className="rp-popover" placement="bottom start">
        {big ? (
          <Autocomplete filter={contains}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog the user just opened */}
            <TextField search label={labels.filter} autoFocus className="rp-menu-search" />
            {menu}
          </Autocomplete>
        ) : (
          menu
        )}
      </Popover>
    </MenuTrigger>
  );
}
