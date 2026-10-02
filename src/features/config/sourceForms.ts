import type {ConfigSource} from '../../api/model';
import type {Engine} from '../../api/engines';
import {blockFields, scanConfig} from '../../dae/text';
import {readSubscriptionEntries} from '../../dae/subscriptions';
import {href} from '../../shell/route';
import {sectionPages} from './view';

export function locatedForms<T extends {line: number; to: number}>(links: T[], focus: number | null, text: string): T[] {
  return links.filter(link => link.line === focus || (focus && link.line <= focus && text.slice(0, link.to).split('\n').length >= focus));
}

export function sourceForms(text: string, source: string, engine: Engine, kind: ConfigSource['kind'] = 'main') {
  if (!engine.daeText) return [];
  const {blocks, tokens} = scanConfig(text);
  const global = engine.globalSettings;
  return blocks.flatMap(block => {
    if (block.name === global?.name) {
      const section = blocks.filter(item => item.name === global.name).indexOf(block);
      const fields = blockFields(text, block, tokens);
      return fields
        .filter(field => fields.filter(other => other.name === field.name).length === 1 && global.fields.some(definition => definition.key === field.name))
        .map(field => ({
          kind: block.name,
          from: field.from,
          to: field.to,
          label: field.name,
          line: text.slice(0, field.from).split('\n').length,
          href: href('config', {tab: 'global', source, section: String(section), field: field.name})
        }));
    }
    const target = sectionPages[block.name];
    if (block.name === 'subscription')
      return kind !== 'main'
        ? []
        : readSubscriptionEntries(text)
            .filter(entry => entry.from > block.open && entry.to <= block.close)
            .map(entry => ({
              kind: block.name,
              from: entry.from,
              to: entry.to,
              label: entry.tag,
              line: entry.line,
              href: href('nodes', {editSubscriptionTag: entry.tag})
            }));
    if (block.name === 'dns')
      return block.children
        .filter(child => child.name === 'routing')
        .flatMap(child =>
          child.children
            .filter(list => list.name === 'request' || list.name === 'response')
            .map(list => ({kind: block.name, from: list.from, to: list.to, label: list.name, line: list.line + 1, href: target!}))
        );
    return target ? [{kind: block.name, from: block.from, to: block.to, label: block.name, line: block.line + 1, href: target}] : [];
  });
}
