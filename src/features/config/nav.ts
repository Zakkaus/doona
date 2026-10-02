import {configManagement} from '../../api/engines';
import type {Engine} from '../../api/engines';
import type {Capabilities, EffectiveConfig} from '../../api/model';
import type {Translator} from '../../i18n';
import {href} from '../../shell/route';
import {sectionSummaries} from './view';
import type {Key} from '../../i18n';
import type {SearchTarget} from '../../shell/routes';

// The global tab edits the engine's global section, so it shows only for an engine whose settings doona knows.
// `aliases` are other words search finds a tab by.
export function configTabs(
  hasGlobal: boolean,
  capabilities?: Capabilities
): Array<{id: 'modules' | 'global' | 'source' | 'history'; titleKey: Key; aliases?: readonly string[]}> {
  const management = configManagement(capabilities);
  return [
    {id: 'modules' as const, titleKey: 'config.tabModules' as const},
    ...(hasGlobal ? [{id: 'global' as const, titleKey: 'config.tabGlobal' as const}] : []),
    {id: 'source' as const, titleKey: 'config.tabSource' as const},
    ...(management.export || management.import || management.revisions
      ? [{id: 'history' as const, titleKey: 'config.tabHistory' as const, aliases: ['history', 'revision', 'backup']}]
      : [])
  ];
}
// Export and import sit on the history tab; search opens the tab and leaves the confirmation to the person.
export function configTargets(capabilities: Capabilities | undefined): SearchTarget[] {
  const management = configManagement(capabilities);
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
