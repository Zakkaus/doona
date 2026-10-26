import {blockFields, scanConfig, unquote} from '../../../src/dae/text';
import {findBlocks} from './ruleDraft';
import {describeRule, describeTarget, phraseText} from './describe';
import type {Messages} from './i18n/en';
import {parseRuleList, type RuleListKind} from './ruleDraft';

export function ruleReview(before: string, after: string, kind: RuleListKind, t: Messages): string[] {
  const previous = parseRuleList(before, kind).rows;
  const next = parseRuleList(after, kind).rows;
  const removed = previous.filter(row => !row.fallback);
  const added = next.filter(row => !row.fallback);
  for (let i = removed.length - 1; i >= 0; i--) {
    const match = added.findIndex(row => row.expression === removed[i].expression && row.target === removed[i].target);
    if (match >= 0) {
      removed.splice(i, 1);
      added.splice(match, 1);
    }
  }
  const summary = [
    ...removed.map(row => t.reviewRuleRemoved.replace('{rule}', phraseText(describeRule(row.conditions, row.target), t))),
    ...added.map(row => t.reviewRuleAdded.replace('{rule}', phraseText(describeRule(row.conditions, row.target), t)))
  ];
  const oldFallback = previous.find(row => row.fallback)?.target;
  const fallback = next.find(row => row.fallback)?.target;
  if (oldFallback !== fallback)
    summary.push(
      t.reviewRuleFallback
        .replace('{label}', kind === 'routing' ? t.fallback : kind === 'request' ? t.dnsFallback : t.dnsResponseFallback)
        .replace('{target}', fallback ? phraseText(describeTarget(fallback), t) : t.defaultValue)
    );
  if (!summary.length && before !== after) summary.push(t.reviewRuleOrder);
  return summary;
}

export function dnsReview(before: string, after: string, t: Messages): string[] {
  const servers = (text: string) => findBlocks(text, ['dns', 'upstream']).flatMap(block => blockFields(text, block, scanConfig(text).tokens));
  const previous = servers(before);
  const next = servers(after);
  const summary = previous.filter(field => !next.some(item => item.name === field.name)).map(field => t.reviewServerRemoved.replace('{name}', field.name));
  for (const field of next) {
    const old = previous.find(item => item.name === field.name);
    if (!old || old.value !== field.value)
      summary.push((old ? t.reviewServerChanged : t.reviewServerAdded).replace('{name}', field.name).replace('{url}', unquote(field.value)));
  }
  for (const kind of ['request', 'response'] as const) {
    const section = (text: string) => {
      const block = findBlocks(text, ['dns', 'routing', kind])[0];
      return block ? text.slice(block.from, block.to) : '';
    };
    if (section(before) !== section(after)) summary.push(...ruleReview(before, after, kind, t));
  }
  return summary.length ? summary : [t.reviewRuleOrder];
}
