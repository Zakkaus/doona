import {configManagement, type Engine, type EngineConfig} from '../../api/engines';
import type {Capabilities, EffectiveConfig} from '../../api/model';
import type {Translator} from '../../i18n';
import {href} from '../../shell/route';
import {allConfigTabs} from './tabs';
import {sectionSummaries} from './view';
import type {SearchTarget} from '../../shell/routes';

// The global tab edits the engine's global section, so it shows only for an engine whose settings doona knows.
export function configTabs(hasGlobal: boolean, config: EngineConfig | null, capabilities?: Capabilities): Array<(typeof allConfigTabs)[number]> {
  const management = configManagement(config, capabilities);
  const offered = {modules: true, global: hasGlobal, source: true, history: management.export || management.import || management.revisions};
  return allConfigTabs.filter(tab => offered[tab.id]);
}
// Export and import sit on the history tab; search opens the tab and leaves the confirmation to the person.
export function configTargets(capabilities: Capabilities | undefined, config: EngineConfig | null): SearchTarget[] {
  const management = configManagement(config, capabilities);
  return [
    ...(management.export
      ? [
          {
            id: 'config:export',
            titleKey: 'config.backup.export',
            parentKey: 'nav.config',
            route: 'config',
            params: {tab: 'history'},
            aliases: ['export']
          } as const
        ]
      : []),
    ...(management.import
      ? [
          {
            id: 'config:import',
            titleKey: 'config.backup.import',
            parentKey: 'nav.config',
            route: 'config',
            params: {tab: 'history'},
            aliases: ['import']
          } as const
        ]
      : [])
  ];
}
// Each top-level section the configuration defines, for search: its name, the summary the Modules tab shows and a link
// to its first line.
export function configSections(config: EffectiveConfig | undefined, engine: Engine, t: Translator) {
  return sectionSummaries(config?.sources ?? [], engine, t).flatMap(section =>
    section.source && section.block
      ? [
          {
            id: section.id,
            kind: section.kind,
            summary: section.summary,
            range: section.range,
            href: href('config', {tab: 'source', source: section.source.id, line: String(section.block.line + 1)})
          }
        ]
      : []
  );
}
