import type {ConfigSource} from '../../api/model';
import type {Engine} from '../../api/engines';
import {blockFields, scanConfig} from '../../dae/text';
import {readSubscriptionEntries} from '../../dae/subscriptions';
import {conditionKinds, dnsConditionKinds, readGroupEntries} from '../../dae/groups';
import {href} from '../../shell/route';
import {sectionPages} from './view';
import {ruleFormValues} from '../../dae/ruleText';

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
              href: href('nodes', {editSubscription: entry.tag})
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

export function sameFormValues(before: string, after: string, source: string, engine: Engine, kind: ConfigSource['kind'] = 'main'): boolean {
  if (!engine.daeText) return true;
  const scan = scanConfig(before);
  const duplicates = new Set(
    scan.blocks
      .filter(block => block.name === engine.globalSettings?.name)
      .flatMap((block, section) => {
        const fields = blockFields(before, block, scan.tokens);
        return fields
          .filter(field => fields.filter(other => other.name === field.name).length > 1)
          .map(field => href('config', {tab: 'global', source, section: String(section), field: field.name}));
      })
  );
  const values = (text: string) =>
    sourceForms(text, source, engine, kind)
      .filter(item => !duplicates.has(item.href))
      .filter(item => item.kind !== 'node')
      .map(item => {
        const value = text.slice(item.from, item.to);
        if (item.kind === 'subscription')
          return readSubscriptionEntries(`subscription {\n${value}\n}`).map(({tag, url, ua, interval, cache, route}) => ({
            tag,
            url,
            ua,
            interval,
            cache,
            route
          }));
        if (item.kind === 'group') return readGroupEntries(value).map(({from: _from, to: _to, ...entry}) => entry);
        if (item.kind === 'routing' || item.kind === 'dns')
          return ruleFormValues(value, item.kind === 'dns' ? dnsConditionKinds[item.label as 'request' | 'response'] : conditionKinds);
        return scanConfig(value)
          .tokens.filter(token => token.kind !== 'comment')
          .map(token => value.slice(token.from, token.to));
      })
      .filter(value => value.length > 0);
  const includedTargets = (text: string) => {
    const {blocks} = scanConfig(text);
    let outside = text;
    for (const block of [...blocks].reverse()) outside = outside.slice(0, block.from) + '\n' + outside.slice(block.to);
    return ruleFormValues(outside, conditionKinds);
  };
  return JSON.stringify([values(before), includedTargets(before)]) === JSON.stringify([values(after), includedTargets(after)]);
}
