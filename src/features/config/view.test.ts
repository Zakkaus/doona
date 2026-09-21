import {expect, it} from 'vitest';
import {configNotes} from '../../api/mock/fixtures';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {sourceView, diagnosticRows, wizardInitial, wizardRows, sectionSummaries, sectionRange, sectionMarks, sourceMarks, splice} from './view';
import {scanConfig} from './blocks';
import type {ConfigSource} from '../../api/model';
import {validationSources} from './names';
const t: Translator = (key, params) => translate('en', key, params);
it('keeps hidden source paths out of source labels and exposes content availability', async () => {
  const configSources = (await createMockApi().config()).sources;
  const source = {...configSources[0], id: 'abcdef012345', path: '<redacted>', content: undefined, writable: false};
  const row = sourceView(source, 'en-US', t);
  expect(row.label).not.toContain('<redacted>');
  expect(row.hasContent).toBe(false);
  expect(row.tone).toBe('muted');
  expect(sourceView(configSources[0], 'en-US', t).label).toBe(configSources[0].path);
});
it('projects source locations without inventing a line for source-wide diagnostics', async () => {
  const configSources = (await createMockApi().config()).sources;
  const rows = diagnosticRows([configNotes[0], {...configNotes[0], source_id: 'missing', line: null}], configSources, 'en-US', t);
  expect(rows[0].where).toBe('config.dae:5');
  expect(rows[0].tone).toBe('warn');
  expect(rows[1].where).toBe('missing');
  expect(rows[1].inline).toBe(configNotes[0].message);
});
it('initializes empty setup and preserves opaque subscription lines while hiding blank lines', () => {
  const empty = wizardInitial('');
  expect(empty.rules).not.toBe('keep');
  expect(empty.subscriptions).toEqual([]);
  const state = wizardInitial("subscription {\n  a: 'https://example.org/sub'\n}\n");
  expect(state.rules).toBe('keep');
  state.subscriptions = [
    {name: '', url: '', raw: '  '},
    {name: '', url: '', raw: 'file: /etc/nodes'},
    {name: 'bad', url: 'ftp://example.org'}
  ];
  const view = wizardRows(state, undefined, t);
  expect(view.rows.map(row => row.index)).toEqual([1, 2]);
  expect(view.rows[0].raw).toBe('file: /etc/nodes');
  expect(view.rows[1].error).toBe(t('config.wizardSubscriptionHelp'));
  expect(view.groupUsedText).toContain('proxy');
});

function source(content: string, id = 'main'): ConfigSource {
  return {
    id,
    kind: id === 'main' ? 'main' : 'include',
    path: id === 'main' ? '/etc/honk/config.dae' : '/etc/honk/rules.dae',
    content,
    writable: true,
    content_sha256: '',
    bytes: content.length,
    line_count: content.split('\n').length,
    loaded_at: ''
  };
}

it.each(['\n', '\r\n'])('splices only the selected section, preserving surrounding bytes with %j', newline => {
  const before = ['# untouched', 'global { log_level: info }', '  '].join(newline);
  const section = ['routing {', '  fallback: direct', '}'].join(newline);
  const after = [' # keep this comment', "node { a: 'vless://x' }", ''].join(newline);
  const text = before + section + after;
  const block = scanConfig(text).blocks.find(block => block.name === 'routing')!;
  const edited = section.replace('direct', 'proxy');
  expect(splice(text, block, edited)).toBe(before + edited + after);
  expect(sectionRange(source(text), block)).toBe('config.dae:3-5');
});

it('splices a final section without adding a trailing newline', () => {
  const text = '# prefix\nrouting { fallback: direct }';
  expect(splice(text, scanConfig(text).blocks[0], 'routing { fallback: block }')).toBe('# prefix\nrouting { fallback: block }');
});

it('keeps nested blocks inside their module and separates routing occurrences by file', () => {
  const main = source(`dns {
  upstream { a: 'udp://1.1.1.1:53' }
  routing {
    request { qname(example.org) -> a }
    response { ip(geoip:private) -> reject }
  }
}
routing {
  domain(example.org) -> proxy
  nested { domain(nested.org) -> direct }
  fallback: proxy
}`);
  const include = source('routing { fallback: direct }', 'include');
  const cards = sectionSummaries([main, include], t);
  expect(cards.map(card => card.kind)).toEqual(['global', 'subscription', 'node', 'group', 'dns', 'routing', 'routing']);
  expect(cards.find(card => card.kind === 'dns')?.summary).toBe('1 upstreams, 1 request rules, 1 response rules');
  expect(cards.filter(card => card.kind === 'routing').map(card => [card.range, card.summary])).toEqual([
    ['config.dae:8-12', '1 rule · fallback: proxy'],
    ['rules.dae:1-1', '0 rules · fallback: direct']
  ]);
  expect(cards[0].block).toBeNull();
  expect(cards[0].summary).toContain('config.dae');
});

it('maps only diagnostics within the edited section using its current line count', () => {
  const text = '# before\n\nglobal { log_level: info }\nrouting {\n  fallback: direct\n}';
  const block = scanConfig(text).blocks[1];
  const diagnostic = {...configNotes[0], source_id: 'main', level: 'error' as const};
  const marks = sectionMarks(
    [
      {...diagnostic, line: 3},
      {...diagnostic, line: 4},
      {...diagnostic, line: 7},
      {...diagnostic, line: 8},
      {...diagnostic, line: null},
      {...diagnostic, source_id: 'other', line: 5}
    ],
    'main',
    block,
    'routing {\n  domain(example.org) -> proxy\n  fallback: direct\n}'
  );
  expect(marks.map(mark => [mark.line, mark.column])).toEqual([
    [1, 3],
    [4, 3]
  ]);
});

it('withholds editing for credential sources and native_api sections', () => {
  const hidden = {...source(''), content: undefined};
  const cards = sectionSummaries([hidden, source('experimental { native_api { token: redacted } }', 'include')], t);
  expect(cards.filter(card => card.kind === 'experimental.native_api')).toMatchObject([{block: null, note: t('config.incomplete')}]);
  expect(cards.find(card => card.id === 'main')).toMatchObject({block: null, note: t('config.contentCredential')});
});

it('marks only the edited source while retaining cross-source diagnostic locations', () => {
  const main = source('global {}');
  const include = source('routing {}', 'include');
  const own = {...configNotes[0], source_id: 'main', line: 1};
  const other = {...own, source_id: 'include', line: 8};
  expect(sourceMarks([other, own, {...own, line: null}], main.id).map(mark => mark.line)).toEqual([1]);
  expect(diagnosticRows([other], [main, include], 'en-US', t)[0]).toMatchObject({sourceId: 'include', where: 'rules.dae:8'});
});

it('constructs main-first candidates with include paths and refuses missing context', () => {
  const main = source("include { 'rules.dae' }\ngroup { proxy {} }");
  const include = source('routing { fallback: proxy }', 'include');
  expect(validationSources([include, main], {id: include.id, content: 'routing { fallback: direct }'})).toEqual([
    {id: main.id, path: main.path, content: main.content},
    {id: include.id, path: include.path, content: 'routing { fallback: direct }'}
  ]);
  expect(validationSources([include])).toBeNull();
  expect(validationSources([main, {...include, content: undefined}])).toBeNull();
  expect(validationSources([{...main, path: '<redacted>'}, include])![0]).toEqual({id: main.id, content: main.content});
});
