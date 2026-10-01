import {expect, it} from 'vitest';
import {configNotes, version} from '../../api/mock/fixtures';
import {createMockApi} from '../../api/mock';
import {engineOf} from '../../api/engines';
import {translate, type Translator} from '../../i18n';
import {
  configMetadata,
  saveReason,
  saveView,
  validateReason,
  sourceView,
  readOnlyBadge,
  diagnosticRows,
  diagnosticSummary,
  diagnosticsOpen,
  sectionSummaries,
  sourceMarks
} from './view';
import type {ConfigSource} from '../../api/model';
import {validationSources} from '../../dae/sources';
import {diagnose} from '../../api/mock/config';
const t: Translator = (key, params) => translate('en', key, params);
const honk = engineOf(version);
it('keeps hidden source paths out of source labels', async () => {
  const configSources = (await createMockApi().config()).sources;
  const source = {...configSources[0], id: 'abcdef012345', path: '<redacted>', writable: false};
  const row = sourceView(source, 'en-US', t);
  expect(row.label).not.toContain('<redacted>');
  expect(sourceView(configSources[0], 'en-US', t).label).toBe(configSources[0].path);
});
it('counts a source in lines and bytes and leaves its load time to the tooltip', () => {
  const source = {
    id: 's',
    path: 'a.dae',
    kind: 'main',
    content: 'a\nb',
    content_sha256: '0'.repeat(64),
    bytes: 102,
    writable: true,
    loaded_at: '2026-09-27T09:54:47Z',
    line_count: 2
  } as const;
  const row = sourceView(source, 'en-US', t);
  expect(row.facts).toBe('2 lines, 102 B');
  expect(sourceView({...source, line_count: 1}, 'en-US', t).facts).toBe('1 line, 102 B');
  expect(row.loaded).toMatch(/^Loaded: .*:47/);
});
it('names the one reason a source is read-only', () => {
  const reason = (kind: ConfigSource['kind'], writable: boolean, configWritable: boolean, complete?: boolean) =>
    readOnlyBadge({kind, writable, content: ''}, configWritable, complete, honk, t)?.reason ?? null;
  // Generated and subscription sources are never writable, with writes on or off.
  expect(reason('generated', false, true)).toBe('generated');
  expect(reason('generated', false, false)).toBe('generated');
  expect(reason('subscription', false, true)).toBe('subscription');
  expect(reason('subscription', false, false)).toBe('subscription');
  // Writes off server-wide: every main and include file is read-only for that reason alone.
  expect(reason('main', false, false)).toBe('disabled');
  expect(reason('include', true, false)).toBe('disabled');
  // Writes on, but the file refused: a listener block in the text names the secret, and nothing else does, since
  // honk also refuses the includes it writes itself.
  expect(reason('main', false, true)).toBe('refused');
  expect(reason('include', false, true)).toBe('refused');
  const listener = (content: string) => readOnlyBadge({kind: 'main', writable: false, content}, true, true, honk, t)?.reason;
  expect(listener("experimental {\n  native_api { listen: '127.0.0.1:9090' }\n}")).toBe('secret');
  expect(listener("clash_api { secret: '<redacted>' }")).toBe('secret');
  expect(listener('# native_api is off\nglobal { log_level: info }')).toBe('refused');
  // Another engine's reasons are unknown, so the same file is only read-only.
  expect(readOnlyBadge({kind: 'main', writable: false, content: "clash_api { secret: '<redacted>' }"}, true, true, engineOf(undefined), t)?.reason).toBe(
    'refused'
  );
  expect(reason('main', true, true)).toBeNull();
  expect(reason('include', true, true)).toBeNull();
  // Writes allowed, but the text arrived with values hidden: saving it back would drop them. Unknown is not a reason yet.
  expect(reason('main', true, true, false)).toBe('redacted');
  expect(reason('include', true, true, false)).toBe('redacted');
  expect(reason('main', true, true, true)).toBeNull();
  expect(reason('main', false, true, false)).toBe('refused');
  expect(reason('generated', false, true, false)).toBe('generated');
  const badge = readOnlyBadge({kind: 'generated', writable: false, content: ''}, true, true, honk, t)!;
  expect(badge.label).toBe('Generated');
  // The line under the text already says why; only the write switch needs more than that line holds.
  expect(badge.help).toBeUndefined();
  expect(readOnlyBadge({kind: 'main', writable: false, content: ''}, false, true, honk, t)!.help).toEqual({title: 'Read-only', text: t('config.readOnlyHelp')});
  expect(readOnlyBadge({kind: 'main', writable: false, content: ''}, true, true, honk, t)!.help).toBeUndefined();
  expect(readOnlyBadge({kind: 'main', writable: false, content: ''}, true, true, honk, t)!.label).toBe('Read-only');
  expect(readOnlyBadge({kind: 'main', writable: false, content: 'clash_api { }'}, true, true, honk, t)!.label).toBe('Contains secrets');
  expect(readOnlyBadge({kind: 'main', writable: false, content: ''}, false, true, honk, t)!.label).toBe('Read-only');
  expect(readOnlyBadge({kind: 'subscription', writable: false, content: ''}, true, true, honk, t)!.label).toBe('Subscription');
  expect(readOnlyBadge({kind: 'main', writable: true, content: ''}, true, false, honk, t)!.label).toBe(t('config.redactedSource'));
  // Each reason has its own line under the text.
  const notes = (['generated', 'subscription'] as const).map(kind => readOnlyBadge({kind, writable: false, content: ''}, true, true, honk, t)!.note);
  notes.push(
    readOnlyBadge({kind: 'main', writable: false, content: ''}, false, true, honk, t)!.note,
    readOnlyBadge({kind: 'main', writable: false, content: 'clash_api { }'}, true, true, honk, t)!.note,
    readOnlyBadge({kind: 'main', writable: false, content: ''}, true, true, honk, t)!.note
  );
  notes.push(readOnlyBadge({kind: 'main', writable: true, content: ''}, true, false, honk, t)!.note);
  expect(notes).toEqual([
    t('config.generatedNote'),
    t('config.subscriptionNote'),
    t('config.readOnlyNote'),
    t('config.secretNote'),
    t('config.refusedNote'),
    t('config.redactedNote')
  ]);
});
it('projects source locations without inventing a line for source-wide diagnostics', async () => {
  const configSources = (await createMockApi().config()).sources;
  const rows = diagnosticRows([configNotes[0], {...configNotes[0], source_id: 'missing', line: null}], configSources, 'en-US', t);
  expect(rows[0].where).toBe('config.dae:5');
  expect(rows[0].tone).toBe('warn');
  expect(rows[1].where).toBe('missing');
  expect(rows[1].text).toBe(t('ui.valuePair', {label: 'missing', value: t('ui.backendMessage', {message: configNotes[0].message})}));
  expect(rows[1].backend).toBeNull();
});
it('shows the backend words of a reused code once, in the detail', async () => {
  const configSources = (await createMockApi().config()).sources;
  const [row] = diagnosticRows([{...configNotes[0], code: 'unsupported_value', line: null}], configSources, 'en-US', t);
  expect(row.message).toBe(t('ui.backend.unsupportedValue'));
  expect(row.backend).toBe(configNotes[0].message);
  expect(row.text).not.toContain(configNotes[0].message);
});
it.each([
  ['a line in the source on show', 'main', 5, 'Line 5: No group named "alpha"', 'jump'],
  ['the source on show as a whole', 'main', null, 'No group named "alpha"', null],
  ['a line in another source', 'include', 8, 'rules.dae line 8: No group named "alpha"', 'open'],
  ['another source as a whole', 'include', null, 'rules.dae: No group named "alpha"', 'open']
] as const)('lists %s with its place and action', (_, sourceId, line, text, action) => {
  const item = {...configNotes[0], source_id: sourceId, line, code: 'unknown_outbound', message: '', params: {name: 'alpha'}};
  expect(diagnosticRows([item], [source(''), source('', 'include')], 'en-US', t, 'main')[0]).toMatchObject({text, action});
});
it('counts repeated diagnostics and keys errors by what they say, not where', () => {
  const error = {...configNotes[0], level: 'error' as const, code: 'other', message: 'Bad'};
  const rows = diagnosticRows([error, error, {...error, line: 9}, configNotes[0]], [], 'en-US', t);
  const summary = diagnosticSummary(rows);
  expect(summary).toMatchObject({errors: 3, warnings: 1});
  expect(summary.errorKeys).toHaveLength(1);
  expect(diagnosticSummary(diagnosticRows([{...error, message: 'Other'}], [], 'en-US', t)).errorKeys).not.toEqual(summary.errorKeys);
});
it.each([
  ['errors open the list', ['a'], null, true],
  ['warnings alone leave it shut', [], null, false],
  ['a collapse holds while the errors are the same', ['a'], {open: false, errorKeys: ['a', 'b']}, false],
  ['a new error opens it again', ['a', 'c'], {open: false, errorKeys: ['a']}, true],
  ['an open holds without errors', [], {open: true, errorKeys: []}, true]
] as const)('%s', (_, errorKeys, choice, open) => {
  expect(diagnosticsOpen([...errorKeys], choice && {...choice, errorKeys: [...choice.errorKeys]})).toBe(open);
});
it('keeps a diagnostic row id when the diagnostics before it go away', async () => {
  const configSources = (await createMockApi().config()).sources;
  const other = {...configNotes[0], line: 9, message: 'Another warning'};
  const [, before] = diagnosticRows([configNotes[0], other], configSources, 'en-US', t);
  const [after] = diagnosticRows([other], configSources, 'en-US', t);
  expect(after.id).toBe(before.id);
  expect(diagnosticRows([configNotes[0]], configSources, 'en-US', t)[0].id).not.toBe(before.id);
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
  const cards = sectionSummaries([main, include], honk, 'en', t);
  expect(cards.map(card => card.kind)).toEqual(['global', 'subscription', 'node', 'group', 'dns', 'routing', 'routing']);
  expect(cards.find(card => card.kind === 'dns')?.summary).toBe('1 upstream, 1 request rule, 1 response rule');
  expect(cards.filter(card => card.kind === 'routing').map(card => [card.range, card.summary])).toEqual([
    ['config.dae:8-12', '1 rule, fallback: proxy'],
    ['rules.dae:1-1', '0 rules, fallback: direct']
  ]);
  expect(cards[0].block).toBeNull();
  expect(cards[0].summary).toContain('config.dae');
  // Each section links the page for what it defines; the rule sections open their rule lists.
  expect(cards.map(card => card.href)).toEqual([
    '#/config?tab=global',
    '#/nodes',
    '#/nodes',
    '#/policies',
    '#/rules?tab=dns',
    '#/rules?tab=list',
    '#/rules?tab=list'
  ]);
});

it('shows the same localized diagnostic in rows and both editor marks', () => {
  const text = 'routing {\n  fallback: nowhere\n}\n';
  const [item] = diagnose('main', text, new Set(), 'full');
  const translateTW: Translator = (key, params) => translate('zh-TW', key, params);
  const summary = translateTW('config.diagnostic.unknownOutbound', {name: 'nowhere'});
  const described = translateTW('config.backendDetail', {text: summary, message: 'No group named "nowhere"'});
  const rows = diagnosticRows([item], [source(text)], 'zh-TW', translateTW);
  expect(rows[0].message).toBe(summary);
  expect(rows[0].backend).toBe('No group named "nowhere"');
  expect(sourceMarks([item], 'main', translateTW)[0].message).toBe(described);
  // The page's own words already are the backend's in English.
  expect(sourceMarks([item], 'main', t)[0].message).toBe('No group named "nowhere"');
});

it('keeps backend detail separate in rows and editor marks', () => {
  const item = {...configNotes[0], code: 'duplicate-subscription-entry', message: 'Original backend detail'};
  const translateTW: Translator = (key, params) => translate('zh-TW', key, params);
  const row = diagnosticRows([item], [], 'zh-TW', translateTW)[0];
  const mark = sourceMarks([item], item.source_id, translateTW)[0];
  expect(row.message).toBe(translateTW('ui.backend.duplicateSubscriptionEntry'));
  expect(row.backend).toBe('Original backend detail');
  expect(mark.message).toContain(row.message);
  expect(mark.message).toContain('Original backend detail');
});

it('shows a backend diagnostic that lacks the demo parameters in its own words', () => {
  const item = {...configNotes[0], code: 'include_not_found', message: 'No include-resolution base'};
  const summary = t('ui.backendMessage', {message: 'No include-resolution base'});
  const row = diagnosticRows([item], [], 'en-US', t)[0];
  expect(row.message).toBe(summary);
  expect(row.text).not.toContain('{path}');
  expect(sourceMarks([item], item.source_id, t)[0].message).toBe(summary);
});

it('does not merge diagnostics with different parameters', () => {
  const item = {...configNotes[0], code: 'unknown_outbound', message: '', params: {name: 'alpha'}};
  const other = {...item, params: {name: 'beta'}};
  expect(diagnosticRows([item, other], [], 'en-US', t).map(row => row.message)).toEqual(['No group named "alpha"', 'No group named "beta"']);
});

it('withholds editing for native_api sections', () => {
  const cards = sectionSummaries([source(''), source('experimental { native_api { token: redacted } }', 'include')], honk, 'en', t);
  expect(cards.filter(card => card.kind === 'experimental.native_api')).toMatchObject([{block: null, note: t('config.incomplete')}]);
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
  const cards = sectionSummaries([main], honk, 'en', t);
  expect(cards.find(card => card.kind === 'subscription')?.summary).toBe('2 subscriptions');
  expect(cards.find(card => card.kind === 'node')?.summary).toBe('1 node');
  expect(cards.find(card => card.kind === 'routing')?.summary).toBe('2 rules, fallback: proxy');
});

it('keeps a card id when text before the section changes', () => {
  const id = (text: string) => sectionSummaries([source(text)], honk, 'en', t).find(card => card.kind === 'routing')!.id;
  expect(id('# a\nrouting { fallback: direct }')).toBe(id('# a longer comment\n\nrouting { fallback: direct }'));
});

it('marks only the edited source while retaining cross-source diagnostic locations', () => {
  const main = source('global {}');
  const include = source('routing {}', 'include');
  const own = {...configNotes[0], source_id: 'main', line: 1};
  const other = {...own, source_id: 'include', line: 8};
  expect(sourceMarks([other, own, {...own, line: null}], main.id, t).map(mark => mark.line)).toEqual([1]);
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
  expect(validationSources([{...main, path: '<redacted>'}, include])![0]).toEqual({id: main.id, content: main.content});
});

it('does not submit pathless includes or validate an omitted replacement source', () => {
  const main = source('include {}');
  const include = {...source('routing {}', 'include'), path: '<redacted>'};
  expect(validationSources([main, include])).toEqual([{id: main.id, path: main.path, content: main.content}]);
  expect(validationSources([main, include], {id: include.id, content: 'routing { fallback: direct }'})).toBeNull();
});

it('names group policies in words, keeping one honk does not recognise as written', () => {
  const text =
    'group {\n  fast { policy: min_avg10 }\n  pinned { policy: fixed(0) }\n  picked { policy: select }\n  odd { policy: custom }\n  dae { policy: random }\n}';
  expect(sectionSummaries([source(text)], honk, 'en', t).find(card => card.kind === 'group')?.summary).toBe(
    '5 groups: fast: Fastest on average, pinned: Manual, picked: Manual, odd: custom, dae: random'
  );
});

it('says why Save is disabled, and names the shortcut otherwise', () => {
  expect(saveView('validate', true, null, false, t)).toEqual({disabled: true, tip: t('config.saveValidating')});
  expect(saveView('save', true, null, false, t)).toEqual({disabled: true, tip: t('config.saveShortcut')});
  expect(saveView(null, true, null, true, t)).toEqual({disabled: false, tip: t('config.saveShortcutMac')});
  // A refetch that made the source read-only while a draft was open: Save is refused with the reason.
  expect(saveView(null, false, t('config.secretNote'), false, t)).toEqual({disabled: true, tip: t('config.secretNote')});
});

it('says why Apply is disabled, and nothing while it can run or another change is applied', () => {
  const idle = {busy: false, conflict: false};
  expect(saveReason(idle, t)).toBeNull();
  expect(saveReason({...idle, busy: true, invalid: 'bad'}, t)).toBeNull();
  // The text is still being checked: no reason yet, rather than a wrong one.
  expect(saveReason({...idle, complete: null}, t)).toBeNull();
  expect(saveReason({...idle, complete: false, conflict: true}, t)).toBe(t('config.incomplete'));
  expect(saveReason({...idle, conflict: true, invalid: 'bad'}, t)).toBe('Keep or discard your changes first');
  expect(saveReason({...idle, invalid: 'bad'}, t)).toBe('bad');
});

it('says why Validate is disabled: the main file is not whole, or the file on show is not validated', () => {
  const main = {id: 'main', kind: 'main', content: 'global {}'} as ConfigSource;
  const sub = {id: 'sub', kind: 'subscription', content: 'node {}'} as ConfigSource;
  expect(validateReason([], [main, sub], () => true, t)).toBeNull();
  expect(validateReason(null, [main, sub], () => undefined, t)).toBeNull();
  expect(validateReason(null, [main, sub], () => true, t)).toBe(t('config.validateOther'));
  expect(validateReason(null, [main, sub], () => false, t)).toBe(t('config.validateNoMain'));
});

it('shows one row, the config version, and never the generation id', () => {
  const rows = configMetadata('rev-7', t);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({label: t('config.revision'), value: 'rev-7'});
  expect(t('config.revision')).toBe('Config version');
  for (const locale of ['zh-TW', 'zh-CN'] as const) {
    expect(translate(locale, 'config.revision')).toBe(translate(locale, 'ov.config'));
    expect(translate(locale, 'config.revision')).not.toBe(translate(locale, 'ui.generation'));
  }
  expect(translate('en', 'config.acceptedDiagnostics', {generation: 'gen-3'})).toContain('generation gen-3');
});

it('prefers reported source reasons over inferred credentials and falls back for an unknown reason', () => {
  const source = {kind: 'main' as const, writable: false, content: 'clash_api { secret: masked }'};
  for (const [read_only_reason, key] of [
    ['writes_disabled', 'ui.refusal.writesDisabled'],
    ['store_blocked', 'ui.refusal.storeBlocked'],
    ['listener_secret_source', 'ui.refusal.listenerSecretSource'],
    ['listener_secret_in_content', 'ui.refusal.listenerSecretInContent']
  ] as const) {
    expect(readOnlyBadge({...source, read_only_reason}, true, true, honk, t)).toMatchObject({
      note: t(key),
      label: t(read_only_reason.startsWith('listener_secret_') ? 'config.secretSource' : 'config.readOnly')
    });
  }
  expect(readOnlyBadge({...source, read_only_reason: 'future' as never}, true, true, honk, t)?.reason).toBe('secret');
});

it('does not invent a source filename when no main file exists', () => {
  expect(sectionSummaries([], honk, 'en', t).every(card => card.range === '')).toBe(true);
});
