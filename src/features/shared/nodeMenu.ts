import {compareLatency} from '../../api/selectors';
import type {Translator} from '../../i18n';
import {formatLatency} from '../../i18n/format';
import {latencyTone} from '../../ui/ui';
import {regionOf} from './geo';

// `alive` false is an observed failure; `alive` undefined with no `tcp` is a node nothing has measured yet.
export function menuViews(nodes: Array<{id?: string; name: string; label?: string; tcp?: number; alive?: boolean}>, t: Translator) {
  const items = nodes.map(node => ({
    id: node.id ?? node.name,
    label: node.label ?? node.name,
    tcp: node.tcp,
    region: regionOf(node.name) ?? '—',
    description: node.alive === false ? t('ui.unavailable') : node.tcp === undefined ? '—' : formatLatency(node.tcp, t),
    className: node.alive === false ? 'desc err' : node.tcp === undefined ? 'desc' : `desc ${latencyTone(node.tcp)}`
  }));
  const groups = new Map<string, typeof items>();
  for (const node of [...items].sort((a, b) => compareLatency(a.tcp, b.tcp))) {
    const group = groups.get(node.region);
    if (group) group.push(node);
    else groups.set(node.region, [node]);
  }
  return {items, sections: [...groups].map(([title, items]) => ({title, items, count: t('policy.sectionCount', {n: items.length})}))};
}
