import {GridLayout, GridList, GridListItem, Size, ToggleButton, Virtualizer} from 'react-aria-components';
import {InlineSelect, ChoiceMenu, NodeTile, Switch, TextField, Empty} from '../../ui/ui';
import type {MemberView} from './view';
import {useT} from '../../i18n';
import {useNodeGrid} from './useNodeGrid';
import {cx} from '../../ui/cx';

export function NodeGrid({
  nodes,
  selected,
  cur,
  marks = {},
  onSelect,
  isDisabled
}: {
  nodes: MemberView[];
  selected?: string;
  cur?: string;
  // Members in place without being the selection, each with a short tag such as the network it carries.
  marks?: Record<string, string>;
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
            <ToggleButton
              key={n.id}
              className={cx('rp-node', marks[n.id] && 'cur')}
              isSelected={selected === n.id}
              isDisabled={isDisabled}
              onChange={() => onSelect(n.id)}
            >
              <NodeTile name={n.name} status={n.status} description={n.description} mark={marks[n.id]} />
            </ToggleButton>
          ) : (
            <div key={n.id} className={cx('rp-node', cur === n.id && 'cur')}>
              <NodeTile name={n.name} status={n.status} description={n.description} current={cur === n.id} />
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
            <GridListItem id={n.id} textValue={n.name} className={cx('rp-node', ((cur === n.id && !onSelect) || marks[n.id]) && 'cur')}>
              <NodeTile name={n.name} status={n.status} description={n.description} current={!onSelect && cur === n.id} mark={marks[n.id]} />
            </GridListItem>
          )}
        </GridList>
      </Virtualizer>
    </div>
  );
}
