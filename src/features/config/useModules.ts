import {useMemo} from 'react';
import type {EffectiveConfig} from '../../api/model';
import {engineOf} from '../../api/engines';
import {useLang, useT} from '../../i18n';
import {useVersion, useCapabilities} from '../../store';
import {readNodeEntries} from '../../dae/nodes';
import {href} from '../../shell/route';
import {useCompleteness} from '../../store/config';
import {sectionSummaries} from './view';

export type ModulesProps = {config: EffectiveConfig};
export function useModules({config}: ModulesProps) {
  const t = useT();
  const lang = useLang();
  const version = useVersion().data;
  const engine = useMemo(() => engineOf(version), [version]);
  const canWrite = useCapabilities().data?.resources.config.writable === true;
  const isComplete = useCompleteness(config.sources);
  const authoredNodes = useMemo(() => {
    const bySource = new Map(config.sources.map(source => [source.id, readNodeEntries(source.content)]));
    const counts = new Map<string, number>();
    for (const entries of bySource.values()) for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
    return {bySource, counts};
  }, [config.sources]);
  return {
    cards: sectionSummaries(config.sources, engine, lang, t).map(section => {
      const nodeEntries =
        engine.daeText && section.kind === 'node' && section.source && section.block
          ? (authoredNodes.bySource.get(section.source.id) ?? []).filter(entry => entry.from > section.block!.open && entry.to < section.block!.close)
          : [];
      const nodeLinks = nodeEntries
        .filter(entry => authoredNodes.counts.get(entry.name) === 1)
        .map(entry => ({name: entry.name, href: href('nodes', {editNodeSource: section.source!.id, line: String(entry.line), q: entry.name})}));
      return {...section, nodeLinks: canWrite && section.source?.writable && isComplete(section.source) === true ? nodeLinks : []};
    })
  };
}
