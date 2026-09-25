import {expect, it} from 'vitest';
import {configNotes} from '../../api/mock/fixtures';
import {createMockApi} from '../../api/mock';
import {translate, type Translator} from '../../i18n';
import {sourceView, diagnosticRows, wizardInitial, wizardRows, sectionSummaries, sectionRange, sectionMarks, sourceMarks, splice} from './view';
import {scanConfig} from '../../dae/text';
import type {ConfigSource} from '../../api/model';
import {validationSources} from '../../dae/sources';
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
  expect(rows[1].detail).toBe(t('ui.backendMessage', {message: configNotes[0].message}));
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
  const view = wizardRows(state, 'en', t);
  expect(view.rows.map(row => row.index)).toEqual([1, 2]);
  expect(view.rows[0].raw).toBe('file: /etc/nodes');
  expect(view.rows[1].error).toBe(t('config.wizardSubscriptionHelp'));
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
  const cards = sectionSummaries([main, include], 'en', t);
  expect(cards.map(card => card.kind)).toEqual(['global', 'subscription', 'node', 'group', 'dns', 'routing', 'routing']);
  expect(cards.find(card => card.kind === 'dns')?.summary).toBe('1 upstream, 1 request rule, 1 response rule');
  expect(cards.filter(card => card.kind === 'routing').map(card => [card.range, card.summary])).toEqual([
    ['config.dae:8-12', '1 rule, fallback: proxy'],
    ['rules.dae:1-1', '0 rules, fallback: direct']
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

it('withholds editing for missing source text and native_api sections', () => {
  const hidden = {...source(''), content: undefined};
  const cards = sectionSummaries([hidden, source('experimental { native_api { token: redacted } }', 'include')], 'en', t);
  expect(cards.filter(card => card.kind === 'experimental.native_api')).toMatchObject([{block: null, note: t('config.incomplete')}]);
  expect(cards.find(card => card.id === 'main')).toMatchObject({block: null, note: t('config.contentWithheld')});
  // One card says the main text is withheld; no per-section cards repeat it.
  expect(cards.filter(card => card.note === t('config.contentWithheld'))).toHaveLength(1);
});

it('counts untagged entries and arrows written without spaces', () => {
  const main = source(`subscription {
  tagged: 'https://example.org/a'
  'https://example.org/b'
}
node {
  'vless://x'
}
routing {
  dip(geoip:private)->direct
  domain(example.org) -> proxy
  fallback: proxy
}`);
  const cards = sectionSummaries([main], 'en', t);
  expect(cards.find(card => card.kind === 'subscription')?.summary).toBe('2 subscriptions');
  expect(cards.find(card => card.kind === 'node')?.summary).toBe('1 node');
  expect(cards.find(card => card.kind === 'routing')?.summary).toBe('2 rules, fallback: proxy');
});

it('keeps a card id when text before the section changes', () => {
  const id = (text: string) => sectionSummaries([source(text)], 'en', t).find(card => card.kind === 'routing')!.id;
  expect(id('# a\nrouting { fallback: direct }')).toBe(id('# a longer comment\n\nrouting { fallback: direct }'));
});

it('flags only the row whose value cannot be quoted', () => {
  const state = {
    ...wizardInitial(''),
    subscriptions: [
      {name: 'good', url: 'https://example.org/a'},
      {name: 'bad', url: "https://example.org/it's"},
      {name: "o'neil", url: 'https://example.org/c'}
    ]
  };
  const rows = wizardRows(state, 'en', t).rows;
  expect(rows.map(row => [row.nameError, row.error])).toEqual([
    [undefined, undefined],
    [undefined, t('config.unquotable')],
    [t('config.unquotable'), undefined]
  ]);
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
  expect(validationSources([main, {...include, content: undefined}])).toEqual([{id: main.id, path: main.path, content: main.content}]);
  expect(validationSources([{...main, path: '<redacted>'}, include])![0]).toEqual({id: main.id, content: main.content});
});

it('does not submit pathless includes or validate an omitted replacement source', () => {
  const main = source('include {}');
  const include = {...source('routing {}', 'include'), path: '<redacted>'};
  expect(validationSources([main, include])).toEqual([{id: main.id, path: main.path, content: main.content}]);
  expect(validationSources([main, include], {id: include.id, content: 'routing { fallback: direct }'})).toBeNull();
  expect(validationSources([{...main, content: undefined}, include])).toBeNull();
});

it('describes only the selected template’s groups and omits routing changes for keep', () => {
  const state = {...wizardInitial('group { mix {} }'), group: 'mix'};
  expect(wizardRows(state, 'en', t).groupUsedText).toBeNull();
  expect(wizardRows({...state, rules: 'global'}, 'en', t).groupUsedText).toContain('mix');
  const named = wizardRows({...state, rules: 'standard'}, 'en', t).groupUsedText;
  expect(named).toContain('proxy, auto, telegram, media, apple');
  expect(named).not.toContain('mix');
});

it('names group policies in words, keeping only an expression doona does not know as written', () => {
  const text = 'group {\n  fast { policy: min_avg10 }\n  pinned { policy: fixed(0) }\n  picked { policy: select }\n  odd { policy: custom }\n}';
  expect(sectionSummaries([source(text)], 'en', t).find(card => card.kind === 'group')?.summary).toBe(
    '4 groups: fast: Fastest on average, pinned: Manual, picked: Manual, odd: custom'
  );
});
