import {LabeledSelect, ChoiceMenu, Switch, TextField, Empty, Toolbar} from '../../ui/ui';
import type {MemberView} from './view';
import {useT} from '../../i18n';
import {useNodeGrid} from './useNodeGrid';
import {NodeGrid as TileGrid} from '../../ui/NodeGrid';

export function NodeGrid({
  nodes,
  selected,
  cur,
  marks,
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
  const grid = (
    <TileGrid
      nodes={m.big ? m.shown : nodes}
      virtual={m.big}
      label={t('policy.filter')}
      empty={t('policy.none')}
      selected={selected}
      current={cur}
      marks={marks}
      onSelect={onSelect}
      isDisabled={isDisabled}
    />
  );
  if (!m.big) return grid;
  return (
    <div className="rp-form">
      <Toolbar>
        <TextField search label={t('policy.filter')} value={m.q} onChange={m.setQ} width={240} />
        <ChoiceMenu quiet label={t('policy.region')} value={m.region} onChange={m.setRegion} items={m.regions}>
          {m.regionLabel}
        </ChoiceMenu>
        <LabeledSelect
          side
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
      </Toolbar>
      {grid}
    </div>
  );
}
