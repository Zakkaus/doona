import {useMemo, useState} from 'react';
import {useFilter} from 'react-aria-components';
import {LOCALE, useLang, useT} from '../../i18n';
import {nodeGridView, type MemberView} from './view';

export function useNodeGrid(nodes: MemberView[], disabled: boolean | undefined) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('all');
  const [sort, setSort] = useState('latency');
  const [aliveOnly, setAliveOnly] = useState(false);
  const {contains} = useFilter({sensitivity: 'base'});
  const view = useMemo(() => nodeGridView(nodes, {q, region, sort, aliveOnly}, contains, t, locale), [nodes, q, region, sort, aliveOnly, contains, t, locale]);
  const disabledKeys = useMemo(() => (disabled ? nodes.map(node => node.id) : []), [disabled, nodes]);
  return {...view, q, setQ, region, setRegion, sort, setSort, aliveOnly, setAliveOnly, disabledKeys};
}
