import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {ApiError} from '../../api/error';
import {translate, type Translator} from '../../i18n';
import type {PendingRule} from '../../store';
import {byFile, insertRules, partialFailure, pendingView, ruleFailure} from './pending';
const t: Translator = (key, params) => translate('en', key, params);

async function held() {
  const api = createMockApi();
  const [{rules}, {sources}] = await Promise.all([api.rules(), api.config()]);
  const rule = (id: number, before: string, condition: string): PendingRule => {
    const anchor = rules.find(rule => rule.rule_id === before)!;
    return {id, condition, outbound: 'proxy', must: false, before: anchor, sourceId: anchor.source!.source_id};
  };
  return {rules, sources, rule};
}

it('writes every held rule of a file in one text, each before its rule and in the order held', async () => {
  const {sources, rule} = await held();
  const main = sources.find(source => source.id === 'src-main')!;
  const text = insertRules(main, [rule(2, 'r5', 'dip(1.1.1.1)'), rule(1, 'r5', 'domain(full: a.example)'), rule(3, 'r1', 'domain(full: b.example)')])!;
  const lines = text.split('\n');
  const at = (needle: string) => lines.findIndex(line => line.includes(needle));
  expect(at('domain(full: b.example) -> proxy')).toBe(at('domain(suffix: doubleclick.net)') - 1);
  expect(at('domain(full: a.example) -> proxy')).toBe(at('domain(geosite: telegram)') - 2);
  expect(at('dip(1.1.1.1) -> proxy')).toBe(at('domain(geosite: telegram)') - 1);
  expect(lines).toHaveLength(main.content!.split('\n').length + 3);
  // A rule that is no longer on its line stops the whole file.
  expect(
    insertRules({...main, content: main.content!.replace('domain(geosite: telegram)', 'domain(geosite: moved)')}, [rule(1, 'r5', 'dip(1.1.1.1)')])
  ).toBeNull();
});

it('groups held rules by file and says so only when there is more than one', async () => {
  const {rule} = await held();
  const one = [rule(1, 'r5', 'dip(1.1.1.1)'), rule(2, 'r1', 'dip(2.2.2.2)')];
  expect(byFile(one)).toHaveLength(1);
  expect(pendingView(one, null, t)).toMatchObject({title: 'Pending: 2', files: null, rows: [{line: 'dip(1.1.1.1) -> proxy', position: 'Before rule 5'}, {}]});
  const two = [...one, rule(3, 'r7', 'dip(3.3.3.3)')];
  expect(byFile(two).map(group => group.map(rule => rule.id))).toEqual([[1, 2], [3]]);
  expect(pendingView(two, null, t)!.files).toBe('Writes 2 files');
  expect(pendingView([], null, t)).toBeNull();
});

it('explains a refused write with its diagnostics, restart-only settings or the failure itself', async () => {
  const {sources} = await createMockApi().config();
  const diagnostic = {level: 'error' as const, source_id: 'src-main', line: 44, column: 3, span: null, code: 'unknown-outbound', message: 'no group nope'};
  expect(ruleFailure(null, [diagnostic], sources, t)).toEqual({
    text: 'Validation found 1 error; nothing written',
    lines: ['config.dae line 44: Backend message: no group nope']
  });
  const restart = new ApiError(422, 'validation_failed', 'invalid', undefined, {
    diagnostics: [{...diagnostic, line: null, code: 'restart-required', message: 'global.tproxy_port'}]
  });
  expect(ruleFailure(restart, null, sources, t).text).toContain('1 setting takes effect only after a restart');
  expect(ruleFailure(new Error('offline'), null, sources, t)).toEqual({text: 'Could not write the configuration: offline', lines: []});
});

it('does not count errors a refusal did not report', async () => {
  const {sources} = await createMockApi().config();
  const warning = {level: 'warning' as const, source_id: 'src-main', line: 44, column: 3, span: null, code: 'unused', message: 'unused'};
  expect(ruleFailure(null, [warning], sources, t).text).toBe('Validation did not pass; nothing written');
});

it('says what an apply wrote before a later file failed, and what is still held', () => {
  const failure = {text: 'Validation found 1 error; nothing written', lines: ['rules.dae line 7: x']};
  expect(partialFailure(failure, 0, 1, t)).toEqual(failure);
  expect(partialFailure(failure, 2, 1, t)).toEqual({
    text: '2 rules written; 1 still held',
    lines: ['Validation found 1 error; nothing written', 'rules.dae line 7: x']
  });
});
