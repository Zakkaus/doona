import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {ApiError} from '../../api/error';
import {translate, type Translator} from '../../i18n';
import type {ConfigSource} from '../../api/model';
import type {PendingRule} from '../../store';
import {byFile, insertRules, partialFailure, pendingView, ruleFailure} from './pending';
const t: Translator = (key, params, pluralParam, precision) => translate('en', key, params, pluralParam, precision);

async function held() {
  const api = createMockApi();
  const [{rules}, {sources}, dns] = await Promise.all([api.rules(), api.config(), api.dnsRules()]);
  const included = rules.find(rule => rule.rule_id === 'r7')!;
  included.source = {...included.source!, source_id: 'src-rules'};
  const rule = (id: number, before: string, condition: string): PendingRule => {
    const anchor = rules.find(rule => rule.rule_id === before)!;
    return {list: 'routing', id, condition, outbound: 'proxy', must: false, before: anchor, sourceId: anchor.source!.source_id};
  };
  return {rules, sources, dns, rule};
}

it('writes every held rule of a file in one text, each before its rule and in the order held', async () => {
  const {sources, rule} = await held();
  const main = sources.find(source => source.id === 'src-main')!;
  const text = insertRules(sources, main, [rule(2, 'r5', 'dip(1.1.1.1)'), rule(1, 'r5', 'domain(full: a.example)'), rule(3, 'r1', 'domain(full: b.example)')])!;
  const lines = text.split('\n');
  const at = (needle: string) => lines.findIndex(line => line.includes(needle));
  expect(at('domain(full: b.example) -> proxy')).toBe(at('pname(NetworkManager') - 1);
  expect(at('domain(full: a.example) -> proxy')).toBe(at('domain(geosite:telegram)') - 2);
  expect(at('dip(1.1.1.1) -> proxy')).toBe(at('domain(geosite:telegram)') - 1);
  expect(lines).toHaveLength(main.content!.split('\n').length + 3);
  // A rule that is no longer on its line stops the whole file.
  expect(
    insertRules(sources, {...main, content: main.content!.replace('domain(geosite:telegram)', 'domain(geosite: moved)')}, [rule(1, 'r5', 'dip(1.1.1.1)')])
  ).toBeNull();
});

it('writes routing and DNS rules held for one file together, each before its rule', async () => {
  const {sources, dns, rule} = await held();
  const main = sources.find(source => source.id === 'src-main')!;
  const fallback = dns.request.find(rule => rule.kind === 'fallback')!;
  const answer = dns.response.find(rule => rule.expression.startsWith('ip(geoip: private)'))!;
  const request: PendingRule = {
    list: 'request',
    id: 2,
    condition: 'qname(full: a.example)',
    outbound: 'reject',
    must: false,
    before: fallback,
    sourceId: 'src-main'
  };
  const response: PendingRule = {...request, list: 'response', id: 3, condition: 'ip(1.2.3.4)', outbound: 'accept', before: answer};
  const lines = insertRules(sources, main, [rule(1, 'r5', 'dip(1.1.1.1)'), request, response])!.split('\n');
  const at = (needle: string) => lines.findIndex(line => line.includes(needle));
  expect(lines[at('fallback: cloudflare') - 1]).toBe('      qname(full: a.example) -> reject');
  expect(lines[at('ip(geoip: private) && !qname') - 1]).toBe('      ip(1.2.3.4) -> accept');
  expect(at('dip(1.1.1.1) -> proxy')).toBe(at('domain(geosite:telegram)') - 1);
  // A DNS rule whose line changed since it was held stops the file, as a routing rule does.
  const moved = {...main, content: main.content!.replace('ip(geoip: private) &&', 'ip(geoip: moved) &&')};
  expect(insertRules([moved], moved, [response])).toBeNull();
});

it('opens one block for every rule held for the end of a DNS list the text lacks, in the file it was held for', () => {
  const content = 'dns {\n  routing {\n    request {\n      fallback: asis\n    }\n  }\n}\nrouting {\n  fallback: direct\n}\n';
  const source = {id: 'dns', path: '/etc/honk/dns.dae', content, writable: true} as ConfigSource;
  const end = (id: number, condition: string): PendingRule => ({
    list: 'response',
    id,
    condition,
    outbound: 'reject',
    must: false,
    before: null,
    sourceId: 'dns'
  });
  expect(insertRules([source], source, [end(4, 'ip(10.0.0.2)'), end(3, 'ip(10.0.0.1)')])).toBe(
    'dns {\n  routing {\n    request {\n      fallback: asis\n    }\n    response {\n      ip(10.0.0.1) -> reject\n      ip(10.0.0.2) -> reject\n    }\n  }\n}\nrouting {\n  fallback: direct\n}\n'
  );
  // Once the block exists the next rule goes at its end, not into a second block.
  const written = insertRules([source], source, [end(3, 'ip(10.0.0.1)')])!;
  expect(insertRules([{...source, content: written}], {...source, content: written}, [end(5, 'ip(10.0.0.3)')])).toContain(
    '    response {\n      ip(10.0.0.1) -> reject\n      ip(10.0.0.3) -> reject\n    }\n'
  );
  // The list's end now in another file, or in two, is not a place to write to.
  const other = {...source, id: 'other'};
  expect(insertRules([{...source, content: 'routing {\n  fallback: direct\n}\n'}, other], source, [end(3, 'ip(10.0.0.1)')])).toBeNull();
  expect(insertRules([source, other], source, [end(3, 'ip(10.0.0.1)')])).toBeNull();
});

it('groups held rules by file and says so only when there is more than one', async () => {
  const {rule} = await held();
  const one = [rule(1, 'r5', 'dip(1.1.1.1)'), rule(2, 'r1', 'dip(2.2.2.2)')];
  expect(byFile(one)).toHaveLength(1);
  expect(pendingView(one, null, [], t)).toMatchObject({
    title: 'Pending: 2',
    files: null,
    rows: [{line: 'dip(1.1.1.1) -> proxy', position: 'Before rule 8'}, {}]
  });
  const two = [...one, rule(3, 'r7', 'dip(3.3.3.3)')];
  expect(byFile(two).map(group => group.map(rule => rule.id))).toEqual([[1, 2], [3]]);
  expect(pendingView(two, null, [], t)!.files).toBe('Writes 2 files');
  expect(translate('en', 'rule.applyFiles', {n: 3, files: 1}, 'files')).toBe('Apply (3); writes 1 file');
  expect(translate('en', 'rule.applyFiles', {n: 1, files: 2}, 'files')).toBe('Apply (1); writes 2 files');
  expect(pendingView([], null, [], t)).toBeNull();
  // Both kinds remain visible in the workspace.
  const dns: PendingRule = {list: 'response', id: 4, condition: 'ip(1.2.3.4/32)', outbound: 'reject', must: false, before: null, sourceId: 'src-main'};
  const {sources} = await createMockApi().config();
  expect(pendingView([...one, dns], null, sources, t)).toMatchObject({
    title: 'Pending: 3',
    rows: [{}, {}, {line: 'ip(1.2.3.4/32) -> reject', position: 'Last'}]
  });
  // A list with no block of its own gets one when the rule is written.
  const unlisted = sources.map(source => ({...source, content: source.content?.replace(/ {4}response \{\n[\s\S]*? {4}\}\n/, '')}));
  expect(pendingView([dns], null, unlisted, t)!.rows[0].position).toBe('New response block, as its first rule');
});

it('explains a refused write with its diagnostics, restart-only settings or the failure itself', async () => {
  const {sources} = await createMockApi().config();
  const diagnostic = {level: 'error' as const, source_id: 'src-main', line: 44, column: 3, span: null, code: 'unknown-outbound', message: 'no group nope'};
  expect(ruleFailure(null, [diagnostic], sources, t)).toEqual({
    text: 'Validation found 1 error; nothing written',
    lines: ['config.dae line 44: Backend message: no group nope']
  });
  expect(ruleFailure(null, [{...diagnostic, code: 'unsupported_value'}], sources, t).lines).toEqual(['config.dae line 44: Unsupported value: no group nope']);
  const restart = new ApiError(422, 'validation_failed', 'invalid', undefined, {
    diagnostics: [{...diagnostic, line: null, code: 'restart-required', message: 'global.tproxy_port'}]
  });
  expect(ruleFailure(restart, null, sources, t).text).toContain('1 setting takes effect only after a restart');
  expect(ruleFailure(new Error('offline'), null, sources, t)).toEqual({text: 'Could not write the configuration: offline', lines: []});
  const refused = ruleFailure(new ApiError(503, 'backend_unavailable', 'Try later', 'rule-17'), null, sources, t);
  expect(refused.text).toContain('request_id: rule-17');
  expect(refused.toastText).not.toContain('request_id');
  expect(refused.requestId).toBe('rule-17');
  expect(partialFailure(refused, 1, 2, t).requestId).toBe('rule-17');
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
