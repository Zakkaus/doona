import {useMemo} from 'react';
import type {EffectiveConfig} from '../../api/model';
import {engineOf} from '../../api/engines';
import {useT} from '../../i18n';
import {useVersion} from '../../store';
import {sectionSummaries} from './view';

export type ModulesProps = {config: EffectiveConfig};
export function useModules({config}: ModulesProps) {
  const t = useT();
  const version = useVersion().data;
  const engine = useMemo(() => engineOf(version), [version]);
  return {cards: sectionSummaries(config.sources, engine, t)};
}
